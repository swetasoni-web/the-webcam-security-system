import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from app.database import Base

class TargetIdentityType(str, enum.Enum):
    ANY = "ANY"
    KNOWN = "KNOWN"
    UNKNOWN = "UNKNOWN"

class RuleSeverity(str, enum.Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    WARNING = "WARNING"
    INFO = "INFO"

class SecurityRule(Base):
    __tablename__ = "security_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Optional bindings (null means applies to all cameras/zones)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="SET NULL"), nullable=True)
    zone_id = Column(Integer, ForeignKey("restricted_zones.id", ondelete="SET NULL"), nullable=True)

    # Condition criteria
    # JSON list of YOLO classes: e.g. ["person", "backpack"]
    target_classes_json = Column(Text, default='["person"]', nullable=False)
    target_identity = Column(Enum(TargetIdentityType), default=TargetIdentityType.ANY, nullable=False)
    min_dwell_seconds = Column(Float, default=0.0, nullable=False)
    
    # Schedule (24-hour format: e.g. "00:00" to "23:59")
    schedule_start = Column(String(5), default="00:00", nullable=False)
    schedule_end = Column(String(5), default="23:59", nullable=False)
    
    # Cooldown & Notification
    cooldown_seconds = Column(Integer, default=15, nullable=False)
    severity = Column(Enum(RuleSeverity), default=RuleSeverity.HIGH, nullable=False)
    sound_alarm = Column(Boolean, default=True, nullable=False)
    email_alert = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    camera = relationship("Camera")
    zone = relationship("RestrictedZone")
