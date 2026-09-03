import cv2
import numpy as np
from PIL import Image
import io
from typing import Tuple, List, Dict, Any

def load_and_preprocess_image(image_bytes: bytes, target_size: Tuple[int, int] = None) -> Tuple[np.ndarray, Tuple[int, int]]:
    """
    Decodes raw image bytes into an RGB numpy array.
    Returns: (rgb_array, (orig_w, orig_h))
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        # Fallback with PIL
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_rgb = np.array(pil_img)
    else:
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    orig_h, orig_w = img_rgb.shape[:2]

    if target_size:
        img_rgb = cv2.resize(img_rgb, target_size, interpolation=cv2.INTER_AREA)

    return img_rgb, (orig_w, orig_h)


def apply_morphological_cleanup(mask: np.ndarray, kernel_size: int = 3, min_area: int = 40) -> np.ndarray:
    """
    Removes small noise specks, fills small holes, and smooths ragged edges.
    """
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
    # Close holes
    cleaned = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    # Open to remove specks
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel)

    # Filter out very small connected components
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(cleaned, connectivity=8)
    output_mask = np.zeros_like(cleaned)
    for i in range(1, num_labels):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            output_mask[labels == i] = 255

    return output_mask


def create_image_tiles(
    image: np.ndarray,
    tile_size: int = 512,
    overlap: int = 64,
) -> List[Dict[str, Any]]:
    """
    Slices a large drone orthomosaic into overlapping tiles for U-Net batch inference.
    """
    h, w = image.shape[:2]
    step = tile_size - overlap
    tiles = []

    y_points = list(range(0, max(1, h - tile_size + 1), step))
    if not y_points or y_points[-1] + tile_size < h:
        y_points.append(max(0, h - tile_size))

    x_points = list(range(0, max(1, w - tile_size + 1), step))
    if not x_points or x_points[-1] + tile_size < w:
        x_points.append(max(0, w - tile_size))

    for y in y_points:
        for x in x_points:
            tile = image[y : y + tile_size, x : x + tile_size]
            if tile.shape[0] < tile_size or tile.shape[1] < tile_size:
                # Pad to tile_size
                padded = np.zeros((tile_size, tile_size, image.shape[2]), dtype=image.dtype)
                padded[: tile.shape[0], : tile.shape[1]] = tile
                tile = padded

            tiles.append({
                "tile": tile,
                "x": x,
                "y": y,
                "w": tile_size,
                "h": tile_size,
            })

    return tiles


def merge_mask_tiles(
    tile_predictions: List[Dict[str, Any]],
    output_shape: Tuple[int, int, int],
) -> np.ndarray:
    """
    Reconstructs the full-resolution multi-class segmentation mask from tile predictions.
    """
    full_mask = np.zeros(output_shape, dtype=np.float32)
    weight_map = np.zeros(output_shape[:2], dtype=np.float32)

    for item in tile_predictions:
        x, y, w, h = item["x"], item["y"], item["w"], item["h"]
        pred = item["pred"]  # [H, W, Classes]
        actual_h = min(h, output_shape[0] - y)
        actual_w = min(w, output_shape[1] - x)

        full_mask[y : y + actual_h, x : x + actual_w] += pred[:actual_h, :actual_w]
        weight_map[y : y + actual_h, x : x + actual_w] += 1.0

    weight_map[weight_map == 0] = 1.0
    for c in range(output_shape[2]):
        full_mask[:, :, c] /= weight_map

    return full_mask
