import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, Float
from sqlalchemy.orm import relationship
from app.database import Base

class AlertSeverity(str, enum.Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    WARNING = "WARNING"
    INFO = "INFO"

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    rule_id = Column(Integer, ForeignKey("security_rules.id", ondelete="SET NULL"), nullable=True)
    zone_id = Column(Integer, ForeignKey("restricted_zones.id", ondelete="SET NULL"), nullable=True)
    
    event_type = Column(String(50), nullable=False)  # e.g., ZONE_INTRUSION, UNKNOWN_PERSON, OBJECT_DETECTED
    severity = Column(Enum(AlertSeverity), default=AlertSeverity.HIGH, nullable=False)
    message = Column(String(255), nullable=False)
    
    # Entity details
    track_id = Column(Integer, nullable=True)
    entity_class = Column(String(50), nullable=True)
    identity_name = Column(String(100), nullable=True)
    confidence = Column(Float, nullable=True)
    
    # Evidence file path relative to storage root
    evidence_image_path = Column(String(255), nullable=True)
    
    # Triage & Acknowledgement
    is_acknowledged = Column(Boolean, default=False, nullable=False)
    acknowledged_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    camera = relationship("Camera")
    rule = relationship("SecurityRule")
    zone = relationship("RestrictedZone")
    acknowledged_user = relationship("User")
