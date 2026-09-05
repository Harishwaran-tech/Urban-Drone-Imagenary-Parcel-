"""
Elevation & Terrain Analysis Service for CadastraAI.
Processes Digital Surface Models (DSM) and Digital Terrain Models (DTM).
Computes normalized Digital Surface Model (nDSM = DSM - DTM) to extract true physical structure heights.
"""

import os
import logging
import numpy as np
from typing import Tuple, Dict, Any, Optional
from PIL import Image

logger = logging.getLogger("cadastra.elevation")


class ElevationProfile:
    def __init__(
        self,
        ndsm: np.ndarray,
        dsm: Optional[np.ndarray] = None,
        dtm: Optional[np.ndarray] = None,
        resolution_m: float = 0.05,
    ):
        self.ndsm = ndsm  # height above ground in meters [H, W]
        self.dsm = dsm
        self.dtm = dtm
        self.resolution_m = resolution_m
        self.h, self.w = ndsm.shape[:2]

    def get_polygon_height_m(self, pixel_coords: list) -> Dict[str, float]:
        """
        Calculates mean, max, and 90th percentile height above ground
        for a polygon region defined in pixel coordinates.
        """
        import cv2
        poly_pts = np.array(pixel_coords, dtype=np.int32)
        mask = np.zeros((self.h, self.w), dtype=np.uint8)
        cv2.drawContours(mask, [poly_pts], -1, 255, thickness=-1)

        heights = self.ndsm[mask == 255]
        # Filter out negative noise and extreme artifacts
        valid = heights[(heights >= 0.0) & (heights < 200.0)]
        if len(valid) == 0:
            return {"mean_height": 0.0, "max_height": 0.0, "p90_height": 0.0}

        return {
            "mean_height": round(float(np.mean(valid)), 2),
            "max_height": round(float(np.max(valid)), 2),
            "p90_height": round(float(np.percentile(valid, 90)), 2),
        }

    def validate_building_footprint(self, pixel_coords: list, min_height_m: float = 2.2) -> Tuple[bool, float]:
        """
        Validates if an extracted building candidate is truly an elevated structure.
        Helps eliminate flat parking spots, agricultural fields, and painted pavement.
        """
        stats = self.get_polygon_height_m(pixel_coords)
        is_elevated = stats["p90_height"] >= min_height_m
        return is_elevated, stats["p90_height"]


def compute_ndsm_from_arrays(
    dsm_array: np.ndarray,
    dtm_array: np.ndarray,
    target_shape: Optional[Tuple[int, int]] = None,
) -> np.ndarray:
    """
    Computes nDSM = DSM - DTM with alignment and clipping.
    """
    import cv2
    if target_shape and dsm_array.shape[:2] != target_shape:
        dsm_array = cv2.resize(dsm_array, (target_shape[1], target_shape[0]), interpolation=cv2.INTER_LINEAR)
    if target_shape and dtm_array.shape[:2] != target_shape:
        dtm_array = cv2.resize(dtm_array, (target_shape[1], target_shape[0]), interpolation=cv2.INTER_LINEAR)

    ndsm = dsm_array.astype(np.float32) - dtm_array.astype(np.float32)
    # Clip negative values (DTM > DSM due to interpolation noise)
    return np.maximum(0.0, ndsm)


def load_elevation_raster(raster_path: str) -> Tuple[np.ndarray, Dict[str, Any]]:
    """Loads elevation raster (DSM or DTM GeoTIFF) into a float32 height array."""
    if not os.path.exists(raster_path):
        raise FileNotFoundError(f"Elevation raster not found at: {raster_path}")

    # Check tifffile
    try:
        import tifffile
        with tifffile.TiffFile(raster_path) as tif:
            arr = tif.pages[0].asarray().astype(np.float32)
            # Filter standard nodata values (-9999, -32767)
            arr[arr < -1000.0] = 0.0
            return arr, {"width": arr.shape[1], "height": arr.shape[0]}
    except Exception:
        pass

    # PIL fallback
    with Image.open(raster_path) as img:
        arr = np.array(img, dtype=np.float32)
        return arr, {"width": arr.shape[1], "height": arr.shape[0]}
