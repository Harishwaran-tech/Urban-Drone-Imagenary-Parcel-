"""
Synthetic Dataset Generator for CadastraAI Testing and Demos.
This module is strictly for development tests, benchmarks, and offline pipeline validation.
It is separated from production datasets to guarantee training metrics reflect real data.
"""

import os
import numpy as np
from PIL import Image
from typing import Tuple, List


def generate_synthetic_tile(
    idx: int,
    target_size: Tuple[int, int] = (512, 512),
) -> Tuple[Image.Image, Image.Image]:
    """Generates a synthetic aerial tile and corresponding integer ground-truth mask."""
    np.random.seed(idx)
    h, w = target_size
    img = np.random.randint(60, 200, (h, w, 3), dtype=np.uint8)
    mask = np.zeros(target_size, dtype=np.int64)

    # Class 1: Building footprints
    for _ in range(4):
        bx = np.random.randint(40, max(41, w - 140))
        by = np.random.randint(40, max(41, h - 140))
        bw = np.random.randint(60, 110)
        bh = np.random.randint(60, 110)
        img[by : by + bh, bx : bx + bw] = [215, 210, 195]
        mask[by : by + bh, bx : bx + bw] = 1

    # Class 2: Parcel boundaries
    grid_step = h // 2
    for g in range(1, 2):
        img[g * grid_step - 2 : g * grid_step + 2, :] = [35, 35, 35]
        mask[g * grid_step - 2 : g * grid_step + 2, :] = 2

    # Class 3: Road / access corridor
    rx = w // 4
    img[:, rx - 10 : rx + 10] = [80, 80, 85]
    mask[:, rx - 10 : rx + 10] = 3

    img_pil = Image.fromarray(img)
    mask_pil = Image.fromarray(mask.astype(np.uint8))
    return img_pil, mask_pil


def create_synthetic_benchmark_dataset(
    output_dir: str,
    num_train: int = 16,
    num_val: int = 4,
    target_size: Tuple[int, int] = (512, 512),
) -> None:
    """Exports a structured synthetic dataset to disk for offline testing."""
    for split, count in [("train", num_train), ("val", num_val)]:
        img_dir = os.path.join(output_dir, split, "images")
        mask_dir = os.path.join(output_dir, split, "masks")
        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(mask_dir, exist_ok=True)

        for i in range(count):
            img_pil, mask_pil = generate_synthetic_tile(i + (100 if split == "val" else 0), target_size)
            img_pil.save(os.path.join(img_dir, f"synthetic_tile_{i:03d}.jpg"))
            mask_pil.save(os.path.join(mask_dir, f"synthetic_tile_{i:03d}.png"))
