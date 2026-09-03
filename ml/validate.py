import os
import sys
import argparse
import torch
import torch.nn.functional as F
import numpy as np
from torch.utils.data import DataLoader

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.models.unet import UNet
from ml.dataset.dataset import AerialCadastralDataset

CLASS_NAMES = ["Background", "Building Footprint", "Parcel Boundary", "Road / Access"]

def evaluate_metrics(model, loader, device, num_classes=4):
    model.eval()
    
    confusion_matrix = np.zeros((num_classes, num_classes), dtype=np.int64)

    with torch.no_grad():
        for imgs, masks in loader:
            imgs = imgs.to(device)
            masks = masks.to(device)

            logits = model(imgs)
            preds = torch.argmax(logits, dim=1)

            p_flat = preds.view(-1).cpu().numpy()
            t_flat = masks.view(-1).cpu().numpy()

            mask = (t_flat >= 0) & (t_flat < num_classes)
            hist = np.bincount(
                num_classes * t_flat[mask].astype(int) + p_flat[mask],
                minlength=num_classes ** 2,
            ).reshape(num_classes, num_classes)
            confusion_matrix += hist

    # Compute per-class metrics
    results = []
    miou_list = []
    dice_list = []

    for c in range(num_classes):
        tp = confusion_matrix[c, c]
        fp = confusion_matrix[:, c].sum() - tp
        fn = confusion_matrix[c, :].sum() - tp

        iou = tp / max(1, tp + fp + fn)
        dice = (2.0 * tp) / max(1, 2 * tp + fp + fn)
        precision = tp / max(1, tp + fp)
        recall = tp / max(1, tp + fn)

        miou_list.append(iou)
        dice_list.append(dice)

        results.append({
            "class": CLASS_NAMES[c] if c < len(CLASS_NAMES) else f"Class {c}",
            "iou": iou,
            "dice": dice,
            "precision": precision,
            "recall": recall,
        })

    return results, np.mean(miou_list), np.mean(dice_list)


def main():
    parser = argparse.ArgumentParser(description="Evaluate CadastraAI U-Net Segmentation Metrics")
    parser.add_argument("--weights", type=str, default="ml/best_model.pth", help="Trained model path")
    parser.add_argument("--data-dir", type=str, default="ml/dataset/val", help="Validation dataset directory")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Running evaluation on device: {device}")

    val_img_dir = os.path.join(args.data_dir, "images")
    val_mask_dir = os.path.join(args.data_dir, "masks")
    val_dataset = AerialCadastralDataset(val_img_dir, val_mask_dir, augment=False)
    val_loader = DataLoader(val_dataset, batch_size=4, shuffle=False)

    model = UNet(n_channels=3, n_classes=4).to(device)

    if os.path.exists(args.weights):
        print(f"[*] Loading model weights: {args.weights}")
        model.load_state_dict(torch.load(args.weights, map_location=device))
    else:
        print("[!] Warning: Checkpoint not found. Evaluating initialized baseline model.")

    results, m_iou, m_dice = evaluate_metrics(model, val_loader, device)

    print("\n" + "=" * 75)
    print(f"{'Class Name':<22} | {'IoU (Jaccard)':<14} | {'Dice (F1)':<12} | {'Precision':<10} | {'Recall':<10}")
    print("-" * 75)
    for r in results:
        print(f"{r['class']:<22} | {r['iou']*100:>12.2f}% | {r['dice']*100:>10.2f}% | {r['precision']*100:>8.2f}% | {r['recall']*100:>8.2f}%")
    print("-" * 75)
    print(f"{'MEAN OVERALL':<22} | {m_iou*100:>12.2f}% | {m_dice*100:>10.2f}% |")
    print("=" * 75)


if __name__ == "__main__":
    main()
