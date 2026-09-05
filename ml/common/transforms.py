"""
Common transforms and data augmentation utilities for CadastraAI ML pipelines.
"""

import torch
import torchvision.transforms.functional as TF
from PIL import Image


def apply_geospatial_augmentations(img_pil: Image.Image, mask_pil: Image.Image):
    """Applies synchronized spatial transformations preserving cadastral topology."""
    # Horizontal Flip
    if torch.rand(1) > 0.5:
        img_pil = TF.hflip(img_pil)
        mask_pil = TF.hflip(mask_pil)

    # Vertical Flip
    if torch.rand(1) > 0.5:
        img_pil = TF.vflip(img_pil)
        mask_pil = TF.vflip(mask_pil)

    # Orthogonal 90 degree rotations
    rot = int(torch.randint(0, 4, (1,)).item())
    if rot == 1:
        img_pil = TF.rotate(img_pil, 90)
        mask_pil = TF.rotate(mask_pil, 90)
    elif rot == 2:
        img_pil = TF.rotate(img_pil, 180)
        mask_pil = TF.rotate(mask_pil, 180)
    elif rot == 3:
        img_pil = TF.rotate(img_pil, 270)
        mask_pil = TF.rotate(mask_pil, 270)

    return img_pil, mask_pil
