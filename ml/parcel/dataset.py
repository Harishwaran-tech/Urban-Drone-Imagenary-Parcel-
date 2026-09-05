"""
Task-Specific Dataset for Parcel Boundary & Wall Segmentation.
Uses stem-based pairing, strict validation, and synchronized augmentation.
"""

from ml.dataset.dataset import AerialCadastralDataset

class ParcelDataset(AerialCadastralDataset):
    """Specialized dataset for Parcel Boundaries (Class 0: Interior, Class 1: Boundary)."""
    pass
