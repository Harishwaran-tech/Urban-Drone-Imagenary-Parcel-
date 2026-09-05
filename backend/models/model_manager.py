"""
Centralized AI Model Lifecycle & Inference Manager for CadastraAI.
Manages the three-model specialized architecture:
  - Model 1: ParcelUNet (Cadastral boundaries)
  - Model 2: SegFormerFeatures (Building footprints & LULC classification)
  - Model 3: DeepLabRoads (Road network & access pathways)

Provides:
  - Startup device selection (CUDA GPU vs CPU)
  - Model checkpoint management and caching
  - Independent model failure isolation
  - Transparent CV fallback labeling (production_ai: false)
  - Full model provenance metadata tracking
"""

import os
import logging
import datetime
from typing import Dict, Any, Optional, Tuple
import torch
import torch.nn.functional as F
import numpy as np

from backend.models.parcel_unet import ParcelUNet
from backend.models.segformer_features import SegFormerFeatures
from backend.models.deeplab_roads import DeepLabRoads

logger = logging.getLogger("cadastra.model_manager")

WEIGHTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "weights"))


class CadastraModelManager:
    """
    Singleton Manager for loading, managing, and executing deep learning models.
    """
    _instance: Optional["CadastraModelManager"] = None

    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Initializing CadastraModelManager on device: {self.device}")

        # Model instances
        self.model_parcel: Optional[ParcelUNet] = None
        self.model_features: Optional[SegFormerFeatures] = None
        self.model_roads: Optional[DeepLabRoads] = None

        # Status tracking
        self.statuses = {
            "parcel_unet": {"loaded": False, "status": "NOT_LOADED", "checkpoint": None},
            "segformer": {"loaded": False, "status": "NOT_LOADED", "checkpoint": None},
            "deeplab_roads": {"loaded": False, "status": "NOT_LOADED", "checkpoint": None},
        }

        # Initialize and attempt to load available weights
        self.load_all_models()

    @classmethod
    def get_instance(cls) -> "CadastraModelManager":
        if cls._instance is None:
            cls._instance = CadastraModelManager()
        return cls._instance

    def load_all_models(self) -> Dict[str, Any]:
        """Attempts to load all specialized model checkpoints."""
        # 1. Parcel U-Net
        try:
            self.model_parcel = ParcelUNet(in_channels=3, num_classes=2).to(self.device)
            ckpt_parcel = os.path.join(WEIGHTS_DIR, "unet_cadastral.pth")
            if os.path.exists(ckpt_parcel):
                state = torch.load(ckpt_parcel, map_location=self.device)
                self.model_parcel.load_state_dict(state, strict=False)
                self.model_parcel.eval()
                self.statuses["parcel_unet"] = {"loaded": True, "status": "COMPLETE", "checkpoint": ckpt_parcel}
            else:
                self.model_parcel.eval()
                self.statuses["parcel_unet"] = {"loaded": False, "status": "BASELINE_INITIALIZED", "checkpoint": None}
        except Exception as e:
            logger.error(f"Failed to load Parcel U-Net: {e}")
            self.statuses["parcel_unet"] = {"loaded": False, "status": "FAILED", "error": str(e)}

        # 2. SegFormer Features & LULC
        try:
            self.model_features = SegFormerFeatures(in_channels=3, num_classes=6).to(self.device)
            ckpt_segformer = os.path.join(WEIGHTS_DIR, "segformer_features.pth")
            if os.path.exists(ckpt_segformer):
                state = torch.load(ckpt_segformer, map_location=self.device)
                self.model_features.load_state_dict(state, strict=False)
                self.model_features.eval()
                self.statuses["segformer"] = {"loaded": True, "status": "COMPLETE", "checkpoint": ckpt_segformer}
            else:
                self.model_features.eval()
                self.statuses["segformer"] = {"loaded": False, "status": "BASELINE_INITIALIZED", "checkpoint": None}
        except Exception as e:
            logger.error(f"Failed to load SegFormer: {e}")
            self.statuses["segformer"] = {"loaded": False, "status": "FAILED", "error": str(e)}

        # 3. DeepLab Roads & Pathways
        try:
            self.model_roads = DeepLabRoads(in_channels=3, num_classes=3).to(self.device)
            ckpt_roads = os.path.join(WEIGHTS_DIR, "deeplab_roads.pth")
            if os.path.exists(ckpt_roads):
                state = torch.load(ckpt_roads, map_location=self.device)
                self.model_roads.load_state_dict(state, strict=False)
                self.model_roads.eval()
                self.statuses["deeplab_roads"] = {"loaded": True, "status": "COMPLETE", "checkpoint": ckpt_roads}
            else:
                self.model_roads.eval()
                self.statuses["deeplab_roads"] = {"loaded": False, "status": "BASELINE_INITIALIZED", "checkpoint": None}
        except Exception as e:
            logger.error(f"Failed to load DeepLab Roads: {e}")
            self.statuses["deeplab_roads"] = {"loaded": False, "status": "FAILED", "error": str(e)}

        return self.get_summary()

    def get_summary(self) -> Dict[str, Any]:
        """Returns overall runtime and model status."""
        has_loaded_weights = any(s["loaded"] for s in self.statuses.values())
        return {
            "device": str(self.device),
            "cuda_available": torch.cuda.is_available(),
            "production_ai": has_loaded_weights,
            "engine": "pytorch_ensemble" if has_loaded_weights else "opencv_fallback",
            "models": self.statuses,
            "model_metadata": {
                "ensemble_version": "2.0.0-SIH",
                "model_parcel": "ParcelUNet-V1",
                "model_features": "SegFormer-MiT-B1",
                "model_roads": "DeepLabV3Plus-ASPP",
                "inference_date": datetime.date.today().isoformat(),
                "confidence_threshold": 0.40,
                "device": str(self.device),
            },
        }

    def predict_tile(
        self,
        tile_rgb: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray], Dict[str, str]]:
        """
        Runs inference on a single (512, 512, 3) RGB tile through available models.
        Returns:
          (prob_boundary, prob_building, prob_road, model_execution_states)
        """
        h, w = tile_rgb.shape[:2]
        tensor = torch.from_numpy(tile_rgb.transpose(2, 0, 1)).float() / 255.0
        mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)
        x = ((tensor - mean) / std).unsqueeze(0).to(self.device)

        exec_states = {}

        # 1. Parcel Boundary Model
        if self.model_parcel is not None and self.statuses["parcel_unet"]["status"] != "FAILED":
            try:
                with torch.no_grad():
                    logits = self.model_parcel(x)
                    probs = F.softmax(logits, dim=1).squeeze(0).cpu().numpy()
                    prob_boundary = probs[1]  # Class 1: Boundary
                    exec_states["parcel_model"] = "COMPLETE"
            except Exception as e:
                logger.error(f"Parcel model runtime failure: {e}")
                prob_boundary = np.zeros((h, w), dtype=np.float32)
                exec_states["parcel_model"] = f"FAILED: {str(e)[:50]}"
        else:
            prob_boundary = np.zeros((h, w), dtype=np.float32)
            exec_states["parcel_model"] = "NOT_AVAILABLE"

        # 2. SegFormer Building & Feature Model
        if self.model_features is not None and self.statuses["segformer"]["status"] != "FAILED":
            try:
                with torch.no_grad():
                    logits = self.model_features(x)
                    probs = F.softmax(logits, dim=1).squeeze(0).cpu().numpy()
                    prob_building = probs[1]  # Class 1: Building Footprint
                    exec_states["segformer_model"] = "COMPLETE"
            except Exception as e:
                logger.error(f"SegFormer model runtime failure: {e}")
                prob_building = np.zeros((h, w), dtype=np.float32)
                exec_states["segformer_model"] = f"FAILED: {str(e)[:50]}"
        else:
            prob_building = np.zeros((h, w), dtype=np.float32)
            exec_states["segformer_model"] = "NOT_AVAILABLE"

        # 3. DeepLab Road Model
        if self.model_roads is not None and self.statuses["deeplab_roads"]["status"] != "FAILED":
            try:
                with torch.no_grad():
                    logits = self.model_roads(x)
                    probs = F.softmax(logits, dim=1).squeeze(0).cpu().numpy()
                    prob_road = probs[1] + probs[2] if probs.shape[0] > 2 else probs[1]
                    exec_states["road_model"] = "COMPLETE"
            except Exception as e:
                logger.error(f"Road model runtime failure: {e}")
                prob_road = None
                exec_states["road_model"] = f"FAILED: {str(e)[:50]}"
        else:
            prob_road = None
            exec_states["road_model"] = "NOT_AVAILABLE"

        return prob_boundary, prob_building, prob_road, exec_states


# Global accessor
def get_model_manager() -> CadastraModelManager:
    return CadastraModelManager.get_instance()
