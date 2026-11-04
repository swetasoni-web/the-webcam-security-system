import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.zone import RestrictedZone
from app.models.camera import Camera
from app.schemas.zone import ZoneCreate, ZoneUpdate, ZoneResponse
from app.auth.dependencies import require_operator, require_viewer
from app.core.registry import pipeline_registry

router = APIRouter(prefix="/api/zones", tags=["Restricted Zone Monitoring"])

@router.get("", response_model=List[ZoneResponse])
def list_zones(
    camera_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user = Depends(require_viewer)
):
    """List configured restricted security zones."""
    query = db.query(RestrictedZone)
    if camera_id is not None:
        query = query.filter(RestrictedZone.camera_id == camera_id)
    zones = query.all()
    return [ZoneResponse.from_orm_model(z) for z in zones]

@router.post("", response_model=ZoneResponse, status_code=status.HTTP_201_CREATED)
def create_zone(
    zone_in: ZoneCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """Create a new geometric restricted zone on a camera view."""
    camera = db.query(Camera).filter(Camera.id == zone_in.camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Specified camera does not exist")

    zone = RestrictedZone(
        camera_id=zone_in.camera_id,
        name=zone_in.name,
        zone_type=zone_in.zone_type,
        coordinates_json=json.dumps(zone_in.coordinates),
        color_hex=zone_in.color_hex,
        severity=zone_in.severity,
        is_active=zone_in.is_active
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)

    # Sync running pipeline
    pipe = pipeline_registry.get(zone.camera_id)
    if pipe:
        pipeline_registry.sync_camera_data(pipe, zone.camera_id, db)

    return ZoneResponse.from_orm_model(zone)

@router.put("/{zone_id}", response_model=ZoneResponse)
def update_zone(
    zone_id: int,
    zone_in: ZoneUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """Update existing restricted zone."""
    zone = db.query(RestrictedZone).filter(RestrictedZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    if zone_in.name is not None:
        zone.name = zone_in.name
    if zone_in.zone_type is not None:
        zone.zone_type = zone_in.zone_type
    if zone_in.coordinates is not None:
        zone.coordinates_json = json.dumps(zone_in.coordinates)
    if zone_in.color_hex is not None:
        zone.color_hex = zone_in.color_hex
    if zone_in.severity is not None:
        zone.severity = zone_in.severity
    if zone_in.is_active is not None:
        zone.is_active = zone_in.is_active

    db.commit()
    db.refresh(zone)

    # Sync running pipeline
    pipe = pipeline_registry.get(zone.camera_id)
    if pipe:
        pipeline_registry.sync_camera_data(pipe, zone.camera_id, db)

    return ZoneResponse.from_orm_model(zone)

@router.delete("/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_zone(
    zone_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """Remove a restricted zone."""
    zone = db.query(RestrictedZone).filter(RestrictedZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    cam_id = zone.camera_id
    db.delete(zone)
    db.commit()

    # Sync running pipeline
    pipe = pipeline_registry.get(cam_id)
    if pipe:
        pipeline_registry.sync_camera_data(pipe, cam_id, db)

    return None
