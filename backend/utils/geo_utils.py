import math
from typing import List, Tuple, Dict, Any, Optional
from shapely.geometry import Polygon as ShapelyPolygon, mapping, shape
from shapely.ops import unary_union

# Default Jaipur coordinate anchor
DEFAULT_LAT = 26.9124
DEFAULT_LNG = 75.7873
DEFAULT_LAT_SPAN = 0.007  # ~770m
DEFAULT_LNG_SPAN = 0.008  # ~790m

def pixel_to_geo(
    x: float,
    y: float,
    img_w: int = 1000,
    img_h: int = 1000,
    base_lat: float = DEFAULT_LAT,
    base_lng: float = DEFAULT_LNG,
    lat_span: float = DEFAULT_LAT_SPAN,
    lng_span: float = DEFAULT_LNG_SPAN,
) -> Tuple[float, float]:
    """
    Transforms pixel coordinate (x, y) to geographic (longitude, latitude) EPSG:4326.
    Returns: (longitude, latitude)
    """
    lng = base_lng + (x / max(1, img_w) - 0.5) * lng_span
    lat = base_lat + (0.5 - y / max(1, img_h)) * lat_span
    return round(lng, 6), round(lat, 6)


def geo_to_pixel(
    lng: float,
    lat: float,
    img_w: int = 1000,
    img_h: int = 1000,
    base_lat: float = DEFAULT_LAT,
    base_lng: float = DEFAULT_LNG,
    lat_span: float = DEFAULT_LAT_SPAN,
    lng_span: float = DEFAULT_LNG_SPAN,
) -> Tuple[float, float]:
    """Transforms (longitude, latitude) back to pixel coordinates (x, y)."""
    x = ((lng - base_lng) / lng_span + 0.5) * img_w
    y = (0.5 - (lat - base_lat) / lat_span) * img_h
    return round(x, 1), round(y, 1)


def calculate_polygon_area_m2(coords_lng_lat: List[Tuple[float, float]]) -> float:
    """
    Calculates geodesic polygon surface area in m² using spherical excess / equirectangular approximation.
    """
    if len(coords_lng_lat) < 3:
        return 0.0

    # Convert coordinates to local metric space centered around polygon centroid
    mean_lat = sum(c[1] for c in coords_lng_lat) / len(coords_lng_lat)
    lat_rad = math.radians(mean_lat)

    # 1 deg lat ~ 111,139 m, 1 deg lng ~ 111,139 * cos(lat) m
    m_per_deg_lat = 111139.0
    m_per_deg_lng = 111139.0 * math.cos(lat_rad)

    # Shoelace formula in meters
    n = len(coords_lng_lat)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        x_i = coords_lng_lat[i][0] * m_per_deg_lng
        y_i = coords_lng_lat[i][1] * m_per_deg_lat
        x_j = coords_lng_lat[j][0] * m_per_deg_lng
        y_j = coords_lng_lat[j][1] * m_per_deg_lat
        area += x_i * y_j - x_j * y_i

    return round(abs(area) / 2.0, 2)


def polygon_to_geojson(
    polygon_coords_lng_lat: List[Tuple[float, float]],
    properties: Dict[str, Any],
    feature_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Creates a standard GeoJSON Feature from polygon coordinates [[lng, lat], ...].
    Ensures the coordinate ring is closed.
    """
    coords = list(polygon_coords_lng_lat)
    # Ensure linear ring is closed (first coord == last coord)
    if coords and coords[0] != coords[-1]:
        coords.append(coords[0])

    feature: Dict[str, Any] = {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [coords],
        },
        "properties": properties,
    }
    if feature_id:
        feature["id"] = feature_id
    return feature


def geojson_feature_collection(features: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Wraps a list of GeoJSON features in a FeatureCollection."""
    return {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
        },
        "features": features,
    }


def calculate_iou(poly1: ShapelyPolygon, poly2: ShapelyPolygon) -> float:
    """Calculates Intersection over Union (IoU) between two Shapely polygons."""
    if not poly1.is_valid:
        poly1 = poly1.buffer(0)
    if not poly2.is_valid:
        poly2 = poly2.buffer(0)

    intersection = poly1.intersection(poly2).area
    union = poly1.union(poly2).area
    if union == 0:
        return 0.0
    return round(intersection / union, 4)
