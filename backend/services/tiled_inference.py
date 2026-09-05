"""
Tiled Raster Inference & Seamless Blending Engine for CadastraAI.
Processes large-scale drone orthomosaics at full resolution using overlapping sliding windows.
Preserves high-frequency details (narrow parcel walls, pathways, small outbuildings)
while ensuring GPU VRAM footprint stays bounded and constant.
"""

import math
import numpy as np
from typing import Tuple, Callable, Dict, Any, Optional


def create_2d_hann_window(tile_size: int = 512) -> np.ndarray:
    """
    Creates a 2D Hann cosine blending window.
    Weights center pixels higher and tapers smoothly to zero at tile boundaries
    to eliminate seam artifacts when combining overlapping predictions.
    """
    w1d = np.hanning(tile_size)
    w2d = np.outer(w1d, w1d)
    # Clip minimum weight to prevent div-by-zero on borders
    return np.maximum(w2d, 0.01).astype(np.float32)


def run_tiled_inference(
    image_rgb: np.ndarray,
    predict_fn: Callable[[np.ndarray], Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]],
    tile_size: int = 512,
    overlap: int = 64,
    boundary_threshold: float = 0.35,
    building_threshold: float = 0.45,
    road_threshold: float = 0.40,
) -> Dict[str, np.ndarray]:
    """
    Executes tiled sliding-window inference across arbitrary resolution aerial imagery.

    predict_fn: Callable taking tile_rgb [tile_size, tile_size, 3] and returning:
                (prob_boundary, prob_building, prob_road) each of shape [tile_size, tile_size]
    Returns:
        {
            "prob_boundary": full resolution float32 [H, W],
            "prob_building": full resolution float32 [H, W],
            "prob_road": full resolution float32 [H, W] or None,
            "mask_boundary": uint8 binary mask [H, W],
            "mask_building": uint8 binary mask [H, W],
            "mask_road": uint8 binary mask [H, W],
            "total_tiles": int,
        }
    """
    orig_h, orig_w = image_rgb.shape[:2]

    # If image is smaller than tile size, pad it to tile_size
    pad_bottom = max(0, tile_size - orig_h)
    pad_right = max(0, tile_size - orig_w)
    if pad_bottom > 0 or pad_right > 0:
        padded_img = np.pad(
            image_rgb,
            ((0, pad_bottom), (0, pad_right), (0, 0)),
            mode="reflect",
        )
    else:
        padded_img = image_rgb

    h, w = padded_img.shape[:2]
    stride = tile_size - overlap

    # Calculate grid steps
    row_starts = list(range(0, h - tile_size + 1, stride))
    if not row_starts or row_starts[-1] + tile_size < h:
        row_starts.append(max(0, h - tile_size))

    col_starts = list(range(0, w - tile_size + 1, stride))
    if not col_starts or col_starts[-1] + tile_size < w:
        col_starts.append(max(0, w - tile_size))

    # Weight blending window
    window = create_2d_hann_window(tile_size)

    # Accumulators
    accum_boundary = np.zeros((h, w), dtype=np.float32)
    accum_building = np.zeros((h, w), dtype=np.float32)
    accum_road = np.zeros((h, w), dtype=np.float32)
    weight_accum = np.zeros((h, w), dtype=np.float32)

    has_roads = False
    total_tiles = len(row_starts) * len(col_starts)

    for r in row_starts:
        for c in col_starts:
            tile = padded_img[r : r + tile_size, c : c + tile_size]

            p_boundary, p_building, p_road = predict_fn(tile)

            accum_boundary[r : r + tile_size, c : c + tile_size] += p_boundary * window
            accum_building[r : r + tile_size, c : c + tile_size] += p_building * window

            if p_road is not None:
                accum_road[r : r + tile_size, c : c + tile_size] += p_road * window
                has_roads = True

            weight_accum[r : r + tile_size, c : c + tile_size] += window

    # Normalization
    weight_safe = np.maximum(weight_accum, 1e-6)
    full_prob_boundary = (accum_boundary / weight_safe)[:orig_h, :orig_w]
    full_prob_building = (accum_building / weight_safe)[:orig_h, :orig_w]
    full_prob_road = (accum_road / weight_safe)[:orig_h, :orig_w] if has_roads else None

    # Binary thresholding
    mask_boundary = (full_prob_boundary > boundary_threshold).astype(np.uint8) * 255
    mask_building = (full_prob_building > building_threshold).astype(np.uint8) * 255
    mask_road = (full_prob_road > road_threshold).astype(np.uint8) * 255 if full_prob_road is not None else None

    return {
        "prob_boundary": full_prob_boundary,
        "prob_building": full_prob_building,
        "prob_road": full_prob_road,
        "mask_boundary": mask_boundary,
        "mask_building": mask_building,
        "mask_road": mask_road,
        "total_tiles": total_tiles,
    }
