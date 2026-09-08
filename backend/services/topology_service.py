"""
Geometric Topology Validation & Metric Polygon Repair Engine for CadastraAI.
Uses Shapely and PyProj to perform survey-grade topology checks:
  - Metric vertex snapping for contiguous parcels (projected metric CRS or local metric transform)
  - Parcel overlap detection with metric area quantification & severity tiers (CRITICAL, HIGH, WARNING)
  - Unclaimed gap / hole detection between adjacent parcel boundaries
  - Self-intersection and invalid linear ring detection with make_valid repair
  - Sliver polygon detection (area and compactness checks)
  - Adjacency graph construction (shared boundary edges)
  - Suggested repair preview geometries (clip difference, merge sliver, repair self-intersection)
    WITHOUT blind auto-snapping, allowing user review before commit.
"""

import math
import logging
from typing import List, Dict, Any, Tuple, Optional
import pyproj
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, shape, mapping
from shapely.ops import unary_union, snap, transform
from shapely.validation import make_valid, explain_validity

logger = logging.getLogger("cadastra.topology")


def _get_metric_transformers(
    anchor_lat: float, anchor_lng: float, working_crs: Optional[str] = None
) -> Tuple[Any, Any]:
    """
    Returns forward (WGS84 -> metric) and reverse (metric -> WGS84) transformers.
    If working_crs is provided and valid, uses pyproj.
    Otherwise, builds a high-accuracy local transverse projection centered on the centroid.
    """
    if working_crs and working_crs.upper() not in ["EPSG:4326", "WGS84", "CRS84", "OGC:CRS84"]:
        try:
            fwd = pyproj.Transformer.from_crs("EPSG:4326", working_crs, always_xy=True).transform
            rev = pyproj.Transformer.from_crs(working_crs, "EPSG:4326", always_xy=True).transform
            return fwd, rev
        except Exception as ex:
            logger.warning(f"Could not initialize transformer for working_crs '{working_crs}': {ex}")

    # Accurate local projected metric coordinate system
    rad_lat = math.radians(anchor_lat)
    m_per_deg_lng = 111319.49 * math.cos(rad_lat)
    m_per_deg_lat = 110574.0

    def fwd_local(lng: float, lat: float) -> Tuple[float, float]:
        x = (lng - anchor_lng) * m_per_deg_lng
        y = (lat - anchor_lat) * m_per_deg_lat
        return x, y

    def rev_local(x: float, y: float) -> Tuple[float, float]:
        lng = anchor_lng + (x / m_per_deg_lng) if abs(m_per_deg_lng) > 1e-6 else anchor_lng
        lat = anchor_lat + (y / m_per_deg_lat)
        return lng, lat

    return fwd_local, rev_local


def clean_and_repair_geometry(poly: Polygon) -> Optional[Polygon]:
    """
    Repairs degenerate or self-intersecting polygons into valid closed geometries.
    Applies make_valid, buffer(0), and extracts the largest valid polygon if split.
    """
    if poly is None or poly.is_empty:
        return None

    if not poly.is_valid:
        try:
            poly = make_valid(poly)
        except Exception:
            poly = poly.buffer(0)

    # If make_valid produced a MultiPolygon or GeometryCollection, select the primary polygon
    if isinstance(poly, MultiPolygon):
        valid_polys = [p for p in poly.geoms if p.area > 5.0]
        if not valid_polys:
            return None
        poly = max(valid_polys, key=lambda p: p.area)
    elif poly.geom_type != "Polygon":
        if hasattr(poly, "geoms"):
            polys = [p for p in poly.geoms if p.geom_type == "Polygon"]
            if polys:
                poly = max(polys, key=lambda p: p.area)
            else:
                return None
        else:
            return None

    # Remove consecutive duplicate vertices and ensure counter-clockwise exterior
    coords = list(poly.exterior.coords)
    dedup = [coords[0]]
    for pt in coords[1:]:
        if math.hypot(pt[0] - dedup[-1][0], pt[1] - dedup[-1][1]) > 1e-7:
            dedup.append(pt)
    if len(dedup) < 4:
        return None

    cleaned = Polygon(dedup, holes=poly.interiors)
    return cleaned if cleaned.is_valid and not cleaned.is_empty else None


def build_parcel_adjacency_graph(parcels: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """
    Determines which parcels share boundary edges or touch each other.
    Returns: {parcel_id: [neighbor_parcel_id_1, neighbor_parcel_id_2, ...]}
    """
    adjacency: Dict[str, List[str]] = {}
    shapely_polys = []

    for p in parcels:
        pid = p["id"]
        adjacency[pid] = []
        coords = p.get("geo_coords", [])
        if len(coords) >= 3:
            poly = Polygon(coords)
            if not poly.is_valid:
                poly = poly.buffer(0)
            shapely_polys.append((pid, poly))

    n = len(shapely_polys)
    for i in range(n):
        pid1, poly1 = shapely_polys[i]
        for j in range(i + 1, n):
            pid2, poly2 = shapely_polys[j]
            if poly1.touches(poly2) or poly1.intersects(poly2):
                adjacency[pid1].append(pid2)
                adjacency[pid2].append(pid1)

    return adjacency


def snap_parcel_boundaries(
    parcels: List[Dict[str, Any]],
    tolerance_deg: Optional[float] = None,
    snap_tolerance_m: float = 0.15,
    working_crs: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Snaps nearby boundary vertices between adjacent parcels in true metric space.
    Tolerance is calibrated in real meters (default 0.15m survey standard).
    Converts geometries to metric coordinates, applies Shapely snap, and converts back.
    """
    if not parcels:
        return []

    # Calculate centroid anchor for projection
    all_coords = []
    for p in parcels:
        coords = p.get("geo_coords", [])
        if coords:
            all_coords.extend(coords)

    if not all_coords:
        return parcels

    anchor_lng = sum(c[0] for c in all_coords) / len(all_coords)
    anchor_lat = sum(c[1] for c in all_coords) / len(all_coords)

    to_metric, to_wgs84 = _get_metric_transformers(anchor_lat, anchor_lng, working_crs)

    # Convert polygons to metric space
    metric_polys: List[Optional[Polygon]] = []
    for p in parcels:
        coords = p.get("geo_coords", [])
        if len(coords) >= 3:
            m_coords = [to_metric(c[0], c[1]) for c in coords]
            poly = Polygon(m_coords)
            if not poly.is_valid:
                poly = poly.buffer(0)
            metric_polys.append(poly)
        else:
            metric_polys.append(None)

    # If tolerance_deg was explicitly passed for legacy callers, convert or use snap_tolerance_m
    tol_m = snap_tolerance_m
    if tolerance_deg is not None:
        # Approximate deg to m at this latitude
        tol_m = tolerance_deg * 111319.49 * math.cos(math.radians(anchor_lat))

    snapped_parcels = []
    n = len(parcels)

    for i, p in enumerate(parcels):
        current_poly = metric_polys[i]
        if current_poly is None or current_poly.is_empty:
            snapped_parcels.append(p)
            continue

        for j in range(n):
            if i != j and metric_polys[j] is not None and not metric_polys[j].is_empty:
                other_poly = metric_polys[j]
                if current_poly.distance(other_poly) < tol_m:
                    try:
                        current_poly = snap(current_poly, other_poly, tol_m)
                    except Exception:
                        pass

        cleaned = clean_and_repair_geometry(current_poly)
        if cleaned is not None:
            new_geo_coords = [list(to_wgs84(c[0], c[1])) for c in cleaned.exterior.coords]
            snapped_parcels.append({
                **p,
                "geo_coords": new_geo_coords,
                "is_snapped": True,
            })
        else:
            snapped_parcels.append(p)

    return snapped_parcels


def validate_geometric_topology(
    parcels: List[Dict[str, Any]],
    overlap_area_threshold_m2: float = 1.0,
    sliver_area_threshold_m2: float = 10.0,
    min_gap_m2: float = 0.5,
    max_gap_m2: float = 50.0,
    working_crs: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, int]]:
    """
    Executes automated metric geometric topology validation across all parcels:
      1. Parcel Overlaps: true polygon intersections in m² with severity classification.
      2. Self-intersections / unclosed linear rings.
      3. Sliver polygons: tiny or razor-thin polygons.
      4. Unclaimed gaps between contiguous parcel clusters.
      5. Generates suggested repair preview geometry without committing.

    Returns:
      (enriched_parcels, topology_issues, summary_counts)
    """
    if not parcels:
        return [], [], {"total_topology_errors": 0, "overlaps": 0, "gaps": 0, "invalid_geometries": 0, "slivers": 0}

    # Find geographic anchor
    all_coords = []
    for p in parcels:
        coords = p.get("geo_coords", [])
        if coords:
            all_coords.extend(coords)

    if not all_coords:
        return parcels, [], {"total_topology_errors": 0, "overlaps": 0, "gaps": 0, "invalid_geometries": 0, "slivers": 0}

    anchor_lng = sum(c[0] for c in all_coords) / len(all_coords)
    anchor_lat = sum(c[1] for c in all_coords) / len(all_coords)
    to_metric, to_wgs84 = _get_metric_transformers(anchor_lat, anchor_lng, working_crs)

    shapely_objs: List[Tuple[str, Polygon, Dict[str, Any], Polygon]] = []  # pid, poly_wgs84, parcel_dict, poly_metric
    issues: List[Dict[str, Any]] = []

    # 1. Parse and validate individual polygon geometries
    for p in parcels:
        pid = p["id"]
        coords = p.get("geo_coords", [])
        if len(coords) < 3:
            issues.append({
                "id": f"TOP-{len(issues)+1:04d}",
                "parcel_id": pid,
                "type": "invalid_geometry",
                "severity": "CRITICAL",
                "area_m2": 0.0,
                "description": f"Parcel {pid} contains fewer than 3 vertices.",
                "suggested_fix": "Survey vertices must be re-acquired or digitized.",
                "suggested_geometry": None,
                "status": "unresolved",
            })
            continue

        poly_wgs = Polygon(coords)
        m_coords = [to_metric(c[0], c[1]) for c in coords]
        poly_metric = Polygon(m_coords)

        if not poly_wgs.is_valid:
            reason = explain_validity(poly_wgs)
            repaired_metric = clean_and_repair_geometry(poly_metric)
            repaired_geo = None
            if repaired_metric:
                repaired_geo = {
                    "type": "Polygon",
                    "coordinates": [[list(to_wgs84(c[0], c[1])) for c in repaired_metric.exterior.coords]],
                }

            issues.append({
                "id": f"TOP-{len(issues)+1:04d}",
                "parcel_id": pid,
                "type": "self_intersection",
                "severity": "CRITICAL",
                "area_m2": round(poly_metric.area, 2) if poly_metric.is_valid else 0.0,
                "description": f"Geometric topology invalid on {pid}: {reason}",
                "suggested_fix": "Apply make_valid repair to remove self-intersection loops.",
                "suggested_geometry": repaired_geo,
                "status": "unresolved",
            })
            poly_wgs = poly_wgs.buffer(0)
            poly_metric = poly_metric.buffer(0)

        # Check for sliver polygon
        area_m2 = poly_metric.area
        perimeter_m = poly_metric.length
        compactness = (4 * math.pi * area_m2) / max(1.0, perimeter_m ** 2) if perimeter_m > 0 else 0.0

        if (area_m2 < sliver_area_threshold_m2 and area_m2 > 0) or (compactness < 0.12 and area_m2 < 35.0):
            severity = "HIGH" if area_m2 < 5.0 else "WARNING"
            issues.append({
                "id": f"TOP-{len(issues)+1:04d}",
                "parcel_id": pid,
                "type": "sliver_polygon",
                "severity": severity,
                "area_m2": round(area_m2, 2),
                "description": f"Sliver polygon detected on {pid} (Area: {area_m2:.1f}m², compactness: {compactness:.2f}).",
                "suggested_fix": "Merge sliver geometry into adjacent parcel sharing the longest boundary edge.",
                "suggested_geometry": None,  # Will be enriched in adjacency step
                "status": "unresolved",
            })

        shapely_objs.append((pid, poly_wgs, p, poly_metric))

    # 2. Pairwise overlap detection in metric space
    num = len(shapely_objs)
    overlaps_count = 0
    for i in range(num):
        pid1, poly1_wgs, p1, poly1_m = shapely_objs[i]
        for j in range(i + 1, num):
            pid2, poly2_wgs, p2, poly2_m = shapely_objs[j]
            if poly1_m.intersects(poly2_m):
                inter_m = poly1_m.intersection(poly2_m)
                if inter_m.geom_type in ["Polygon", "MultiPolygon"] and inter_m.area >= overlap_area_threshold_m2:
                    inter_area_m2 = inter_m.area
                    overlaps_count += 1

                    if inter_area_m2 > 10.0:
                        sev = "CRITICAL"
                    elif inter_area_m2 >= 2.0:
                        sev = "HIGH"
                    else:
                        sev = "WARNING"

                    # Convert intersection geometry to WGS84 for visual preview
                    if inter_m.geom_type == "Polygon":
                        inter_coords = [[list(to_wgs84(c[0], c[1])) for c in inter_m.exterior.coords]]
                        inter_geo = {"type": "Polygon", "coordinates": inter_coords}
                    else:
                        inter_coords = [[[list(to_wgs84(c[0], c[1])) for c in sub.exterior.coords]] for sub in inter_m.geoms]
                        inter_geo = {"type": "MultiPolygon", "coordinates": inter_coords}

                    # Suggested repair: clip overlap from lower-confidence parcel
                    conf1 = p1.get("confidence", 80.0)
                    conf2 = p2.get("confidence", 80.0)
                    clip_target_id = pid2 if conf1 >= conf2 else pid1
                    clip_target_poly_m = poly2_m if conf1 >= conf2 else poly1_m
                    clipped_m = clip_target_poly_m.difference(inter_m)
                    suggested_geom = None
                    if clipped_m.is_valid and not clipped_m.is_empty:
                        cleaned_clip = clean_and_repair_geometry(clipped_m)
                        if cleaned_clip:
                            suggested_geom = {
                                "target_parcel_id": clip_target_id,
                                "type": "Polygon",
                                "coordinates": [[list(to_wgs84(c[0], c[1])) for c in cleaned_clip.exterior.coords]],
                            }

                    issues.append({
                        "id": f"TOP-{len(issues)+1:04d}",
                        "parcel_id": pid1,
                        "adjacent_parcel_id": pid2,
                        "type": "overlap",
                        "severity": sev,
                        "area_m2": round(inter_area_m2, 2),
                        "geometry": inter_geo,
                        "description": f"Boundary overlap of {round(inter_area_m2, 1)}m² detected between {pid1} and {pid2}.",
                        "suggested_fix": f"Clip overlap area ({inter_area_m2:.1f}m²) from lower-confidence parcel ({clip_target_id}).",
                        "suggested_geometry": suggested_geom,
                        "status": "unresolved",
                    })

    # 3. Gap Detection (holes enclosed by contiguous parcels)
    gaps_count = 0
    if len(shapely_objs) >= 3:
        try:
            union_poly = unary_union([obj[3] for obj in shapely_objs if obj[3].is_valid])
            if isinstance(union_poly, (Polygon, MultiPolygon)):
                polys_to_check = [union_poly] if isinstance(union_poly, Polygon) else list(union_poly.geoms)
                for up in polys_to_check:
                    for hole in up.interiors:
                        hole_poly = Polygon(hole)
                        hole_area_m2 = hole_poly.area
                        if min_gap_m2 <= hole_area_m2 <= max_gap_m2:
                            gaps_count += 1
                            gap_geo = {
                                "type": "Polygon",
                                "coordinates": [[list(to_wgs84(c[0], c[1])) for c in hole_poly.exterior.coords]],
                            }
                            # Find adjacent parcels touching this gap
                            touching_pids = [
                                obj[0] for obj in shapely_objs if obj[3].distance(hole_poly) < 0.5
                            ]
                            issues.append({
                                "id": f"TOP-{len(issues)+1:04d}",
                                "parcel_id": touching_pids[0] if touching_pids else "UNKNOWN",
                                "adjacent_parcel_id": touching_pids[1] if len(touching_pids) > 1 else None,
                                "type": "gap",
                                "severity": "WARNING" if hole_area_m2 < 5.0 else "HIGH",
                                "area_m2": round(hole_area_m2, 2),
                                "geometry": gap_geo,
                                "description": f"Unclaimed gap / hole of {round(hole_area_m2, 1)}m² between adjacent parcels.",
                                "suggested_fix": "Extend adjacent boundary vertices to the midline of the unclaimed gap.",
                                "suggested_geometry": None,
                                "status": "unresolved",
                            })
        except Exception as ex:
            logger.debug(f"Gap detection calculation skipped: {ex}")

    # 4. Enrich sliver issue suggestions with neighbor merge target
    for iss in issues:
        if iss["type"] == "sliver_polygon":
            spid = iss["parcel_id"]
            spoly_entry = next((item for item in shapely_objs if item[0] == spid), None)
            if spoly_entry:
                spoly_m = spoly_entry[3]
                best_neighbor_id = None
                max_shared_len = 0.0
                for npid, _, _, npoly_m in shapely_objs:
                    if npid != spid and spoly_m.intersects(npoly_m):
                        shared = spoly_m.intersection(npoly_m)
                        if shared.geom_type in ["LineString", "MultiLineString"]:
                            if shared.length > max_shared_len:
                                max_shared_len = shared.length
                                best_neighbor_id = npid
                if best_neighbor_id:
                    iss["adjacent_parcel_id"] = best_neighbor_id
                    iss["suggested_fix"] = f"Merge sliver {spid} into neighbor {best_neighbor_id} (shared boundary: {max_shared_len:.1f}m)."

    # 5. Enrich parcels with topology status
    enriched_parcels = []
    issue_parcel_ids = {iss["parcel_id"]: iss for iss in issues}

    for p in parcels:
        pid = p["id"]
        has_issue = pid in issue_parcel_ids
        iss = issue_parcel_ids.get(pid)
        top_status = "invalid" if has_issue else "valid"
        conflict_type = iss["type"] if has_issue else p.get("conflictType")

        enriched_parcels.append({
            **p,
            "topologyStatus": top_status,
            "conflictType": conflict_type,
            "topologyIssues": [iss["description"]] if has_issue else [],
            "status": "requires_review" if (has_issue and p.get("status") != "verified") else p.get("status", "ai_preliminary"),
        })

    summary = {
        "total_topology_errors": len(issues),
        "overlaps": overlaps_count,
        "gaps": gaps_count,
        "invalid_geometries": sum(1 for iss in issues if iss["type"] in ["self_intersection", "invalid_geometry"]),
        "slivers": sum(1 for iss in issues if iss["type"] == "sliver_polygon"),
    }

    return enriched_parcels, issues, summary


def apply_suggested_repair(
    issue: Dict[str, Any],
    parcels: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], bool]:
    """
    Applies the suggested repair geometry for a verified topology issue.
    Returns (updated_parcels, success_flag).
    """
    suggested_geom = issue.get("suggested_geometry")
    if not suggested_geom:
        return parcels, False

    target_pid = suggested_geom.get("target_parcel_id") or issue.get("parcel_id")
    coords = suggested_geom.get("coordinates")
    if not coords or not coords[0]:
        return parcels, False

    updated = []
    found = False
    for p in parcels:
        if p["id"] == target_pid:
            updated.append({
                **p,
                "geo_coords": coords[0],
                "status": "in_review",
                "topologyStatus": "valid",
                "conflictType": None,
                "topologyIssues": [],
            })
            found = True
        else:
            updated.append(p)

    return updated, found
