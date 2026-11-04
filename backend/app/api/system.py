import os
import cv2
import psutil
import json
from datetime import datetime
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.models.camera import Camera, CameraSourceType, CameraStatus
from app.models.zone import RestrictedZone, ZoneType, ZoneSeverity
from app.models.rule import SecurityRule, TargetIdentityType, RuleSeverity
from app.models.face import EnrolledFace
from app.models.audit import AuditLog
from app.auth.dependencies import require_admin, require_viewer
from app.config import settings
from app.core.registry import pipeline_registry
from app.core.yolo_detector import YOLODetector
from app.core.face_pipeline import FaceRecognitionPipeline

router = APIRouter(prefix="/api/system", tags=["System Diagnostics & Audit"])

_diagnostic_yolo = None
_diagnostic_face = None

def get_diagnostic_yolo() -> YOLODetector:
    global _diagnostic_yolo
    if _diagnostic_yolo is None:
        _diagnostic_yolo = YOLODetector()
    return _diagnostic_yolo

def get_diagnostic_face() -> FaceRecognitionPipeline:
    global _diagnostic_face
    if _diagnostic_face is None:
        _diagnostic_face = FaceRecognitionPipeline()
    return _diagnostic_face

@router.get("/health")
def get_system_health(db: Session = Depends(get_db)):
    """
    Comprehensive System & Component Health Check.
    Reports real hardware connection, AI model load state, and system telemetry.
    """
    # 1. Database check
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    # 2. Camera hardware probe (Index 0)
    camera_hardware_available = False
    try:
        cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
        if cap and cap.isOpened():
            camera_hardware_available = True
            cap.release()
    except Exception:
        camera_hardware_available = False

    # 3. CPU and RAM telemetry
    cpu_usage = psutil.cpu_percent(interval=None)
    ram = psutil.virtual_memory()

    # 4. Detector status
    yolo = get_diagnostic_yolo()
    face = get_diagnostic_face()

    return {
        "status": "healthy" if db_ok else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "app_name": settings.APP_NAME,
        "version": "1.0.0",
        "components": {
            "api": {
                "status": "ONLINE",
                "environment": settings.APP_ENV,
            },
            "database": {
                "status": "ONLINE" if db_ok else "ERROR",
                "engine": "SQLite",
            },
            "hardware_camera_0": {
                "detected": camera_hardware_available,
                "status": "AVAILABLE" if camera_hardware_available else "NOT_DETECTED",
            },
            "yolo_object_detector": {
                "status": "LOADED" if yolo.is_loaded else "FAILED",
                "model": yolo.model_name,
                "classes_count": len(yolo.SUPPORTED_CLASSES),
                "error": yolo.load_error,
            },
            "face_recognition_model": {
                "status": "LOADED" if face.is_loaded else "FAILED",
                "feature_dimension": 512,
                "match_threshold": face.match_threshold,
                "error": face.load_error,
            },
            "active_pipelines": {
                "count": len(pipeline_registry._pipelines),
                "running_cameras": list(pipeline_registry._pipelines.keys())
            },
            "host_resources": {
                "cpu_percent": cpu_usage,
                "ram_percent": ram.percent,
                "ram_used_mb": round(ram.used / (1024 * 1024), 1),
                "ram_total_mb": round(ram.total / (1024 * 1024), 1),
            }
        }
    }

@router.get("/audit")
def get_audit_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    admin_user = Depends(require_admin)
):
    """Retrieve security audit logs (Admin only)."""
    return db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).all()

@router.post("/seed_demo_data")
def seed_demo_data(
    db: Session = Depends(get_db),
    admin_user = Depends(require_admin)
):
    """
    Seed initial demonstration cameras, zones, and security rules for immediate testing.
    """
    # 1. Primary Live Webcam (if hardware camera 0 is present) or Demo Stream
    cam1 = db.query(Camera).filter(Camera.name == "Main Entrance Cam (Webcam)").first()
    if not cam1:
        cam1 = Camera(
            name="Main Entrance Cam (Webcam)",
            source_type=CameraSourceType.WEBCAM,
            source_url="0",
            resolution_width=640,
            resolution_height=480,
            fps=24,
            is_active=True,
            status=CameraStatus.OFFLINE
        )
        db.add(cam1)
        db.commit()
        db.refresh(cam1)

    # 2. Demo Procedural Security Corridor Cam
    cam2 = db.query(Camera).filter(Camera.name == "Secure Corridor (Demo Feed)").first()
    if not cam2:
        cam2 = Camera(
            name="Secure Corridor (Demo Feed)",
            source_type=CameraSourceType.DEMO,
            source_url="demo://corridor",
            resolution_width=640,
            resolution_height=480,
            fps=24,
            is_active=True,
            status=CameraStatus.OFFLINE
        )
        db.add(cam2)
        db.commit()
        db.refresh(cam2)

    # 3. Add default restricted zone on Demo Cam
    zone1 = db.query(RestrictedZone).filter(RestrictedZone.name == "Restricted Vault Area").first()
    if not zone1:
        # Polygon occupying center-right doorway: [[0.55, 0.20], [0.88, 0.20], [0.88, 0.85], [0.55, 0.85]]
        zone1 = RestrictedZone(
            camera_id=cam2.id,
            name="Restricted Vault Area",
            zone_type=ZoneType.POLYGON,
            coordinates_json=json.dumps([
                [0.55, 0.20],
                [0.88, 0.20],
                [0.88, 0.85],
                [0.55, 0.85]
            ]),
            color_hex="#EF4444",
            severity=ZoneSeverity.CRITICAL,
            is_active=True
        )
        db.add(zone1)
        db.commit()
        db.refresh(zone1)

    # 4. Add security rules
    r1 = db.query(SecurityRule).filter(SecurityRule.name == "Vault Intrusion Alert").first()
    if not r1:
        r1 = SecurityRule(
            name="Vault Intrusion Alert",
            description="Trigger alert whenever any person enters the Restricted Vault Area",
            is_active=True,
            camera_id=cam2.id,
            zone_id=zone1.id,
            target_classes_json='["person"]',
            target_identity=TargetIdentityType.ANY,
            min_dwell_seconds=1.5,
            schedule_start="00:00",
            schedule_end="23:59",
            cooldown_seconds=15,
            severity=RuleSeverity.CRITICAL,
            sound_alarm=True,
            email_alert=False
        )
        db.add(r1)

    r2 = db.query(SecurityRule).filter(SecurityRule.name == "Unknown Intruder Warning").first()
    if not r2:
        r2 = SecurityRule(
            name="Unknown Intruder Warning",
            description="Alert when an unrecognized individual loiters for more than 3 seconds",
            is_active=True,
            camera_id=None,  # Applies to all cameras
            zone_id=None,
            target_classes_json='["person"]',
            target_identity=TargetIdentityType.UNKNOWN,
            min_dwell_seconds=3.0,
            schedule_start="00:00",
            schedule_end="23:59",
            cooldown_seconds=20,
            severity=RuleSeverity.HIGH,
            sound_alarm=True,
            email_alert=False
        )
        db.add(r2)

    db.commit()
    return {"message": "Demo data successfully seeded"}
