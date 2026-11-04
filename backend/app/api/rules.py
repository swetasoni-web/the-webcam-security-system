import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.rule import SecurityRule
from app.schemas.rule import RuleCreate, RuleUpdate, RuleResponse
from app.auth.dependencies import require_operator, require_viewer
from app.core.registry import pipeline_registry

router = APIRouter(prefix="/api/rules", tags=["Security Rule Engine"])

@router.get("", response_model=List[RuleResponse])
def list_rules(
    camera_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user = Depends(require_viewer)
):
    """List all configured security rules."""
    query = db.query(SecurityRule)
    if camera_id is not None:
        query = query.filter((SecurityRule.camera_id == camera_id) | (SecurityRule.camera_id == None))
    rules = query.all()
    return [RuleResponse.from_orm_model(r) for r in rules]

@router.post("", response_model=RuleResponse, status_code=status.HTTP_201_CREATED)
def create_rule(
    rule_in: RuleCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """Create a new automated security rule."""
    rule = SecurityRule(
        name=rule_in.name,
        description=rule_in.description,
        is_active=rule_in.is_active,
        camera_id=rule_in.camera_id,
        zone_id=rule_in.zone_id,
        target_classes_json=json.dumps(rule_in.target_classes),
        target_identity=rule_in.target_identity,
        min_dwell_seconds=rule_in.min_dwell_seconds,
        schedule_start=rule_in.schedule_start,
        schedule_end=rule_in.schedule_end,
        cooldown_seconds=rule_in.cooldown_seconds,
        severity=rule_in.severity,
        sound_alarm=rule_in.sound_alarm,
        email_alert=rule_in.email_alert,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    # Sync all pipelines
    for cid, pipe in pipeline_registry._pipelines.items():
        pipeline_registry.sync_camera_data(pipe, cid, db)

    return RuleResponse.from_orm_model(rule)

@router.put("/{rule_id}", response_model=RuleResponse)
def update_rule(
    rule_id: int,
    rule_in: RuleUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """Update existing security rule."""
    rule = db.query(SecurityRule).filter(SecurityRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if rule_in.name is not None:
        rule.name = rule_in.name
    if rule_in.description is not None:
        rule.description = rule_in.description
    if rule_in.is_active is not None:
        rule.is_active = rule_in.is_active
    if rule_in.camera_id is not None:
        rule.camera_id = rule_in.camera_id
    if rule_in.zone_id is not None:
        rule.zone_id = rule_in.zone_id
    if rule_in.target_classes is not None:
        rule.target_classes_json = json.dumps(rule_in.target_classes)
    if rule_in.target_identity is not None:
        rule.target_identity = rule_in.target_identity
    if rule_in.min_dwell_seconds is not None:
        rule.min_dwell_seconds = rule_in.min_dwell_seconds
    if rule_in.schedule_start is not None:
        rule.schedule_start = rule_in.schedule_start
    if rule_in.schedule_end is not None:
        rule.schedule_end = rule_in.schedule_end
    if rule_in.cooldown_seconds is not None:
        rule.cooldown_seconds = rule_in.cooldown_seconds
    if rule_in.severity is not None:
        rule.severity = rule_in.severity
    if rule_in.sound_alarm is not None:
        rule.sound_alarm = rule_in.sound_alarm
    if rule_in.email_alert is not None:
        rule.email_alert = rule_in.email_alert

    db.commit()
    db.refresh(rule)

    # Sync running pipelines
    for cid, pipe in pipeline_registry._pipelines.items():
        pipeline_registry.sync_camera_data(pipe, cid, db)

    return RuleResponse.from_orm_model(rule)

@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """Remove a security rule."""
    rule = db.query(SecurityRule).filter(SecurityRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    db.delete(rule)
    db.commit()

    # Sync pipelines
    for cid, pipe in pipeline_registry._pipelines.items():
        pipeline_registry.sync_camera_data(pipe, cid, db)

    return None
