from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from app.database import Base

class EnrolledFace(Base):
    __tablename__ = "enrolled_faces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    identity_code = Column(String(50), unique=True, index=True, nullable=False)
    role_or_department = Column(String(100), nullable=True)
    
    # 512-dimensional vector stored as JSON array of floats
    embedding_json = Column(Text, nullable=False)
    
    # Local path to registered profile picture
    photo_path = Column(String(255), nullable=True)
    
    # Biometric compliance
    consent_recorded = Column(Boolean, default=True, nullable=False)
    notes = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
