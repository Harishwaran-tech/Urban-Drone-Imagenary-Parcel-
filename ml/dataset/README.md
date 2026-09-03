# CadastraAI - Deep Learning Training Dataset Preparation

This directory contains the dataset pipeline for training the PyTorch U-Net semantic segmentation model on high-resolution aerial and drone imagery.

## 1. Directory Structure

Place your training and validation imagery in the following structure:

```
ml/dataset/
├── train/
│   ├── images/
│   │   ├── tile_001.png
│   │   ├── tile_002.png
│   │   └── ...
│   └── masks/
│       ├── tile_001.png
│       ├── tile_002.png
│       └── ...
└── val/
    ├── images/
    │   ├── val_001.png
    │   └── ...
    └── masks/
        ├── val_001.png
        └── ...
```

## 2. Segmentation Mask Class Encoding

Each pixel in the ground-truth mask PNG should be encoded as a single-channel grayscale integer index (0–3):

| Class Index | Class Name | Description | Target Color in Visualization |
|---|---|---|---|
| **0** | `Background` | Vegetation, bare ground, unclassified terrain | Black `[0, 0, 0]` |
| **1** | `Building Footprint` | Rooftops, built structures | Blue `[59, 130, 246]` |
| **2** | `Parcel Boundary` | Walls, fences, property limits | Green `[34, 197, 94]` |
| **3** | `Road / Accessway` | Paved roads, pathways, corridors | Gray `[100, 116, 139]` |

## 3. Recommended Public Aerial Datasets

1. **Inria Aerial Image Labeling Dataset**: 810 km² coverage of urban areas at 0.3m GSD.
2. **SpaceNet 2 / 7 (Building & Urban Footprints)**: High-resolution satellite imagery with polygon building footprints.
3. **DroneDeploy Cadastre & Urban Segmentation Dataset**: Drone imagery with orthomosaics and parcel annotations.
4. **ISPRS Potsdam / Vaihingen 2D Semantic Labeling Contest**: True orthophotos with complete 6-class urban segmentation.

## 4. Converting Vector Shapefile / GeoJSON to Raster Masks

You can use the helper script or GDAL `gdal_rasterize`:

```bash
gdal_rasterize -l parcels -a class_id -ts 512 512 -ot Byte parcels.geojson mask.png
```
