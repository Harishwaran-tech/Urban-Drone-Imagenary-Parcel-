"""
Georeferencing & Spatial Transform Engine for CadastraAI.
Reads true CRS, Affine Transforms, Pixel Scales, and Bounds from GeoTIFF / ORI metadata.
Converts pixel coordinates to real-world GIS coordinates using pyproj and GDAL / rasterio / tifffile.
"""

import os
import math
import logging
from typing import Tuple, Dict, Any, Optional, List
import pyproj

logger = logging.getLogger("cadastra.georeferencing")

# Standard Fallback Anchor (Jaipur Zone 04) when plain images lack embedded spatial metadata
DEFAULT_LAT = 26.9124
DEFAULT_LNG = 75.7873
DEFAULT_GSD_METERS = 0.05  # 5cm per pixel (typical drone survey resolution)


class GeoreferenceTransform:
    """
    Represents an affine spatial transform and CRS projection mapping.
    Maps pixel indices (col/x, row/y) directly to geographic coordinates (lng, lat in EPSG:4326).
    """
    def __init__(
        self,
        affine_matrix: Tuple[float, float, float, float, float, float],
        crs: str = "EPSG:4326",
        width: int = 1000,
        height: int = 1000,
        is_embedded_geotiff: bool = False,
    ):
        """
        affine_matrix: (a, b, c, d, e, f)
        X_geo = a * col + b * row + c
        Y_geo = d * col + e * row + f
        """
        self.a, self.b, self.c, self.d, self.e, self.f = affine_matrix
        self.crs = crs.upper()
        self.width = width
        self.height = height
        self.is_embedded_geotiff = is_embedded_geotiff

        # Initialize pyproj coordinate transformer if native CRS is not EPSG:4326
        self.transformer_to_wgs84: Optional[pyproj.Transformer] = None
        self.transformer_from_wgs84: Optional[pyproj.Transformer] = None

        if self.crs not in ["EPSG:4326", "WGS84", "CRS84", "OGC:CRS84"]:
            try:
                self.transformer_to_wgs84 = pyproj.Transformer.from_crs(
                    self.crs, "EPSG:4326", always_xy=True
                )
                self.transformer_from_wgs84 = pyproj.Transformer.from_crs(
                    "EPSG:4326", self.crs, always_xy=True
                )
            except Exception as ex:
                logger.warning(f"Could not build projection transformer for CRS '{self.crs}': {ex}. Assuming EPSG:4326.")

    def pixel_to_native(self, col: float, row: float) -> Tuple[float, float]:
        """Converts pixel coordinate (col, row) to native CRS coordinate (X, Y)."""
        x_native = self.a * col + self.b * row + self.c
        y_native = self.d * col + self.e * row + self.f
        return x_native, y_native

    def native_to_pixel(self, x_native: float, y_native: float) -> Tuple[float, float]:
        """Inverts affine transform to map native CRS coordinate back to pixel (col, row)."""
        det = self.a * self.e - self.b * self.d
        if abs(det) < 1e-24:
            return 0.0, 0.0
        col = (self.e * (x_native - self.c) - self.b * (y_native - self.f)) / det
        row = (-self.d * (x_native - self.c) + self.a * (y_native - self.f)) / det
        return round(col, 2), round(row, 2)

    def pixel_to_geo(self, col: float, row: float) -> Tuple[float, float]:
        """
        Converts pixel coordinate (col, row) to [longitude, latitude] in WGS84 (EPSG:4326).
        Returns: (longitude, latitude)
        """
        x_native, y_native = self.pixel_to_native(col, row)

        if self.transformer_to_wgs84 is not None:
            lng, lat = self.transformer_to_wgs84.transform(x_native, y_native)
        else:
            lng, lat = x_native, y_native

        return round(float(lng), 7), round(float(lat), 7)

    def geo_to_pixel(self, lng: float, lat: float) -> Tuple[float, float]:
        """Converts [longitude, latitude] in EPSG:4326 back to pixel (col, row)."""
        if self.transformer_from_wgs84 is not None:
            x_native, y_native = self.transformer_from_wgs84.transform(lng, lat)
        else:
            x_native, y_native = lng, lat

        return self.native_to_pixel(x_native, y_native)

    def get_bounds_wgs84(self) -> Tuple[float, float, float, float]:
        """Returns geographic bounding box in WGS84: (min_lng, min_lat, max_lng, max_lat)."""
        corners = [
            self.pixel_to_geo(0, 0),
            self.pixel_to_geo(self.width, 0),
            self.pixel_to_geo(self.width, self.height),
            self.pixel_to_geo(0, self.height),
        ]
        lngs = [c[0] for c in corners]
        lats = [c[1] for c in corners]
        return min(lngs), min(lats), max(lngs), max(lats)

    def get_resolution_meters(self) -> float:
        """Estimates Ground Sampling Distance (GSD) in meters per pixel."""
        p0 = self.pixel_to_geo(0, 0)
        p1 = self.pixel_to_geo(100, 0)
        # Approximate distance in meters
        d_lng = p1[0] - p0[0]
        d_lat = p1[1] - p0[1]
        m_per_deg = 111139.0 * math.cos(math.radians(p0[1]))
        dist_m = math.sqrt((d_lng * m_per_deg) ** 2 + (d_lat * 111139.0) ** 2)
        return round(dist_m / 100.0, 4)

    def to_dict(self) -> Dict[str, Any]:
        min_lng, min_lat, max_lng, max_lat = self.get_bounds_wgs84()
        return {
            "crs": self.crs,
            "is_embedded_geotiff": self.is_embedded_geotiff,
            "width": self.width,
            "height": self.height,
            "affine": [self.a, self.b, self.c, self.d, self.e, self.f],
            "resolution_m_per_px": self.get_resolution_meters(),
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
    default_anchor_lat: float = DEFAULT_LAT,
    default_anchor_lng: float = DEFAULT_LNG,
) -> GeoreferenceTransform:
    """
    Parses true CRS, affine transform, pixel size, and geographic bounds from a GeoTIFF file.
    Supports tifffile, rasterio/GDAL, and World file (.tfw / .jgw / .pgw) companion detection.
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
                crs=crs_str,
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
                # In standard GeoTIFF, Y decreases as row increases
                affine_matrix = (dx, 0.0, x0, 0.0, -dy, y0)

                # Check GeoKey directory for EPSG code
                crs_str = "EPSG:4326"
                if 34735 in tags:
                    geokeys = tags[34735].value
                    # Parse keys: key ID 3072 is ProjectedCSTypeGeoKey, 2048 is GeographicTypeGeoKey
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
                    crs=crs_str,
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
                        # World file format: A, D, B, E, C, F
                        # (A: pixel X size, D: rot Y, B: rot X, E: pixel Y size, C: X origin, F: Y origin)
                        a, d, b, e, c, f = lines[:6]
                        affine_matrix = (a, b, c, d, e, f)
                        # Check companion PRJ file
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
                            crs=crs_str,
                            width=w,
                            height=h,
                            is_embedded_geotiff=True,
                        )
            except Exception as ex:
                logger.warning(f"Error parsing world file {wld_path}: {ex}")

    # 4. Calibrated Fallback for Non-GeoTIFF imagery (with image dimensions from PIL)
    try:
        from PIL import Image
        with Image.open(file_path) as im:
            w, h = im.size
    except Exception:
        w, h = 1000, 1000

    # Derive real span based on survey resolution (GSD = 0.05m = 5cm/px)
    deg_per_meter = 1.0 / (111139.0 * math.cos(math.radians(default_anchor_lat)))
    deg_per_meter_lat = 1.0 / 111139.0
    pixel_deg_x = DEFAULT_GSD_METERS * deg_per_meter
    pixel_deg_y = DEFAULT_GSD_METERS * deg_per_meter_lat

    origin_lng = default_anchor_lng - (w / 2.0) * pixel_deg_x
    origin_lat = default_anchor_lat + (h / 2.0) * pixel_deg_y
    affine_matrix = (pixel_deg_x, 0.0, origin_lng, 0.0, -pixel_deg_y, origin_lat)

    return GeoreferenceTransform(
        affine_matrix=affine_matrix,
        crs="EPSG:4326",
        width=w,
        height=h,
        is_embedded_geotiff=False,
    )
