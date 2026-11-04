from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from app.models.rule import TargetIdentityType, RuleSeverity
import json

class RuleBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    camera_id: Optional[int] = None
    zone_id: Optional[int] = None
    target_classes: List[str] = ["person"]
    target_identity: TargetIdentityType = TargetIdentityType.ANY
    min_dwell_seconds: float = 0.0
    schedule_start: str = "00:00"
    schedule_end: str = "23:59"
    cooldown_seconds: int = 15
    severity: RuleSeverity = RuleSeverity.HIGH
    sound_alarm: bool = True
    email_alert: bool = False

class RuleCreate(RuleBase):
    pass

class RuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    camera_id: Optional[int] = None
    zone_id: Optional[int] = None
    target_classes: Optional[List[str]] = None
    target_identity: Optional[TargetIdentityType] = None
    min_dwell_seconds: Optional[float] = None
    schedule_start: Optional[str] = None
    schedule_end: Optional[str] = None
    cooldown_seconds: Optional[int] = None
    severity: Optional[RuleSeverity] = None
    sound_alarm: Optional[bool] = None
    email_alert: Optional[bool] = None

class RuleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_active: bool
    camera_id: Optional[int]
    zone_id: Optional[int]
    target_classes: List[str]
    target_identity: TargetIdentityType
    min_dwell_seconds: float
    schedule_start: str
    schedule_end: str
    cooldown_seconds: int
    severity: RuleSeverity
    sound_alarm: bool
    email_alert: bool
    created_at: datetime

    @classmethod
    def from_orm_model(cls, model):
        try:
            classes = json.loads(model.target_classes_json)
        except Exception:
            classes = ["person"]
        return cls(
            id=model.id,
            name=model.name,
            description=model.description,
            is_active=model.is_active,
            camera_id=model.camera_id,
            zone_id=model.zone_id,
            target_classes=classes,
            target_identity=model.target_identity,
            min_dwell_seconds=model.min_dwell_seconds,
            schedule_start=model.schedule_start,
            schedule_end=model.schedule_end,
            cooldown_seconds=model.cooldown_seconds,
            severity=model.severity,
            sound_alarm=model.sound_alarm,
            email_alert=model.email_alert,
            created_at=model.created_at,
        )
