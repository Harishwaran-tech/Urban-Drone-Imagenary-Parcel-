"""
Audit Log Router for CadastraAI.

Provides immutable traceability for all cadastral feature lifecycle events,
dataset uploads, geometry edits, topology corrections, and verification actions.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.database import get_db
from backend.models.db_models import AuditLog, User
from backend.services.auth_service import get_current_user

router = APIRouter(prefix="/api/audit-logs", tags=["Audit Log"])


@router.get("")
def get_audit_logs(
    project_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    feature_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve audit trail records.
    Admin can view all records.
    GIS Analyst and Surveyor view records scoped to their projects or actions.
    """
    query = db.query(AuditLog)

    # RBAC filtering: if not Admin, scope to project or own user ID
    if current_user.role != "ADMIN":
        if project_id:
            query = query.filter(AuditLog.project_id == project_id)
        else:
            query = query.filter(AuditLog.user_id == current_user.id)
    else:
        if project_id:
            query = query.filter(AuditLog.project_id == project_id)

    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))
    if feature_id:
        query = query.filter(AuditLog.feature_id == feature_id)

    records = query.order_by(desc(AuditLog.timestamp)).limit(limit).all()

    return [
        {
            "id": r.id,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "user_id": r.user_id,
            "user_name": r.user_name,
            "role": r.role,
            "project_id": r.project_id,
            "feature_id": r.feature_id,
            "action": r.action,
            "previous_state": r.previous_state,
            "new_state": r.new_state,
            "reason_notes": r.reason_notes,
        }
        for r in records
    ]
