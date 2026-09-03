from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.db_models import Conflict

router = APIRouter(prefix="/api/conflicts", tags=["Conflicts"])

@router.get("")
def list_conflicts(
    project_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    conflict_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Lists detected cadastral conflicts and spatial discrepancies."""
    query = db.query(Conflict)
    if project_id:
        query = query.filter(Conflict.project_id == project_id)
    if severity and severity != "all":
        query = query.filter(Conflict.severity == severity)
    if conflict_type and conflict_type != "all":
        query = query.filter(Conflict.conflict_type == conflict_type)

    conflicts = query.all()
    return {
        "count": len(conflicts),
        "conflicts": [
            {
                "id": c.id,
                "project_id": c.project_id,
                "parcel_id": c.parcel_id,
                "conflict_type": c.conflict_type,
                "severity": c.severity,
                "description": c.description,
                "status": c.status,
            }
            for c in conflicts
        ]
    }
