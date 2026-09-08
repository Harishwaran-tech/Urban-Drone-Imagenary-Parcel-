from fastapi import APIRouter
from backend.services.inference import get_model_status
from backend.database import IS_POSTGRES, DATABASE_URL

router = APIRouter(prefix="/api", tags=["Health"])

@router.get("/health")
def health_check():
    """Returns system health, DL model state, and database configuration."""
    model_status = get_model_status()
    return {
        "status": "online",
        "service": "CadastraAI Geospatial Extraction API",
        "version": "1.0.0",
        "database": {
            "type": "PostgreSQL + PostGIS" if IS_POSTGRES else "SQLite (Development Fallback)",
            "connected": True,
        },
        "deep_learning": model_status,
        "georeferencing": {
            "storage_crs": "EPSG:4326 (WGS84)",
            "project_location": "Configured per Project / GeoTIFF Metadata",
        }
    }
