import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from app.database import Base

class CameraSourceType(str, enum.Enum):
    WEBCAM = "WEBCAM"
    RTSP = "RTSP"
    RECORDED = "RECORDED"
    DEMO = "DEMO"

class CameraStatus(str, enum.Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    ERROR = "ERROR"

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    source_type = Column(Enum(CameraSourceType), default=CameraSourceType.DEMO, nullable=False)
    source_url = Column(String(255), default="0", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    resolution_width = Column(Integer, default=640, nullable=False)
    resolution_height = Column(Integer, default=480, nullable=False)
    fps = Column(Integer, default=24, nullable=False)
    status = Column(Enum(CameraStatus), default=CameraStatus.OFFLINE, nullable=False)
    last_error = Column(String(255), nullable=True)
    last_seen = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
