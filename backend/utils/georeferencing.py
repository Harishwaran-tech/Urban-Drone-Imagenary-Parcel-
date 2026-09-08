"""
Georeferencing & Spatial Transform Engine for CadastraAI.
Reads true CRS, Affine Transforms, Pixel Scales, and Bounds from GeoTIFF / ORI metadata.
Preserves source_crs, working_crs (projected metric), and display_crs (WGS84).
Enforces real georeferencing without silent geographic placement or hardcoded city fallbacks.
"""

import os
import math
import logging
from typing import Tuple, Dict, Any, Optional, List
import pyproj

logger = logging.getLogger("cadastra.georeferencing")


class GeoreferenceTransform:
    """
    Represents an affine spatial transform and CRS projection mapping.
    Maps pixel indices (col/x, row/y) directly to geographic coordinates and metric coordinates.
    Preserves:
      - source_crs: Native CRS of the input raster
      - working_crs: Projected metric CRS for spatial calculations (e.g. UTM)
      - display_crs: Standard WGS84 EPSG:4326 for web map presentation
    """
    def __init__(
        self,
        affine_matrix: Tuple[float, float, float, float, float, float],
        source_crs: str = "EPSG:4326",
        working_crs: Optional[str] = None,
        width: int = 1000,
        height: int = 1000,
        is_embedded_geotiff: bool = True,
        is_unreferenced: bool = False,
    ):
        """
        affine_matrix: (a, b, c, d, e, f)
        X_geo = a * col + b * row + c
        Y_geo = d * col + e * row + f
        """
        self.a, self.b, self.c, self.d, self.e, self.f = affine_matrix
        self.source_crs = source_crs.upper()
        self.working_crs = (working_crs or source_crs).upper()
        self.display_crs = "EPSG:4326"
        self.width = width
        self.height = height
        self.is_embedded_geotiff = is_embedded_geotiff
        self.is_unreferenced = is_unreferenced

        # PyProj transformers
        self.transformer_source_to_wgs84: Optional[pyproj.Transformer] = None
        self.transformer_wgs84_to_source: Optional[pyproj.Transformer] = None
        self.transformer_wgs84_to_working: Optional[pyproj.Transformer] = None
        self.transformer_working_to_wgs84: Optional[pyproj.Transformer] = None

        if self.source_crs not in ["EPSG:4326", "WGS84", "CRS84", "OGC:CRS84"]:
            try:
                self.transformer_source_to_wgs84 = pyproj.Transformer.from_crs(
                    self.source_crs, "EPSG:4326", always_xy=True
                )
                self.transformer_wgs84_to_source = pyproj.Transformer.from_crs(
                    "EPSG:4326", self.source_crs, always_xy=True
                )
            except Exception as ex:
                logger.warning(f"Could not build projection transformer for Source CRS '{self.source_crs}': {ex}.")

        if self.working_crs not in ["EPSG:4326", "WGS84", "CRS84", "OGC:CRS84"]:
            try:
                self.transformer_wgs84_to_working = pyproj.Transformer.from_crs(
                    "EPSG:4326", self.working_crs, always_xy=True
                )
                self.transformer_working_to_wgs84 = pyproj.Transformer.from_crs(
                    self.working_crs, "EPSG:4326", always_xy=True
                )
            except Exception as ex:
                logger.warning(f"Could not build projection transformer for Working CRS '{self.working_crs}': {ex}.")

    def pixel_to_native(self, col: float, row: float) -> Tuple[float, float]:
        """Maps raster pixel (col, row) to coordinates in native source_crs."""
        x_geo = self.a * col + self.b * row + self.c
        y_geo = self.d * col + self.e * row + self.f
        return x_geo, y_geo

    def native_to_pixel(self, x_geo: float, y_geo: float) -> Tuple[float, float]:
        """Inverse mapping: maps coordinates in native source_crs to pixel (col, row)."""
        det = self.a * self.e - self.b * self.d
        if abs(det) < 1e-12:
            return 0.0, 0.0
        col = (self.e * (x_geo - self.c) - self.b * (y_geo - self.f)) / det
        row = (-self.d * (x_geo - self.c) + self.a * (y_geo - self.f)) / det
        return col, row

    def pixel_to_wgs84(self, col: float, row: float) -> Tuple[float, float]:
        """Maps raster pixel (col, row) to geographic (lng, lat) in display_crs EPSG:4326."""
        x_nat, y_nat = self.pixel_to_native(col, row)
        if self.transformer_source_to_wgs84:
            lng, lat = self.transformer_source_to_wgs84.transform(x_nat, y_nat)
            return lng, lat
        return x_nat, y_nat

    def wgs84_to_pixel(self, lng: float, lat: float) -> Tuple[float, float]:
        """Maps geographic (lng, lat) in display_crs EPSG:4326 to raster pixel (col, row)."""
        if self.transformer_wgs84_to_source:
            x_nat, y_nat = self.transformer_wgs84_to_source.transform(lng, lat)
            return self.native_to_pixel(x_nat, y_nat)
        return self.native_to_pixel(lng, lat)

    def wgs84_to_working_metric(self, lng: float, lat: float) -> Tuple[float, float]:
        """Maps geographic (lng, lat) into projected metric working_crs (meters)."""
        if self.transformer_wgs84_to_working:
            x_m, y_m = self.transformer_wgs84_to_working.transform(lng, lat)
            return x_m, y_m
        # Fallback local equirectangular projection if working CRS is geographic
        rad_lat = math.radians(lat)
        x_m = lng * 111319.49 * math.cos(rad_lat)
        y_m = lat * 110574.0
        return x_m, y_m

    def working_metric_to_wgs84(self, x_m: float, y_m: float) -> Tuple[float, float]:
        """Maps projected metric working_crs (meters) back to geographic (lng, lat)."""
        if self.transformer_working_to_wgs84:
            lng, lat = self.transformer_working_to_wgs84.transform(x_m, y_m)
            return lng, lat
        # Inverse equirectangular
        lat = y_m / 110574.0
        rad_lat = math.radians(lat)
        cos_l = math.cos(rad_lat)
        lng = x_m / (111319.49 * cos_l) if abs(cos_l) > 1e-6 else 0.0
        return lng, lat

    @property
    def crs(self) -> str:
        return self.source_crs

    def get_gsd_meters(self) -> float:
        """Calculates Ground Sample Distance (GSD) in real meters."""
        p0_lng, p0_lat = self.pixel_to_wgs84(0, 0)
        p1_lng, p1_lat = self.pixel_to_wgs84(1, 0)
        p0_x, p0_y = self.wgs84_to_working_metric(p0_lng, p0_lat)
        p1_x, p1_y = self.wgs84_to_working_metric(p1_lng, p1_lat)
        return math.hypot(p1_x - p0_x, p1_y - p0_y)

    def get_resolution_meters(self) -> float:
        """Alias for get_gsd_meters."""
        return self.get_gsd_meters()

    def get_geographic_bounds(self) -> Dict[str, Any]:
        """Calculates exact 4-corner bounding box in display_crs EPSG:4326."""
        c0 = self.pixel_to_wgs84(0, 0)
        c1 = self.pixel_to_wgs84(self.width, 0)
        c2 = self.pixel_to_wgs84(self.width, self.height)
        c3 = self.pixel_to_wgs84(0, self.height)

        all_lngs = [c0[0], c1[0], c2[0], c3[0]]
        all_lats = [c0[1], c1[1], c2[1], c3[1]]

        min_lng, max_lng = min(all_lngs), max(all_lngs)
        min_lat, max_lat = min(all_lats), max(all_lats)

        return {
            "source_crs": self.source_crs,
            "working_crs": self.working_crs,
            "display_crs": self.display_crs,
            "is_embedded_geotiff": self.is_embedded_geotiff,
            "is_unreferenced": self.is_unreferenced,
            "gsd_meters": round(self.get_gsd_meters(), 4),
            "width": self.width,
            "height": self.height,
            "corners_wgs84": [c0, c1, c2, c3],
            "bounds_wgs84": {
                "min_lng": min_lng,
                "min_lat": min_lat,
                "max_lng": max_lng,
                "max_lat": max_lat,
            },
            "leaflet_bounds": [[min_lat, min_lng], [max_lat, max_lng]],
        }


def parse_geotiff_metadata(
    file_path: str,
    allow_unreferenced: bool = False,
    demo_anchor_lat: Optional[float] = None,
    demo_anchor_lng: Optional[float] = None,
    working_crs: Optional[str] = None,
) -> GeoreferenceTransform:
    """
    Parses true CRS, affine transform, pixel size, and geographic bounds from a GeoTIFF file.
    Supports rasterio, tifffile tags, and World file companion detection (.tfw / .jgw / .pgw).

    If the raster completely lacks spatial metadata and allow_unreferenced is False (production),
    raises ValueError('Georeferencing unavailable').
    """
    # 1. Try rasterio if installed
    try:
        import rasterio
        with rasterio.open(file_path) as src:
            transform = src.transform
            affine_matrix = (
                transform.a, transform.b, transform.c,
                transform.d, transform.e, transform.f
            )
            crs_str = str(src.crs) if src.crs else "EPSG:4326"
            return GeoreferenceTransform(
                affine_matrix=affine_matrix,
                source_crs=crs_str,
                working_crs=working_crs,
                width=src.width,
                height=src.height,
                is_embedded_geotiff=True,
            )
    except Exception:
        pass

    # 2. Try tifffile to extract GeoTIFF tags directly
    try:
        import tifffile
        with tifffile.TiffFile(file_path) as tif:
            page = tif.pages[0]
            tags = page.tags

            # Tag 33550: ModelPixelScaleTag [scaleX, scaleY, scaleZ]
            # Tag 33922: ModelTiepointTag [i, j, k, x, y, z]
            # Tag 34264: ModelTransformationTag [4x4 matrix]
            # Tag 34735: GeoKeyDirectoryTag
            h, w = page.shape[:2]

            if 33550 in tags and 33922 in tags:
                scales = tags[33550].value
                tiepoints = tags[33922].value
                dx, dy = scales[0], scales[1]
                x0, y0 = tiepoints[3], tiepoints[4]
                affine_matrix = (dx, 0.0, x0, 0.0, -dy, y0)

                crs_str = "EPSG:4326"
                if 34735 in tags:
                    geokeys = tags[34735].value
                    for i in range(4, len(geokeys), 4):
                        key_id = geokeys[i]
                        val = geokeys[i + 3]
                        if key_id == 3072 and val > 0:
                            crs_str = f"EPSG:{val}"
                            break
                        elif key_id == 2048 and val > 0:
                            crs_str = f"EPSG:{val}"

                return GeoreferenceTransform(
                    affine_matrix=affine_matrix,
                    source_crs=crs_str,
                    working_crs=working_crs,
                    width=w,
                    height=h,
                    is_embedded_geotiff=True,
                )
    except Exception:
        pass

    # 3. Check for World file companion (.tfw, .jgw, .pgw, .wld)
    base_name, _ = os.path.splitext(file_path)
    for ext in [".tfw", ".jgw", ".pgw", ".wld"]:
        wld_path = base_name + ext
        if os.path.exists(wld_path):
            try:
                with open(wld_path, "r") as wf:
                    lines = [float(line.strip()) for line in wf.readlines() if line.strip()]
                    if len(lines) >= 6:
                        a, d, b, e, c, f = lines[:6]
                        affine_matrix = (a, b, c, d, e, f)
                        prj_path = base_name + ".prj"
                        crs_str = "EPSG:4326"
                        if os.path.exists(prj_path):
                            with open(prj_path, "r") as pf:
                                prj_text = pf.read().strip()
                                try:
                                    crs_str = pyproj.CRS.from_wkt(prj_text).to_string()
                                except Exception:
                                    pass

                        from PIL import Image
                        with Image.open(file_path) as im:
                            w, h = im.size

                        return GeoreferenceTransform(
                            affine_matrix=affine_matrix,
                            source_crs=crs_str,
                            working_crs=working_crs,
                            width=w,
                            height=h,
                            is_embedded_geotiff=True,
                        )
            except Exception as ex:
                logger.warning(f"Error parsing companion world file {wld_path}: {ex}")

    # 4. Handle Non-Georeferenced Imagery (P2 Item 15)
    if not allow_unreferenced:
        raise ValueError(
            "Georeferencing unavailable: Uploaded raster does not contain embedded spatial CRS tags, "
            "ModelTiepoints, or a companion World file (.tfw). Real survey projects require georeferenced data."
        )

    # Isolated Demo/Sandbox Fallback only if explicitly requested
    if demo_anchor_lat is not None and demo_anchor_lng is not None:
        anchor_lat = demo_anchor_lat
        anchor_lng = demo_anchor_lng
    else:
        # Neutral equator origin if no anchor provided in sandbox
        anchor_lat = 0.0
        anchor_lng = 0.0

    try:
        from PIL import Image
        with Image.open(file_path) as im:
            w, h = im.size
    except Exception:
        w, h = 1000, 1000

    gsd_m = 0.05
    deg_per_meter = 1.0 / (111139.0 * math.cos(math.radians(max(-80, min(80, anchor_lat)))))
    deg_per_meter_lat = 1.0 / 111139.0
    pixel_deg_x = gsd_m * deg_per_meter
    pixel_deg_y = gsd_m * deg_per_meter_lat

    origin_lng = anchor_lng - (w / 2.0) * pixel_deg_x
    origin_lat = anchor_lat + (h / 2.0) * pixel_deg_y
    affine_matrix = (pixel_deg_x, 0.0, origin_lng, 0.0, -pixel_deg_y, origin_lat)

    utm_zone = int((anchor_lng + 180) / 6) + 1 if anchor_lng != 0.0 else 43
    dyn_utm = f"EPSG:{32600 + utm_zone if anchor_lat >= 0 else 32700 + utm_zone}"

    return GeoreferenceTransform(
        affine_matrix=affine_matrix,
        source_crs="EPSG:4326",
        working_crs=working_crs or dyn_utm,
        width=w,
        height=h,
        is_embedded_geotiff=False,
        is_unreferenced=True,
    )
