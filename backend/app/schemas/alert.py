from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.alert import AlertSeverity

class AlertResponse(BaseModel):
    id: int
    camera_id: int
    rule_id: Optional[int] = None
    zone_id: Optional[int] = None
    event_type: str
    severity: AlertSeverity
    message: str
    track_id: Optional[int] = None
    entity_class: Optional[str] = None
    identity_name: Optional[str] = None
    confidence: Optional[float] = None
    evidence_image_path: Optional[str] = None
    is_acknowledged: bool
    acknowledged_by: Optional[int] = None
    acknowledged_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class AlertAcknowledgeRequest(BaseModel):
    notes: Optional[str] = None
