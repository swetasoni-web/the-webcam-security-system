from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

class FaceEnrollRequest(BaseModel):
    name: str
    identity_code: str
    role_or_department: Optional[str] = "Staff"
    consent_recorded: bool = True
    notes: Optional[str] = None

class FaceResponse(BaseModel):
    id: int
    name: str
    identity_code: str
    role_or_department: Optional[str]
    photo_path: Optional[str]
    consent_recorded: bool
    notes: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class FaceMatchResult(BaseModel):
    is_known: bool
    name: str
    identity_code: Optional[str] = None
    confidence: float
    bbox: List[int]  # [x1, y1, x2, y2]
