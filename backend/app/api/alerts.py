from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.alert import Alert, AlertSeverity
from app.models.user import User
from app.schemas.alert import AlertResponse, AlertAcknowledgeRequest
from app.auth.dependencies import require_viewer, require_operator, require_admin
from app.services.alert_service import alert_service

router = APIRouter(prefix="/api/alerts", tags=["Alerts & Incident Management"])

@router.get("", response_model=List[AlertResponse])
def list_alerts(
    camera_id: Optional[int] = Query(None),
    severity: Optional[AlertSeverity] = Query(None),
    is_acknowledged: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_viewer)
):
    """Retrieve security incident alerts with filters."""
    query = db.query(Alert)
    if camera_id is not None:
        query = query.filter(Alert.camera_id == camera_id)
    if severity is not None:
        query = query.filter(Alert.severity == severity)
    if is_acknowledged is not None:
        query = query.filter(Alert.is_acknowledged == is_acknowledged)

    # Sort descending by created_at (most recent first)
    alerts = query.order_by(Alert.created_at.desc()).offset(offset).limit(limit).all()
    return alerts

@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: int,
    ack_data: Optional[AlertAcknowledgeRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator)
):
    """Operator acknowledgement of an alert incident."""
    notes = ack_data.notes if ack_data else None
    success = alert_service.acknowledge_alert(alert_id, current_user.id, notes)
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found or already acknowledged")

    return {
        "status": "acknowledged",
        "alert_id": alert_id,
        "acknowledged_by": current_user.username
    }

@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Permanently delete an alert record (Admin only)."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    db.delete(alert)
    db.commit()
    return None
