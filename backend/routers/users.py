"""
User Management Router for CadastraAI (Admin Only).

Endpoints:
  GET   /api/users        - List all platform users
  POST  /api/users        - Create a new user (ADMIN, GIS_ANALYST, SURVEYOR)
  PATCH /api/users/{id}   - Update user details, role, or active status
"""

import uuid
import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.db_models import User
from backend.services.auth_service import (
    get_current_user,
    require_role,
    hash_password,
    create_audit_log,
)

router = APIRouter(prefix="/api/users", tags=["User Management"])

VALID_ROLES = {"ADMIN", "GIS_ANALYST", "SURVEYOR"}


class CreateUserRequest(BaseModel):
    full_name: str
    email: str
    password: str
    role: str
    organization: Optional[str] = "Tamil Nadu Survey & Land Records"


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    organization: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


@router.get("")
def list_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_role(["ADMIN"])),
):
    """List all platform users (Admin only)."""
    users = db.query(User).order_by(User.created_at.asc()).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "organization": u.organization,
            "is_active": u.is_active,
            "last_login": u.last_login.isoformat() if u.last_login else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.post("")
def create_user(
    payload: CreateUserRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_role(["ADMIN"])),
):
    """Create a new platform user (Admin only)."""
    role = payload.role.upper().strip()
    if role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role '{payload.role}'. Must be one of: {sorted(list(VALID_ROLES))}. (VIEWER role is not supported)",
        )

    email = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{email}' already exists.",
        )

    new_user = User(
        id=f"USR-{uuid.uuid4().hex[:8].upper()}",
        full_name=payload.full_name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role=role,
        organization=payload.organization or "Tamil Nadu Survey & Land Records",
        is_active=True,
        created_at=datetime.datetime.utcnow(),
        updated_at=datetime.datetime.utcnow(),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    create_audit_log(
        db=db,
        action="USER_CREATED",
        user=admin_user,
        reason_notes=f"Admin {admin_user.email} created user {new_user.email} with role {new_user.role}.",
    )

    return {
        "status": "success",
        "message": f"User {new_user.full_name} created successfully.",
        "user": {
            "id": new_user.id,
            "full_name": new_user.full_name,
            "email": new_user.email,
            "role": new_user.role,
            "organization": new_user.organization,
            "is_active": new_user.is_active,
            "created_at": new_user.created_at.isoformat(),
        },
    }


@router.patch("/{user_id}")
def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_role(["ADMIN"])),
):
    """Update user metadata, role, or toggle active/inactive status (Admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID '{user_id}' not found.",
        )

    prev_state = f"Role: {user.role}, Active: {user.is_active}"

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()

    if payload.organization is not None:
        user.organization = payload.organization.strip()

    if payload.role is not None:
        role_upper = payload.role.upper().strip()
        if role_upper not in VALID_ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role '{payload.role}'. Must be one of: {sorted(list(VALID_ROLES))}",
            )
        user.role = role_upper

    if payload.is_active is not None:
        user.is_active = payload.is_active

    if payload.password:
        user.password_hash = hash_password(payload.password)

    user.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(user)

    new_state = f"Role: {user.role}, Active: {user.is_active}"

    create_audit_log(
        db=db,
        action="USER_UPDATED",
        user=admin_user,
        previous_state=prev_state,
        new_state=new_state,
        reason_notes=f"Admin {admin_user.email} updated user {user.email}.",
    )

    return {
        "status": "success",
        "message": f"User {user.full_name} updated successfully.",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "organization": user.organization,
            "is_active": user.is_active,
            "last_login": user.last_login.isoformat() if user.last_login else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        },
    }
