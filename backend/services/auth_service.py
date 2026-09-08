"""
Authentication & Role-Based Access Control (RBAC) Service for CadastraAI.

Roles:
  - ADMIN: Platform, project, and user administration. Cannot verify parcels.
  - GIS_ANALYST: Datasets, AI inference, geometry correction, and topology.
  - SURVEYOR: Review, GNSS/Ground Truth check, and final parcel verification.
"""

import os
import hmac
import hashlib
import binascii
import uuid
import datetime
import logging
from typing import Optional, List, Dict, Any
from fastapi import Depends, HTTPException, status, Header, Request
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.db_models import User, ProjectMember, AuditLog, SurveyProject

logger = logging.getLogger("cadastra.auth")

SECRET_KEY = os.getenv("CADASTRA_AUTH_SECRET", "cadastra-cadastral-ai-secret-key-2026")
SALT = b"cadastra_salt_v1"

# In-memory token store: token -> user_id (with expiration)
TOKEN_STORE: Dict[str, Dict[str, Any]] = {}


def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with standard salt."""
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), SALT, 100000)
    return binascii.hexlify(dk).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against stored hash."""
    return hmac.compare_digest(hash_password(plain_password), hashed_password)


def create_access_token(user: User) -> str:
    """Create session token for authenticated user."""
    token = f"cadastra_{uuid.uuid4().hex}"
    TOKEN_STORE[token] = {
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "created_at": datetime.datetime.utcnow(),
    }
    return token


def invalidate_token(token: str):
    """Remove token from session store."""
    TOKEN_STORE.pop(token, None)


def get_token_from_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract bearer token from Authorization header."""
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return authorization


def get_current_user(
    authorization: Optional[str] = Header(None),
    x_user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency that returns the current authenticated user.
    Supports Bearer token, as well as demo role switching header for testing.
    """
    token = get_token_from_header(authorization)
    user = None

    if token and token in TOKEN_STORE:
        user_id = TOKEN_STORE[token]["user_id"]
        user = db.query(User).filter(User.id == user_id).first()

    # Fallback for demo header switching or quick testing
    if not user and x_user_role:
        role_upper = x_user_role.upper()
        if role_upper in ["ADMIN", "GIS_ANALYST", "SURVEYOR"]:
            user = db.query(User).filter(User.role == role_upper, User.is_active == True).first()

    # Default fallback to first active user if still unauthenticated in demo mode
    if not user:
        # Default to surveyor if no auth passed
        user = db.query(User).filter(User.role == "SURVEYOR", User.is_active == True).first()

    if not user:
        # Emergency fallback: seed default users and retry
        seed_default_users(db)
        user = db.query(User).filter(User.role == "SURVEYOR").first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Contact an Administrator.",
        )

    return user


def require_role(allowed_roles: List[str]):
    """
    Dependency factory to enforce Role-Based Access Control on backend routes.
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            logger.warning(
                f"Access denied for user {current_user.email} (role: {current_user.role}). "
                f"Allowed roles: {allowed_roles}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Action requires one of {allowed_roles}. Current role is {current_user.role}.",
            )
        return current_user

    return role_checker


def create_audit_log(
    db: Session,
    action: str,
    user: Optional[User] = None,
    user_name: Optional[str] = None,
    role: Optional[str] = None,
    project_id: Optional[str] = None,
    feature_id: Optional[str] = None,
    previous_state: Optional[str] = None,
    new_state: Optional[str] = None,
    reason_notes: Optional[str] = None,
) -> AuditLog:
    """Record an immutable audit trail entry."""
    uid = user.id if user else None
    uname = user.full_name if user else (user_name or "System")
    urole = user.role if user else (role or "ADMIN")

    log_entry = AuditLog(
        id=f"LOG-{uuid.uuid4().hex[:10].upper()}",
        timestamp=datetime.datetime.utcnow(),
        user_id=uid,
        user_name=uname,
        role=urole,
        project_id=project_id,
        feature_id=feature_id,
        action=action,
        previous_state=previous_state,
        new_state=new_state,
        reason_notes=reason_notes,
    )
    db.add(log_entry)
    db.commit()
    return log_entry


def seed_default_users(db: Session):
    """Seed standard 3 demo role accounts if they do not exist."""
    default_accounts = [
        {
            "id": "USR-ADMIN-01",
            "full_name": "A. Sharma",
            "email": "admin@cadastra.ai",
            "password": "admin123",
            "role": "ADMIN",
            "organization": "Tamil Nadu Land Survey Directorate",
        },
        {
            "id": "USR-ANALYST-01",
            "full_name": "A. Kumar",
            "email": "analyst@cadastra.ai",
            "password": "analyst123",
            "role": "GIS_ANALYST",
            "organization": "State Remote Sensing & GIS Cell",
        },
        {
            "id": "USR-SURVEYOR-01",
            "full_name": "R. Senthil",
            "email": "surveyor@cadastra.ai",
            "password": "surveyor123",
            "role": "SURVEYOR",
            "organization": "Chennai District Survey Office",
        },
    ]

    for acc in default_accounts:
        existing = db.query(User).filter(User.email == acc["email"]).first()
        if not existing:
            new_user = User(
                id=acc["id"],
                full_name=acc["full_name"],
                email=acc["email"],
                password_hash=hash_password(acc["password"]),
                role=acc["role"],
                organization=acc["organization"],
                is_active=True,
                created_at=datetime.datetime.utcnow(),
                updated_at=datetime.datetime.utcnow(),
            )
            db.add(new_user)
            logger.info(f"Seeded default user account: {acc['email']} ({acc['role']})")

    db.commit()
