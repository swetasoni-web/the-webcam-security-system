from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.camera import CameraSourceType, CameraStatus

class CameraBase(BaseModel):
    name: str
    source_type: CameraSourceType = CameraSourceType.DEMO
    source_url: str = "0"
    resolution_width: int = 640
    resolution_height: int = 480
    fps: int = 24
    is_active: bool = True

class CameraCreate(CameraBase):
    pass

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    source_type: Optional[CameraSourceType] = None
    source_url: Optional[str] = None
    resolution_width: Optional[int] = None
    resolution_height: Optional[int] = None
    fps: Optional[int] = None
    is_active: Optional[bool] = None

class CameraResponse(CameraBase):
    id: int
    status: CameraStatus
    last_error: Optional[str] = None
    last_seen: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
