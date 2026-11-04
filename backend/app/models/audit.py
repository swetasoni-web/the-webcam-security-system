from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(50), nullable=False)  # e.g., USER_LOGIN, ENROLL_FACE, DELETE_ZONE, ACK_ALERT
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(String(50), nullable=True)
    details_json = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")
