from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User, UserRole
from app.models.audit import AuditLog
from app.schemas.user import UserCreate, UserResponse, UserLogin, Token
from app.auth.security import verify_password, get_password_hash, create_access_token
from app.auth.dependencies import get_current_user, require_admin

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/auth", tags=["Authentication & Access Control"])

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, form_data: UserLogin, db: Session = Depends(get_db)):
    """Authenticate user and return JWT access token. Rate-limited to 10 attempts/min per IP."""
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    access_token = create_access_token(subject=user.username, role=user.role.value)

    # Audit log
    audit = AuditLog(
        user_id=user.id,
        action="USER_LOGIN",
        entity_type="User",
        entity_id=str(user.id),
        details_json=f'{{"username": "{user.username}", "role": "{user.role.value}"}}'
    )
    db.add(audit)
    db.commit()

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.post("/token", response_model=Token)
def login_for_swagger(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """OAuth2 password grant endpoint for Swagger UI testing."""
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(subject=user.username, role=user.role.value)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.get("/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Retrieve profile and permissions for currently authenticated user."""
    return current_user

@router.get("/users", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """List all user accounts (Admin only)."""
    return db.query(User).all()

@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_in: UserCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Create a new user account with specific role (Admin only)."""
    existing_user = db.query(User).filter(
        (User.username == user_in.username) | (User.email == user_in.email)
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )

    new_user = User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    audit = AuditLog(
        user_id=admin_user.id,
        action="CREATE_USER",
        entity_type="User",
        entity_id=str(new_user.id),
        details_json=f'{{"created_user": "{new_user.username}", "role": "{new_user.role.value}"}}'
    )
    db.add(audit)
    db.commit()

    return new_user
