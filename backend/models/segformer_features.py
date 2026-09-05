"""
Model 2: SegFormer Feature & Land-Use Segmentation.
Tasks:
  1. Building footprint delineation
  2. Land-use / land-cover (LULC) classification (residential, commercial, industrial, open/vacant, vegetation)
Architecture: Hierarchical multi-scale patch encoder with All-MLP lightweight decoder.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List, Tuple


class OverlapPatchEmbed(nn.Module):
    """Image to Patch Embedding with Overlapping 2D Convolutions."""
    def __init__(self, in_channels: int, embed_dim: int, patch_size: int = 7, stride: int = 4):
        super().__init__()
        self.proj = nn.Conv2d(
            in_channels, embed_dim,
            kernel_size=patch_size, stride=stride, padding=patch_size // 2
        )
        self.norm = nn.BatchNorm2d(embed_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.proj(x)
        return self.norm(x)


class MLPBlock(nn.Module):
    """Lightweight MLP Feed-Forward Block with residual connection."""
    def __init__(self, dim: int, mlp_ratio: float = 4.0):
        super().__init__()
        hidden_dim = int(dim * mlp_ratio)
        self.fc1 = nn.Conv2d(dim, hidden_dim, kernel_size=1)
        self.dwconv = nn.Conv2d(hidden_dim, hidden_dim, kernel_size=3, padding=1, groups=hidden_dim)
        self.act = nn.GELU()
        self.fc2 = nn.Conv2d(hidden_dim, dim, kernel_size=1)
        self.norm = nn.BatchNorm2d(dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        res = x
        x = self.fc1(x)
        x = self.dwconv(x)
        x = self.act(x)
        x = self.fc2(x)
        return self.norm(x + res)


class SegFormerFeatures(nn.Module):
    """
    SegFormer Multi-Scale Architecture for Building Footprints & LULC Mapping.
    Classes:
      0: Background / Non-built
      1: Building Footprint
      2: Residential Land Use
      3: Commercial / Institutional Land Use
      4: Industrial Land Use
      5: Vegetation / Open Ground
    """
    def __init__(self, in_channels: int = 3, num_classes: int = 6):
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes

        # 4-stage Hierarchical Encoder
        self.patch_embed1 = OverlapPatchEmbed(in_channels, 64, patch_size=7, stride=4)
        self.block1 = nn.Sequential(MLPBlock(64), MLPBlock(64))

        self.patch_embed2 = OverlapPatchEmbed(64, 128, patch_size=3, stride=2)
        self.block2 = nn.Sequential(MLPBlock(128), MLPBlock(128))

        self.patch_embed3 = OverlapPatchEmbed(128, 256, patch_size=3, stride=2)
        self.block3 = nn.Sequential(MLPBlock(256), MLPBlock(256))

        self.patch_embed4 = OverlapPatchEmbed(256, 320, patch_size=3, stride=2)
        self.block4 = nn.Sequential(MLPBlock(320), MLPBlock(320))

        # MLP Decoder
        decoder_dim = 256
        self.linear_c1 = nn.Conv2d(64, decoder_dim, kernel_size=1)
        self.linear_c2 = nn.Conv2d(128, decoder_dim, kernel_size=1)
        self.linear_c3 = nn.Conv2d(256, decoder_dim, kernel_size=1)
        self.linear_c4 = nn.Conv2d(320, decoder_dim, kernel_size=1)

        self.linear_fuse = nn.Sequential(
            nn.Conv2d(decoder_dim * 4, decoder_dim, kernel_size=1, bias=False),
            nn.BatchNorm2d(decoder_dim),
            nn.GELU(),
        )

        # Output head
        self.classifier = nn.Conv2d(decoder_dim, num_classes, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h, w = x.shape[2:]

        # Encoder stages
        c1 = self.block1(self.patch_embed1(x))
        c2 = self.block2(self.patch_embed2(c1))
        c3 = self.block3(self.patch_embed3(c2))
        c4 = self.block4(self.patch_embed4(c3))

        # Decoder fusion
        _c1 = F.interpolate(self.linear_c1(c1), size=c1.shape[2:], mode="bilinear", align_corners=False)
        _c2 = F.interpolate(self.linear_c2(c2), size=c1.shape[2:], mode="bilinear", align_corners=False)
        _c3 = F.interpolate(self.linear_c3(c3), size=c1.shape[2:], mode="bilinear", align_corners=False)
        _c4 = F.interpolate(self.linear_c4(c4), size=c1.shape[2:], mode="bilinear", align_corners=False)

        fused = self.linear_fuse(torch.cat([_c1, _c2, _c3, _c4], dim=1))
        logits = self.classifier(fused)
        # Upsample directly back to original input spatial dimensions
        return F.interpolate(logits, size=(h, w), mode="bilinear", align_corners=False)
