from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr
from app.models.user import UserRole

class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: UserRole = UserRole.OPERATOR

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
