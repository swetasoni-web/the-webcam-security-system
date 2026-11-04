import logging
from typing import Dict, Optional
from app.core.pipeline import SurveillancePipeline
from app.models.camera import Camera, CameraSourceType
from app.services.alert_service import alert_service
import json

logger = logging.getLogger(__name__)

class PipelineRegistry:
    """Manages active SurveillancePipeline instances across camera sources."""

    def __init__(self):
        self._pipelines: Dict[int, SurveillancePipeline] = {}

    def get(self, camera_id: int) -> Optional[SurveillancePipeline]:
        """Get running pipeline by camera ID."""
        return self._pipelines.get(camera_id)

    def start_pipeline(self, camera: Camera, db_session) -> SurveillancePipeline:
        """Start or retrieve active pipeline for a camera entity."""
        if camera.id in self._pipelines:
            pipe = self._pipelines[camera.id]
            if not pipe.is_running:
                pipe.start()
            return pipe

        # Create alert callback lambda
        def on_alert(alert_spec, raw_frame):
            alert_service.record_alert(alert_spec, raw_frame)

        pipeline = SurveillancePipeline(
            camera_id=camera.id,
            source_type=camera.source_type,
            source_url=camera.source_url,
            width=camera.resolution_width,
            height=camera.resolution_height,
            target_fps=camera.fps,
            alert_callback=on_alert
        )

        # Sync existing zones, rules, and enrolled faces from DB
        self.sync_camera_data(pipeline, camera.id, db_session)

        pipeline.start()
        self._pipelines[camera.id] = pipeline
        logger.info(f"Registered and started pipeline for camera {camera.id}")
        return pipeline

    def stop_pipeline(self, camera_id: int) -> bool:
        """Stop and unregister camera pipeline."""
        pipe = self._pipelines.get(camera_id)
        if pipe:
            pipe.stop()
            del self._pipelines[camera_id]
            return True
        return False

    def sync_camera_data(self, pipeline: SurveillancePipeline, camera_id: int, db) -> None:
        """Fetch latest zones, rules, and enrolled faces from DB and push into pipeline."""
        from app.models.zone import RestrictedZone
        from app.models.rule import SecurityRule
        from app.models.face import EnrolledFace

        # 1. Zones
        zones_db = db.query(RestrictedZone).filter(
            RestrictedZone.camera_id == camera_id,
            RestrictedZone.is_active == True
        ).all()
        zones_data = []
        for z in zones_db:
            try:
                coords = json.loads(z.coordinates_json)
            except Exception:
                coords = []
            zones_data.append({
                "id": z.id,
                "name": z.name,
                "zone_type": z.zone_type.value,
                "coordinates": coords,
                "color_hex": z.color_hex,
                "severity": z.severity.value,
                "is_active": z.is_active,
            })

        # 2. Rules
        rules_db = db.query(SecurityRule).filter(
            (SecurityRule.camera_id == camera_id) | (SecurityRule.camera_id == None),
            SecurityRule.is_active == True
        ).all()
        rules_data = []
        for r in rules_db:
            try:
                classes = json.loads(r.target_classes_json)
            except Exception:
                classes = ["person"]
            rules_data.append({
                "id": r.id,
                "name": r.name,
                "camera_id": r.camera_id,
                "zone_id": r.zone_id,
                "target_classes": classes,
                "target_identity": r.target_identity.value,
                "min_dwell_seconds": r.min_dwell_seconds,
                "schedule_start": r.schedule_start,
                "schedule_end": r.schedule_end,
                "cooldown_seconds": r.cooldown_seconds,
                "severity": r.severity.value,
                "sound_alarm": r.sound_alarm,
                "email_alert": r.email_alert,
                "is_active": r.is_active,
            })

        # 3. Enrolled Faces
        faces_db = db.query(EnrolledFace).filter(EnrolledFace.is_active == True).all()
        faces_data = []
        for f in faces_db:
            faces_data.append({
                "id": f.id,
                "name": f.name,
                "identity_code": f.identity_code,
                "embedding": f.embedding_json,
            })

        pipeline.update_configurations(
            zones=zones_data,
            rules=rules_data,
            enrolled_faces=faces_data
        )

    def stop_all(self) -> None:
        """Stop all active pipelines cleanly."""
        for cid in list(self._pipelines.keys()):
            self.stop_pipeline(cid)

pipeline_registry = PipelineRegistry()
