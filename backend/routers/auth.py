"""
Authentication API Router for CadastraAI.

Endpoints:
  POST /api/auth/login    - Authenticate and receive session token & user info
  POST /api/auth/logout   - Invalidate session token
  GET  /api/auth/me       - Retrieve authenticated user profile
"""

import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.db_models import User
from backend.services.auth_service import (
    verify_password,
    create_access_token,
    invalidate_token,
    get_token_from_header,
    get_current_user,
    create_audit_log,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user with email and password."""
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Please contact an Administrator.",
        )

    # Update last login
    user.last_login = datetime.datetime.utcnow()
    db.commit()

    token = create_access_token(user)

    create_audit_log(
        db=db,
        action="USER_LOGIN",
        user=user,
        reason_notes=f"User {user.email} logged in successfully.",
    )

    return {
        "status": "success",
        "token": token,
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "organization": user.organization,
            "is_active": user.is_active,
            "last_login": user.last_login.isoformat() if user.last_login else None,
        },
    }


@router.post("/logout")
def logout(
    authorization: Optional[str] = Header(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Log out and invalidate session token."""
    token = get_token_from_header(authorization)
    if token:
        invalidate_token(token)

    create_audit_log(
        db=db,
        action="USER_LOGOUT",
        user=current_user,
        reason_notes=f"User {current_user.email} logged out.",
    )

    return {"status": "success", "message": "Logged out successfully"}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Retrieve currently authenticated user profile."""
    return {
        "id": current_user.id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "role": current_user.role,
        "organization": current_user.organization,
        "is_active": current_user.is_active,
        "last_login": current_user.last_login.isoformat() if current_user.last_login else None,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }
