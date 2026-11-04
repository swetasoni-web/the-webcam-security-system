import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class ZoneType(str, enum.Enum):
    POLYGON = "POLYGON"
    RECTANGLE = "RECTANGLE"

class ZoneSeverity(str, enum.Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    WARNING = "WARNING"
    INFO = "INFO"

class RestrictedZone(Base):
    __tablename__ = "restricted_zones"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    zone_type = Column(Enum(ZoneType), default=ZoneType.POLYGON, nullable=False)
    # Coordinates stored as normalized JSON array: [[x1, y1], [x2, y2], ...] where 0.0 <= x, y <= 1.0
    coordinates_json = Column(Text, nullable=False, default="[]")
    color_hex = Column(String(10), default="#EF4444", nullable=False)
    severity = Column(Enum(ZoneSeverity), default=ZoneSeverity.HIGH, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    camera = relationship("Camera", backref="zones")
