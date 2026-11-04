from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, field_validator
from app.models.zone import ZoneType, ZoneSeverity
import json

class ZoneBase(BaseModel):
    camera_id: int
    name: str
    zone_type: ZoneType = ZoneType.POLYGON
    coordinates: List[List[float]]  # List of [x, y] where 0.0 <= x, y <= 1.0
    color_hex: str = "#EF4444"
    severity: ZoneSeverity = ZoneSeverity.HIGH
    is_active: bool = True

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, v):
        if len(v) < 3:
            raise ValueError("A zone requires at least 3 points to form a polygon.")
        for pt in v:
            if len(pt) != 2:
                raise ValueError("Each point must have exactly [x, y] coordinates.")
            if not (0.0 <= pt[0] <= 1.0 and 0.0 <= pt[1] <= 1.0):
                raise ValueError("Coordinates must be normalized between 0.0 and 1.0.")
        return v

class ZoneCreate(ZoneBase):
    pass

class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    zone_type: Optional[ZoneType] = None
    coordinates: Optional[List[List[float]]] = None
    color_hex: Optional[str] = None
    severity: Optional[ZoneSeverity] = None
    is_active: Optional[bool] = None

class ZoneResponse(BaseModel):
    id: int
    camera_id: int
    name: str
    zone_type: ZoneType
    coordinates: List[List[float]]
    color_hex: str
    severity: ZoneSeverity
    is_active: bool
    created_at: datetime

    @classmethod
    def from_orm_model(cls, model):
        try:
            coords = json.loads(model.coordinates_json)
        except Exception:
            coords = []
        return cls(
            id=model.id,
            camera_id=model.camera_id,
            name=model.name,
            zone_type=model.zone_type,
            coordinates=coords,
            color_hex=model.color_hex,
            severity=model.severity,
            is_active=model.is_active,
            created_at=model.created_at,
        )
