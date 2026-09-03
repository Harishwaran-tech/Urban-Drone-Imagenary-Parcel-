import os
import sys
import argparse
import time
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.models.unet import UNet
from ml.dataset.dataset import AerialCadastralDataset


class MultiClassDiceLoss(nn.Module):
    """Computes Dice loss for multi-class semantic segmentation."""
    def __init__(self, smooth: float = 1.0, ignore_index: int = -100):
        super().__init__()
        self.smooth = smooth
        self.ignore_index = ignore_index

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        num_classes = logits.shape[1]
        probs = F.softmax(logits, dim=1)

        # One-hot encode targets [B, H, W] => [B, C, H, W]
        targets_one_hot = F.one_hot(targets, num_classes=num_classes).permute(0, 3, 1, 2).float()

        dice_total = 0.0
        # Compute dice across foreground classes (skip background class 0 for score weighting if desired)
        for c in range(num_classes):
            p = probs[:, c, :, :]
            t = targets_one_hot[:, c, :, :]
            intersection = (p * t).sum(dim=(1, 2))
            cardinality = p.sum(dim=(1, 2)) + t.sum(dim=(1, 2))
            dice = (2.0 * intersection + self.smooth) / (cardinality + self.smooth)
            dice_total += dice.mean()

        return 1.0 - (dice_total / num_classes)


class CombinedLoss(nn.Module):
    """Combines Cross Entropy Loss with Multi-Class Dice Loss for balanced training."""
    def __init__(self, weight_ce: float = 0.5, weight_dice: float = 0.5):
        super().__init__()
        self.ce = nn.CrossEntropyLoss()
        self.dice = MultiClassDiceLoss()
        self.weight_ce = weight_ce
        self.weight_dice = weight_dice

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        loss_ce = self.ce(logits, targets)
        loss_dice = self.dice(logits, targets)
        return self.weight_ce * loss_ce + self.weight_dice * loss_dice


def compute_iou(preds: torch.Tensor, targets: torch.Tensor, num_classes: int = 4) -> float:
    """Calculates Mean Intersection over Union (mIoU)."""
    ious = []
    for c in range(num_classes):
        p_c = preds == c
        t_c = targets == c
        intersection = (p_c & t_c).sum().item()
        union = (p_c | t_c).sum().item()
        if union == 0:
            ious.append(1.0)
        else:
            ious.append(intersection / union)
    return sum(ious) / len(ious)


def train_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total_loss = 0.0
    total_iou = 0.0

    for imgs, masks in loader:
        imgs = imgs.to(device)
        masks = masks.to(device)

        optimizer.zero_grad()
        logits = model(imgs)
        loss = criterion(logits, masks)
        loss.backward()
        optimizer.step()

        preds = torch.argmax(logits, dim=1)
        iou = compute_iou(preds, masks)

        total_loss += loss.item()
        total_iou += iou

    return total_loss / max(1, len(loader)), total_iou / max(1, len(loader))


def evaluate(model, loader, criterion, device):
    model.eval()
    total_loss = 0.0
    total_iou = 0.0

    with torch.no_grad():
        for imgs, masks in loader:
            imgs = imgs.to(device)
            masks = masks.to(device)

            logits = model(imgs)
            loss = criterion(logits, masks)

            preds = torch.argmax(logits, dim=1)
            iou = compute_iou(preds, masks)

            total_loss += loss.item()
            total_iou += iou

    return total_loss / max(1, len(loader)), total_iou / max(1, len(loader))


def main():
    parser = argparse.ArgumentParser(description="Train PyTorch U-Net for Aerial Cadastral Segmentation")
    parser.add_argument("--epochs", type=int, default=15, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=4, help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-3, help="Initial learning rate")
    parser.add_argument("--data-dir", type=str, default="ml/dataset", help="Dataset directory path")
    parser.add_argument("--save-path", type=str, default="backend/weights/unet_cadastral.pth", help="Model checkpoint path")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Training on device: {device}")

    train_img_dir = os.path.join(args.data_dir, "train", "images")
    train_mask_dir = os.path.join(args.data_dir, "train", "masks")
    val_img_dir = os.path.join(args.data_dir, "val", "images")
    val_mask_dir = os.path.join(args.data_dir, "val", "masks")

    train_dataset = AerialCadastralDataset(train_img_dir, train_mask_dir, augment=True)
    val_dataset = AerialCadastralDataset(val_img_dir, val_mask_dir, augment=False)

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False)

    model = UNet(n_channels=3, n_classes=4).to(device)
    criterion = CombinedLoss(weight_ce=0.5, weight_dice=0.5)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    best_iou = 0.0
    os.makedirs(os.path.dirname(args.save_path), exist_ok=True)

    print("==================================================")
    print("Starting CadastraAI U-Net Model Training Loop")
    print("==================================================")

    for epoch in range(1, args.epochs + 1):
        start_time = time.time()
        train_loss, train_iou = train_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_iou = evaluate(model, val_loader, criterion, device)
        scheduler.step()
        elapsed = time.time() - start_time

        print(
            f"Epoch [{epoch:02d}/{args.epochs:02d}] "
            f"Train Loss: {train_loss:.4f} | Train mIoU: {train_iou*100:.1f}% | "
            f"Val Loss: {val_loss:.4f} | Val mIoU: {val_iou*100:.1f}% | "
            f"Time: {elapsed:.1f}s"
        )

        if val_iou >= best_iou:
            best_iou = val_iou
            torch.save(model.state_dict(), args.save_path)
            # Also save to ml/best_model.pth
            torch.save(model.state_dict(), "ml/best_model.pth")
            print(f" -> Checkpoint saved with Val mIoU: {val_iou*100:.2f}%")

    print("\n[+] Training completed successfully.")
    print(f"[+] Best Model Checkpoint: {args.save_path}")


if __name__ == "__main__":
    main()
