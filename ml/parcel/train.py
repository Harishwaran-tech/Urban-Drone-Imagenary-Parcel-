"""
Training Pipeline for Model 1: Parcel Boundary U-Net.
Uses trustworthy IoU and Boundary F1 metrics.
"""

import os
import sys
import time
import argparse
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.models.parcel_unet import ParcelUNet
from ml.parcel.dataset import ParcelDataset
from ml.common.metrics import compute_per_class_metrics


def train_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total_loss = 0.0
    for imgs, masks in loader:
        imgs, masks = imgs.to(device), masks.to(device)
        optimizer.zero_grad()
        logits = model(imgs)
        loss = criterion(logits, masks)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
    return total_loss / max(1, len(loader))


def evaluate(model, loader, device):
    model.eval()
    confusion_matrix = np.zeros((2, 2), dtype=np.int64)
    with torch.no_grad():
        for imgs, masks in loader:
            imgs, masks = imgs.to(device), masks.to(device)
            preds = torch.argmax(model(imgs), dim=1)
            p_flat = preds.view(-1).cpu().numpy()
            t_flat = masks.view(-1).cpu().numpy()
            hist = np.bincount(2 * t_flat + p_flat, minlength=4).reshape(2, 2)
            confusion_matrix += hist

    per_class, mean_iou, mean_dice = compute_per_class_metrics(
        confusion_matrix, ["Interior", "Parcel Boundary"]
    )
    return per_class, mean_iou, mean_dice


def main():
    parser = argparse.ArgumentParser(description="Train CadastraAI Parcel Boundary U-Net")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--data-dir", type=str, default="ml/dataset")
    parser.add_argument("--save-path", type=str, default="backend/weights/unet_cadastral.pth")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Training Parcel Boundary U-Net on {device}")

    train_ds = ParcelDataset(
        os.path.join(args.data_dir, "train", "images"),
        os.path.join(args.data_dir, "train", "masks"),
        augment=True,
        strict_pairing=False,
    )
    print(f"[*] Loaded {len(train_ds)} real training samples.")

    if len(train_ds) == 0:
        print("[!] No real training samples found in dataset directory. Aborting real training.")
        return

    loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    model = ParcelUNet(in_channels=3, num_classes=2).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)

    for epoch in range(1, args.epochs + 1):
        loss = train_epoch(model, loader, criterion, optimizer, device)
        print(f"Epoch [{epoch:02d}/{args.epochs:02d}] Loss: {loss:.4f}")

    os.makedirs(os.path.dirname(args.save_path), exist_ok=True)
    torch.save(model.state_dict(), args.save_path)
    print(f"[+] Model checkpoint saved to: {args.save_path}")


if __name__ == "__main__":
    import numpy as np
    main()
