import os
import glob
import logging
import torch
import numpy as np
from PIL import Image
from torch.utils.data import Dataset
from torchvision import transforms
import torchvision.transforms.functional as TF
from typing import List, Tuple, Dict, Optional

logger = logging.getLogger("cadastra.ml.dataset")

VALID_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".tif", ".tiff"]
VALID_MASK_EXTENSIONS = [".png", ".jpg", ".jpeg", ".tif", ".tiff"]


class AerialCadastralDataset(Dataset):
    """
    Production PyTorch Dataset for aerial/drone cadastral imagery semantic segmentation.
    Pairs RGB aerial images with ground-truth integer class masks using filename stems.
    Guarantees strict pairing: no silent blank mask fallbacks and no synthetic dataset inflation.
    """
    def __init__(
        self,
        image_dir: str,
        mask_dir: str,
        target_size: tuple = (512, 512),
        augment: bool = False,
        strict_pairing: bool = True,
    ):
        self.image_dir = image_dir
        self.mask_dir = mask_dir
        self.target_size = target_size
        self.augment = augment
        self.strict_pairing = strict_pairing

        # 1. Index all available masks by filename stem (e.g., "tile_01" -> path)
        self.mask_map: Dict[str, str] = {}
        if os.path.exists(mask_dir):
            for ext in VALID_MASK_EXTENSIONS:
                for p in glob.glob(os.path.join(mask_dir, f"*{ext}")):
                    stem = os.path.splitext(os.path.basename(p))[0]
                    self.mask_map[stem] = p

        # 2. Match images to masks strictly by stem
        self.pairs: List[Tuple[str, str]] = []
        missing_masks: List[str] = []

        if os.path.exists(image_dir):
            found_images: List[str] = []
            for ext in VALID_IMAGE_EXTENSIONS:
                found_images.extend(glob.glob(os.path.join(image_dir, f"*{ext}")))
            found_images.sort()

            for img_path in found_images:
                stem = os.path.splitext(os.path.basename(img_path))[0]
                if stem in self.mask_map:
                    self.pairs.append((img_path, self.mask_map[stem]))
                else:
                    missing_masks.append(os.path.basename(img_path))

        if missing_masks and self.strict_pairing:
            raise FileNotFoundError(
                f"Ground-truth masks missing for {len(missing_masks)} images in '{mask_dir}'. "
                f"Sample missing: {missing_masks[:5]}. "
                f"Supported mask extensions: {VALID_MASK_EXTENSIONS}. "
                "Training aborted to prevent corrupt evaluation on unverified data."
            )
        elif missing_masks:
            logger.warning(
                f"Skipping {len(missing_masks)} images with no corresponding masks in '{mask_dir}'."
            )

        self.normalize = transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        )

    def __len__(self) -> int:
        """Returns the actual number of verified, paired real training samples."""
        return len(self.pairs)

    def __getitem__(self, idx: int):
        if idx >= len(self.pairs):
            raise IndexError(f"Index {idx} out of range for dataset of size {len(self.pairs)}")

        img_path, mask_path = self.pairs[idx]

        # Load RGB image and ground-truth mask
        img_pil = Image.open(img_path).convert("RGB")
        mask_pil = Image.open(mask_path).convert("L")

        # Resize to target dimension
        img_pil = img_pil.resize(self.target_size, Image.BILINEAR)
        mask_pil = mask_pil.resize(self.target_size, Image.NEAREST)

        # Synchronized Data Augmentation
        if self.augment:
            # Random Horizontal Flip
            if torch.rand(1) > 0.5:
                img_pil = TF.hflip(img_pil)
                mask_pil = TF.hflip(mask_pil)

            # Random Vertical Flip
            if torch.rand(1) > 0.5:
                img_pil = TF.vflip(img_pil)
                mask_pil = TF.vflip(mask_pil)

            # Random Orthogonal Rotation (0, 90, 180, 270 deg)
            rot_choice = int(torch.randint(0, 4, (1,)).item())
            if rot_choice == 1:
                img_pil = TF.rotate(img_pil, 90)
                mask_pil = TF.rotate(mask_pil, 90)
            elif rot_choice == 2:
                img_pil = TF.rotate(img_pil, 180)
                mask_pil = TF.rotate(mask_pil, 180)
            elif rot_choice == 3:
                img_pil = TF.rotate(img_pil, 270)
                mask_pil = TF.rotate(mask_pil, 270)

        # Convert to Tensor
        img_tensor = TF.to_tensor(img_pil)
        img_tensor = self.normalize(img_tensor)

        mask_np = np.array(mask_pil, dtype=np.int64)
        mask_tensor = torch.from_numpy(mask_np)

        return img_tensor, mask_tensor

