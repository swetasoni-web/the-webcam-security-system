import logging
from datetime import datetime
from typing import Dict, Any, Optional
import numpy as np
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.alert import Alert, AlertSeverity
from app.models.audit import AuditLog
from app.services.evidence_service import evidence_service
from app.services.email_service import email_service

logger = logging.getLogger(__name__)

class AlertService:
    """Manages alert creation, evidence snapshot persistence, triage acknowledgment, and audit trails."""

    def record_alert(self, alert_spec: Dict[str, Any], raw_frame: Optional[np.ndarray] = None) -> Optional[int]:
        """
        Record an alert to the database with evidence snapshot.
        Executed in thread-safe database session.
        """
        db: Session = SessionLocal()
        try:
            # 1. Save evidence frame if provided
            evidence_rel_path = None
            if raw_frame is not None:
                evidence_rel_path = evidence_service.save_snapshot(
                    frame=raw_frame,
                    camera_id=alert_spec["camera_id"],
                    event_type=alert_spec["event_type"],
                    bbox=alert_spec.get("bbox")
                )

            # Map severity
            sev_str = str(alert_spec.get("severity", "HIGH")).upper()
            severity_enum = AlertSeverity[sev_str] if sev_str in AlertSeverity.__members__ else AlertSeverity.HIGH

            alert = Alert(
                camera_id=alert_spec["camera_id"],
                rule_id=alert_spec.get("rule_id"),
                zone_id=alert_spec.get("zone_id"),
                event_type=alert_spec["event_type"],
                severity=severity_enum,
                message=alert_spec["message"],
                track_id=alert_spec.get("track_id"),
                entity_class=alert_spec.get("entity_class"),
                identity_name=alert_spec.get("identity_name"),
                confidence=alert_spec.get("confidence"),
                evidence_image_path=evidence_rel_path,
                is_acknowledged=False,
                created_at=datetime.utcnow()
            )

            db.add(alert)
            db.commit()
            db.refresh(alert)

            # 2. Optional email notification dispatch
            if alert_spec.get("email_alert", False):
                email_service.send_alert_notification(
                    subject=f"[{severity_enum.value}] {alert_spec['event_type']} - Camera {alert_spec['camera_id']}",
                    message=alert_spec["message"]
                )

            logger.info(f"Alert #{alert.id} recorded: {alert.message}")
            return alert.id
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to record alert: {e}")
            return None
        finally:
            db.close()

    def acknowledge_alert(self, alert_id: int, user_id: int, notes: Optional[str] = None) -> bool:
        """Acknowledge and mark an alert as reviewed."""
        db: Session = SessionLocal()
        try:
            alert = db.query(Alert).filter(Alert.id == alert_id).first()
            if not alert:
                return False

            alert.is_acknowledged = True
            alert.acknowledged_by = user_id
            alert.acknowledged_at = datetime.utcnow()

            # Create audit log
            audit = AuditLog(
                user_id=user_id,
                action="ACKNOWLEDGE_ALERT",
                entity_type="Alert",
                entity_id=str(alert_id),
                details_json=f'{{"notes": "{notes or ""}"}}',
                timestamp=datetime.utcnow()
            )
            db.add(audit)
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to acknowledge alert {alert_id}: {e}")
            return False
        finally:
            db.close()

alert_service = AlertService()
