"""
Model 3: DeepLabV3+ Road & Access Corridor Segmentation.
Task: Semantic extraction of linear transportation networks, paved roads, alleys, and pathways.
Architecture: DeepLabV3+ with Atrous Spatial Pyramid Pooling (ASPP) to capture long continuous linear connectivity.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class ASPPConv(nn.Sequential):
    def __init__(self, in_channels: int, out_channels: int, dilation: int):
        super().__init__(
            nn.Conv2d(
                in_channels, out_channels, kernel_size=3,
                padding=dilation, dilation=dilation, bias=False,
            ),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )


class ASPPPooling(nn.Sequential):
    def __init__(self, in_channels: int, out_channels: int):
        super().__init__(
            nn.AdaptiveAvgPool2d(1),
            nn.Conv2d(in_channels, out_channels, kernel_size=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        size = x.shape[-2:]
        for mod in self:
            x = mod(x)
        return F.interpolate(x, size=size, mode="bilinear", align_corners=False)


class ASPP(nn.Module):
    """Atrous Spatial Pyramid Pooling module for multi-scale linear feature capture."""
    def __init__(self, in_channels: int, atrous_rates: list = [6, 12, 18], out_channels: int = 256):
        super().__init__()
        modules = [
            nn.Sequential(
                nn.Conv2d(in_channels, out_channels, kernel_size=1, bias=False),
                nn.BatchNorm2d(out_channels),
                nn.ReLU(inplace=True),
            )
        ]
        for rate in atrous_rates:
            modules.append(ASPPConv(in_channels, out_channels, rate))
        modules.append(ASPPPooling(in_channels, out_channels))

        self.convs = nn.ModuleList(modules)
        self.project = nn.Sequential(
            nn.Conv2d(len(self.convs) * out_channels, out_channels, kernel_size=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        res = [conv(x) for conv in self.convs]
        return self.project(torch.cat(res, dim=1))


class DeepLabRoads(nn.Module):
    """
    DeepLabV3+ Network specialized for Road and Access Corridor extraction.
    Outputs:
      0: Non-road
      1: Primary/Secondary Paved Road
      2: Narrow Pathway / Pedestrian Corridor / Unpaved Track
    """
    def __init__(self, in_channels: int = 3, num_classes: int = 3):
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes

        # ResNet-style Feature Backbone
        self.entry = nn.Sequential(
            nn.Conv2d(in_channels, 64, kernel_size=7, stride=2, padding=3, bias=False),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=3, stride=2, padding=1),
        )

        # Low-level features
        self.low_level_conv = nn.Sequential(
            nn.Conv2d(64, 48, kernel_size=1, bias=False),
            nn.BatchNorm2d(48),
            nn.ReLU(inplace=True),
        )

        # High-level dilated convolutions
        self.mid_level = nn.Sequential(
            nn.Conv2d(64, 128, kernel_size=3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.Conv2d(128, 256, kernel_size=3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
        )

        # ASPP module
        self.aspp = ASPP(in_channels=256, atrous_rates=[6, 12, 18], out_channels=256)

        # Decoder head
        self.decoder = nn.Sequential(
            nn.Conv2d(256 + 48, 256, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Conv2d(256, 128, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.Conv2d(128, num_classes, kernel_size=1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        input_size = x.shape[2:]

        low_level = self.entry(x)
        high_level = self.mid_level(low_level)
        aspp_features = self.aspp(high_level)

        # Upsample high-level ASPP to low-level resolution
        aspp_up = F.interpolate(aspp_features, size=low_level.shape[2:], mode="bilinear", align_corners=False)
        low_projected = self.low_level_conv(low_level)

        fused = torch.cat([aspp_up, low_projected], dim=1)
        logits = self.decoder(fused)

        return F.interpolate(logits, size=input_size, mode="bilinear", align_corners=False)
