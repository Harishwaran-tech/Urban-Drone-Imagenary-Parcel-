"""
Comprehensive Evaluation Metrics for CadastraAI Segmentation.
Implements:
  - Trustworthy IoU (ignores classes absent in both ground truth and prediction)
  - Dice Coefficient (F1 Score)
  - Precision & Recall per class
  - Boundary F1 (BF-score) for parcel boundary contour alignment
  - Hausdorff Distance for cadastral boundary spatial displacement
"""

import numpy as np
import torch
from typing import Dict, Any, List, Tuple, Optional


def compute_per_class_metrics(
    confusion_matrix: np.ndarray,
    class_names: Optional[List[str]] = None,
) -> Tuple[List[Dict[str, Any]], float, float]:
    """
    Computes per-class IoU, Dice, Precision, and Recall from a confusion matrix.
    Crucially ignores absent classes (union == 0) when computing the overall mean IoU
    to prevent artificially inflated evaluation scores.
    """
    num_classes = confusion_matrix.shape[0]
    if not class_names:
        class_names = [f"Class {i}" for i in range(num_classes)]

    per_class = []
    valid_ious = []
    valid_dices = []

    for c in range(num_classes):
        tp = float(confusion_matrix[c, c])
        fp = float(confusion_matrix[:, c].sum() - tp)
        fn = float(confusion_matrix[c, :].sum() - tp)
        union = tp + fp + fn

        # If class is absent in both ground truth and prediction, exclude from mean
        if union == 0:
            per_class.append({
                "class_id": c,
                "class_name": class_names[c],
                "iou": None,
                "dice": None,
                "precision": None,
                "recall": None,
                "present": False,
            })
            continue

        iou = tp / union
        dice = (2.0 * tp) / (2.0 * tp + fp + fn) if (2.0 * tp + fp + fn) > 0 else 0.0
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

        valid_ious.append(iou)
        valid_dices.append(dice)

        per_class.append({
            "class_id": c,
            "class_name": class_names[c],
            "iou": round(iou, 4),
            "dice": round(dice, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "present": True,
            "pixel_count": int(confusion_matrix[c, :].sum()),
        })

    mean_iou = float(np.mean(valid_ious)) if valid_ious else 0.0
    mean_dice = float(np.mean(valid_dices)) if valid_dices else 0.0

    return per_class, round(mean_iou, 4), round(mean_dice, 4)


def compute_boundary_f1(
    pred_mask: np.ndarray,
    target_mask: np.ndarray,
    tolerance_px: int = 2,
) -> float:
    """
    Computes Boundary F1 score (BF-score) measuring how accurately
    the predicted boundary contour aligns within tolerance_px of ground-truth contours.
    """
    import cv2
    pred_u8 = (pred_mask > 0).astype(np.uint8) * 255
    target_u8 = (target_mask > 0).astype(np.uint8) * 255

    # Extract single-pixel contours
    pred_contours, _ = cv2.findContours(pred_u8, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    target_contours, _ = cv2.findContours(target_u8, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)

    pred_edge = np.zeros_like(pred_u8)
    cv2.drawContours(pred_edge, pred_contours, -1, 255, 1)

    target_edge = np.zeros_like(target_u8)
    cv2.drawContours(target_edge, target_contours, -1, 255, 1)

    if pred_edge.sum() == 0 and target_edge.sum() == 0:
        return 1.0
    if pred_edge.sum() == 0 or target_edge.sum() == 0:
        return 0.0

    # Distance transforms for precision and recall buffer
    dist_to_target = cv2.distanceTransform(cv2.bitwise_not(target_edge), cv2.DIST_L2, 3)
    dist_to_pred = cv2.distanceTransform(cv2.bitwise_not(pred_edge), cv2.DIST_L2, 3)

    pred_match = (dist_to_target <= tolerance_px) & (pred_edge == 255)
    target_match = (dist_to_pred <= tolerance_px) & (target_edge == 255)

    precision = float(pred_match.sum()) / max(1.0, float((pred_edge == 255).sum()))
    recall = float(target_match.sum()) / max(1.0, float((target_edge == 255).sum()))

    if precision + recall == 0:
        return 0.0
    return round((2.0 * precision * recall) / (precision + recall), 4)


def compute_hausdorff_displacement_m(
    pred_coords: List[Tuple[float, float]],
    gt_coords: List[Tuple[float, float]],
    pixel_size_m: float = 0.05,
) -> float:
    """
    Computes Hausdorff distance between predicted polygon and ground truth in meters.
    """
    if len(pred_coords) < 3 or len(gt_coords) < 3:
        return 0.0
    from shapely.geometry import Polygon
    p1 = Polygon([(c[0] * pixel_size_m, c[1] * pixel_size_m) for c in pred_coords])
    p2 = Polygon([(c[0] * pixel_size_m, c[1] * pixel_size_m) for c in gt_coords])
    if not p1.is_valid:
        p1 = p1.buffer(0)
    if not p2.is_valid:
        p2 = p2.buffer(0)
    return round(float(p1.hausdorff_distance(p2)), 3)
