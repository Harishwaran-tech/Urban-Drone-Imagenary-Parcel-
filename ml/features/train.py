"""
Training Pipeline for Model 2: SegFormer Building & LULC Mapping.
"""

import os
import sys
import argparse
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.models.segformer_features import SegFormerFeatures
from ml.features.dataset import SegFormerDataset


def main():
    parser = argparse.ArgumentParser(description="Train CadastraAI SegFormer Model")
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=5e-4)
    parser.add_argument("--data-dir", type=str, default="ml/dataset")
    parser.add_argument("--save-path", type=str, default="backend/weights/segformer_features.pth")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Training SegFormer on {device}")

    train_ds = SegFormerDataset(
        os.path.join(args.data_dir, "train", "images"),
        os.path.join(args.data_dir, "train", "masks"),
        augment=True,
        strict_pairing=False,
    )
    print(f"[*] Loaded {len(train_ds)} real training samples.")

    if len(train_ds) == 0:
        print("[!] No real training samples found. Skipping.")
        return

    loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    model = SegFormerFeatures(in_channels=3, num_classes=6).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)

    for epoch in range(1, args.epochs + 1):
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
        print(f"Epoch [{epoch:02d}/{args.epochs:02d}] Loss: {total_loss / len(loader):.4f}")

    os.makedirs(os.path.dirname(args.save_path), exist_ok=True)
    torch.save(model.state_dict(), args.save_path)
    print(f"[+] SegFormer checkpoint saved to: {args.save_path}")


if __name__ == "__main__":
    main()
