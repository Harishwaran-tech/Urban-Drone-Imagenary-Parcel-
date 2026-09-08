import os
import logging
import cv2
import numpy as np
from typing import Tuple, Dict, Any, Optional

from backend.models.model_manager import get_model_manager

logger = logging.getLogger("cadastra.inference")


def load_model(weights_path: Optional[str] = None) -> bool:
    """
    Consolidated model loader delegating to CadastraModelManager.
    Manages ParcelUNet, SegFormerFeatures, and DeepLabRoads.
    """
    manager = get_model_manager()
    summary = manager.load_all_models()
    return summary.get("production_ai", False)


def get_model_status() -> Dict[str, Any]:
    """Returns runtime model status from consolidated CadastraModelManager."""
    manager = get_model_manager()
    summary = manager.get_summary()
    return {
        "torch_available": True,
        "cuda_available": summary["cuda_available"],
        "device": summary["device"],
        "model_loaded": summary["production_ai"],
        "inference_mode": summary["engine"],
        "models": summary["models"],
        "model_metadata": summary["model_metadata"],
    }


def _run_development_cv_fallback(img_rgb: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Transparent development CV fallback for semantic segmentation
    strictly for testing/demo pipelines when DL model weights are unconfigured.
    """
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    filtered = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)

    grad_x = cv2.Sobel(filtered, cv2.CV_32F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(filtered, cv2.CV_32F, 0, 1, ksize=3)
    magnitude = cv2.magnitude(grad_x, grad_y)
    norm_mag = cv2.normalize(magnitude, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
    prob_boundary = norm_mag.astype(np.float32) / 255.0

    _, boundary_mask = cv2.threshold(norm_mag, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    kernel_line = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    boundary_mask = cv2.morphologyEx(boundary_mask, cv2.MORPH_CLOSE, kernel_line)

    building_thresh = cv2.adaptiveThreshold(
        filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 5
    )
    bldg_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    building_mask = cv2.morphologyEx(building_thresh, cv2.MORPH_OPEN, bldg_kernel)
    building_mask = cv2.morphologyEx(building_mask, cv2.MORPH_CLOSE, bldg_kernel)
    prob_building = (building_mask.astype(np.float32) / 255.0) * 0.85

    return boundary_mask, building_mask, prob_boundary, prob_building


def run_inference(
    img_rgb: np.ndarray,
    app_mode: str = "demo",
) -> Tuple[np.ndarray, np.ndarray, str, Optional[np.ndarray], Optional[np.ndarray], Dict[str, Any]]:
    """
    Consolidated inference interface via CadastraModelManager.
    Eliminates obsolete parallel U-Net loading path.
    """
    manager = get_model_manager()
    summary = manager.get_summary()
    parcel_status = summary["models"]["parcel_unet"]["status"]

    if parcel_status == "COMPLETE" and manager.model_parcel is not None:
        # Production DL forward pass
        prob_boundary, prob_building, prob_road, exec_states = manager.predict_tile(img_rgb)
        boundary_mask = (prob_boundary > 0.40).astype(np.uint8) * 255
        building_mask = (prob_building > 0.45).astype(np.uint8) * 255 if prob_building is not None else np.zeros_like(boundary_mask)
        mode = "pytorch_ensemble"
        engine_meta = {
            "engine": "pytorch_ensemble",
            "production_ai": True,
            "device": str(manager.device),
            "warning": None,
            "model_states": exec_states,
        }
        return boundary_mask, building_mask, mode, prob_boundary, prob_building, engine_meta

    # In REAL mode, do not fabricate results or silently fall back without explicit disclosure
    if app_mode == "real":
        h, w = img_rgb.shape[:2]
        boundary_mask = np.zeros((h, w), dtype=np.uint8)
        building_mask = np.zeros((h, w), dtype=np.uint8)
        prob_boundary = np.zeros((h, w), dtype=np.float32)
        prob_building = np.zeros((h, w), dtype=np.float32)
        mode = "MODEL_NOT_CONFIGURED"
        engine_meta = {
            "engine": "MODEL_NOT_CONFIGURED",
            "production_ai": False,
            "device": str(manager.device),
            "warning": "Parcel model is MODEL_NOT_CONFIGURED. Pending validated training checkpoint.",
            "model_states": summary["models"],
        }
        return boundary_mask, building_mask, mode, prob_boundary, prob_building, engine_meta

    # In DEMO mode, provide labeled local development CV fallback
    boundary_mask, building_mask, prob_boundary, prob_building = _run_development_cv_fallback(img_rgb)
    mode = "development_cv_fallback"
    engine_meta = {
        "engine": "development_cv_fallback",
        "production_ai": False,
        "device": "cpu",
        "warning": "Running in Development CV Fallback mode (DEMO only). DL model checkpoint pending validation.",
        "model_states": summary["models"],
    }
    return boundary_mask, building_mask, mode, prob_boundary, prob_building, engine_meta
