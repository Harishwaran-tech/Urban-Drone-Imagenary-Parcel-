"""
Training Pipeline for Model 3: DeepLabV3+ Road & Corridor Extraction.
"""

import os
import sys
import argparse
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.models.deeplab_roads import DeepLabRoads
from ml.roads.dataset import RoadsDataset


def main():
    parser = argparse.ArgumentParser(description="Train CadastraAI DeepLab Roads Model")
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=6e-4)
    parser.add_argument("--data-dir", type=str, default="ml/dataset")
    parser.add_argument("--save-path", type=str, default="backend/weights/deeplab_roads.pth")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Training DeepLab Roads on {device}")

    train_ds = RoadsDataset(
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
    model = DeepLabRoads(in_channels=3, num_classes=3).to(device)
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
    print(f"[+] DeepLab Roads checkpoint saved to: {args.save_path}")


if __name__ == "__main__":
    main()
