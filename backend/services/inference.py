import os
import logging
import cv2
import numpy as np
from typing import Tuple, Dict, Any, Optional

logger = logging.getLogger("cadastra.inference")

# PyTorch conditional import
TORCH_AVAILABLE = False
try:
    import torch
    import torch.nn.functional as F
    from torchvision import transforms
    from backend.models.unet import UNet
    TORCH_AVAILABLE = True
except ImportError:
    logger.warning("PyTorch not installed or failed to import. Running in CV Fallback mode.")

# Weights locations to search
DEFAULT_WEIGHT_PATHS = [
    os.path.join(os.path.dirname(__file__), "..", "weights", "unet_cadastral.pth"),
    os.path.join(os.path.dirname(__file__), "..", "..", "ml", "best_model.pth"),
    "unet_cadastral.pth",
]

_LOADED_MODEL: Optional[Any] = None
_MODEL_DEVICE = "cpu"
_MODEL_LOADED = False


def load_model(weights_path: Optional[str] = None) -> bool:
    """Loads trained PyTorch model weights if available."""
    global _LOADED_MODEL, _MODEL_DEVICE, _MODEL_LOADED

    if not TORCH_AVAILABLE:
        return False

    _MODEL_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    
    # Locate weights file
    target_path = None
    if weights_path and os.path.exists(weights_path):
        target_path = weights_path
    else:
        for path in DEFAULT_WEIGHT_PATHS:
            if os.path.exists(path):
                target_path = path
                break

    if target_path:
        try:
            logger.info(f"Loading PyTorch U-Net weights from: {target_path} onto {_MODEL_DEVICE}")
            model = UNet(n_channels=3, n_classes=4)
            state_dict = torch.load(target_path, map_location=_MODEL_DEVICE)
            model.load_state_dict(state_dict)
            model.to(_MODEL_DEVICE)
            model.eval()
            _LOADED_MODEL = model
            _MODEL_LOADED = True
            return True
        except Exception as e:
            logger.error(f"Failed to load weights from {target_path}: {e}")
            _LOADED_MODEL = None
            _MODEL_LOADED = False
            return False
    else:
        logger.info("No trained .pth weights file found. Initializing pipeline in development CV fallback mode.")
        _MODEL_LOADED = False
        return False


def get_model_status() -> Dict[str, Any]:
    """Returns current DL runtime and model status."""
    return {
        "torch_available": TORCH_AVAILABLE,
        "cuda_available": torch.cuda.is_available() if TORCH_AVAILABLE else False,
        "device": _MODEL_DEVICE,
        "model_loaded": _MODEL_LOADED,
        "inference_mode": "pytorch_unet" if _MODEL_LOADED else "development_cv_fallback",
    }


def _run_pytorch_inference(img_rgb: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Runs forward pass through PyTorch U-Net."""
    global _LOADED_MODEL, _MODEL_DEVICE
    h, w = img_rgb.shape[:2]

    # Preprocessing
    transform = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    input_tensor = transform(img_rgb).unsqueeze(0).to(_MODEL_DEVICE)

    with torch.no_grad():
        logits = _LOADED_MODEL(input_tensor)
        probs = F.softmax(logits, dim=1).squeeze(0).cpu().numpy()  # [Classes, H, W]

    # Class 1: Building mask, Class 2: Parcel boundaries
    building_mask = (probs[1] > 0.45).astype(np.uint8) * 255
    boundary_mask = (probs[2] > 0.35).astype(np.uint8) * 255

    return boundary_mask, building_mask


def _run_development_cv_fallback(img_rgb: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Transparent development CV fallback for semantic segmentation
    when PyTorch weights are not yet provided.
    Extracts geometric building footprints and parcel boundary candidates.
    """
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    
    # 1. Bilateral filter to preserve strong parcel edges while smoothing noise
    filtered = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)

    # 2. Multi-scale gradient for boundary detection
    grad_x = cv2.Sobel(filtered, cv2.CV_32F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(filtered, cv2.CV_32F, 0, 1, ksize=3)
    magnitude = cv2.magnitude(grad_x, grad_y)
    norm_mag = cv2.normalize(magnitude, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)

    # Threshold for boundaries
    _, boundary_mask = cv2.threshold(norm_mag, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    kernel_line = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    boundary_mask = cv2.morphologyEx(boundary_mask, cv2.MORPH_CLOSE, kernel_line)

    # 3. Building footprint extraction via adaptive thresholding and rectangular morphology
    building_thresh = cv2.adaptiveThreshold(
        filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 5
    )
    bldg_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    building_mask = cv2.morphologyEx(building_thresh, cv2.MORPH_OPEN, bldg_kernel)
    building_mask = cv2.morphologyEx(building_mask, cv2.MORPH_CLOSE, bldg_kernel)

    return boundary_mask, building_mask


def run_inference(img_rgb: np.ndarray) -> Tuple[np.ndarray, np.ndarray, str]:
    """
    Main inference interface.
    Returns: (boundary_mask, building_mask, inference_mode)
    """
    if _MODEL_LOADED and _LOADED_MODEL is not None:
        boundary_mask, building_mask = _run_pytorch_inference(img_rgb)
        mode = "pytorch_unet"
    else:
        boundary_mask, building_mask = _run_development_cv_fallback(img_rgb)
        mode = "development_cv_fallback"

    return boundary_mask, building_mask, mode
