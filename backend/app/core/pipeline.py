import cv2
import time
import json
import logging
import threading
import numpy as np
from typing import List, Dict, Any, Optional, Callable
from app.models.camera import CameraSourceType, CameraStatus
from app.core.capture import VideoCaptureManager
from app.core.yolo_detector import YOLODetector
from app.core.face_pipeline import FaceRecognitionPipeline
from app.core.tracker import CentroidIoUTracker
from app.core.zone_engine import ZoneEngine
from app.core.rule_engine import RuleEngine

logger = logging.getLogger(__name__)

class SurveillancePipeline:
    """
    Central Video Surveillance Orchestrator.
    Executes real-time frame capture, AI object detection, face recognition,
    multi-object tracking, restricted zone monitoring, and rule evaluations.
    """

    def __init__(
        self,
        camera_id: int,
        source_type: CameraSourceType,
        source_url: str,
        width: int = 640,
        height: int = 480,
        target_fps: int = 24,
        alert_callback: Optional[Callable[[Dict[str, Any], np.ndarray], None]] = None
    ):
        self.camera_id = camera_id
        self.source_type = source_type
        self.source_url = source_url
        self.width = width
        self.height = height
        self.target_fps = target_fps
        self.alert_callback = alert_callback

        # Pipeline sub-components
        self.capture_mgr = VideoCaptureManager(source_type, source_url, width, height, target_fps)
        self.yolo_detector = YOLODetector(confidence_threshold=0.40)
        self.face_pipeline = FaceRecognitionPipeline(match_threshold=0.60)
        self.tracker = CentroidIoUTracker(max_age_frames=30, iou_threshold=0.25)
        self.zone_engine = ZoneEngine()
        self.rule_engine = RuleEngine()

        # Dynamic runtime configurations (loaded from DB)
        self.zones: List[Dict[str, Any]] = []
        self.rules: List[Dict[str, Any]] = []
        self.enrolled_faces: List[Dict[str, Any]] = []

        # Threading & state
        self.is_running = False
        self.worker_thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()

        # Output buffers
        self.latest_annotated_frame: Optional[np.ndarray] = None
        self.latest_raw_frame: Optional[np.ndarray] = None
        self.active_tracks: List[Dict[str, Any]] = []
        self.active_zone_events: List[Dict[str, Any]] = []
        self.pipeline_fps = 0.0
        self.last_inference_ms = 0.0

    def update_configurations(
        self,
        zones: Optional[List[Dict[str, Any]]] = None,
        rules: Optional[List[Dict[str, Any]]] = None,
        enrolled_faces: Optional[List[Dict[str, Any]]] = None
    ) -> None:
        """Dynamically update zones, rules, and enrolled faces without restarting pipeline."""
        with self.lock:
            if zones is not None:
                self.zones = zones
            if rules is not None:
                self.rules = rules
            if enrolled_faces is not None:
                self.enrolled_faces = enrolled_faces

    def start(self) -> bool:
        """Start video capture and processing worker thread."""
        if self.is_running:
            return True

        self.capture_mgr.start()
        self.is_running = True
        self.worker_thread = threading.Thread(target=self._processing_loop, daemon=True, name=f"PipelineWorker-{self.camera_id}")
        self.worker_thread.start()
        logger.info(f"SurveillancePipeline started for camera {self.camera_id} in {self.source_type.value} mode")
        return True

    def stop(self) -> None:
        """Stop processing worker and release resources."""
        self.is_running = False
        if self.worker_thread and self.worker_thread.is_alive():
            self.worker_thread.join(timeout=1.5)
        self.worker_thread = None
        self.capture_mgr.stop()
        logger.info(f"SurveillancePipeline stopped for camera {self.camera_id}")

    def _processing_loop(self) -> None:
        """Main AI processing loop running in background thread."""
        fps_timer = time.time()
        fps_frame_counter = 0
        frame_interval = 1.0 / max(1, self.target_fps)

        while self.is_running:
            loop_start = time.time()
            raw_frame = self.capture_mgr.get_latest_frame()

            if raw_frame is None:
                time.sleep(0.02)
                continue

            # Copy for annotation
            annotated_frame = raw_frame.copy()

            # 1. Object Detection (YOLO)
            t_infer_start = time.time()
            detections = self.yolo_detector.detect(raw_frame)
            self.last_inference_ms = round((time.time() - t_infer_start) * 1000, 1)

            # 2. Tracking (associate detections across frames)
            tracks = self.tracker.update(detections)

            # 3. Face Recognition on person crops
            with self.lock:
                current_enrolled = list(self.enrolled_faces)
            
            # Detect faces on frame
            face_results = self.face_pipeline.process_frame(raw_frame, current_enrolled)
            # Link recognized faces to person tracks
            self.tracker.link_face_to_track(face_results)

            # 4. Restricted Zone Intrusion Evaluation
            with self.lock:
                current_zones = list(self.zones)
                current_rules = list(self.rules)

            zone_events = self.zone_engine.evaluate_tracks_in_zones(
                tracks=tracks,
                zones=current_zones,
                frame_width=self.width,
                frame_height=self.height
            )

            # 5. Security Rule Engine Evaluation
            triggered_alerts = self.rule_engine.evaluate_rules(
                camera_id=self.camera_id,
                tracks=tracks,
                zone_events=zone_events,
                rules=current_rules
            )

            # Trigger alert callbacks (saves evidence snapshot & DB record)
            if triggered_alerts and self.alert_callback:
                for alert_spec in triggered_alerts:
                    try:
                        self.alert_callback(alert_spec, raw_frame.copy())
                    except Exception as e:
                        logger.error(f"Error executing alert callback: {e}")

            # 6. Render HUD Overlays onto annotated_frame
            self._render_hud(annotated_frame, current_zones, tracks, zone_events, face_results)

            # Store updated buffers
            with self.lock:
                self.latest_raw_frame = raw_frame
                self.latest_annotated_frame = annotated_frame
                self.active_tracks = [t.to_dict() for t in tracks]
                self.active_zone_events = zone_events

            # FPS calculation
            fps_frame_counter += 1
            if fps_frame_counter % 24 == 0:
                elapsed = time.time() - fps_timer
                if elapsed > 0:
                    self.pipeline_fps = round(24.0 / elapsed, 1)
                fps_timer = time.time()

            # Throttle to maintain target FPS
            elapsed_time = time.time() - loop_start
            sleep_duration = max(0.001, frame_interval - elapsed_time)
            time.sleep(sleep_duration)

    def _render_hud(
        self,
        canvas: np.ndarray,
        zones: List[Dict[str, Any]],
        tracks: List[Any],
        zone_events: List[Dict[str, Any]],
        face_results: List[Dict[str, Any]]
    ) -> None:
        """Render high-tech surveillance overlays onto canvas."""
        h, w = canvas.shape[:2]

        # 1. Draw Restricted Zones (Semi-transparent polygon fill + border)
        overlay = canvas.copy()
        for zone in zones:
            if not zone.get("is_active", True):
                continue

            coords = zone.get("coordinates", [])
            if len(coords) < 3:
                continue

            # Convert normalized coordinates to absolute pixel coordinates
            pts = np.array([[int(p[0] * w), int(p[1] * h)] for p in coords], np.int32)
            pts = pts.reshape((-1, 1, 2))

            # Parse hex color
            hex_color = zone.get("color_hex", "#EF4444").lstrip("#")
            try:
                rgb = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
                bgr = (rgb[2], rgb[1], rgb[0])
            except Exception:
                bgr = (0, 0, 239)

            # Filled polygon on overlay
            cv2.fillPoly(overlay, [pts], bgr)
            # Border
            cv2.polylines(canvas, [pts], isClosed=True, color=bgr, thickness=2, lineType=cv2.LINE_AA)

            # Zone label badge
            top_pt = pts[0][0]
            label_text = f"ZONE: {zone['name']} [{zone.get('severity', 'HIGH')}]"
            cv2.putText(canvas, label_text, (max(10, top_pt[0]), max(20, top_pt[1] - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, bgr, 1, cv2.LINE_AA)

        # Blend semi-transparent zone overlay
        cv2.addWeighted(overlay, 0.25, canvas, 0.75, 0, canvas)

        # 2. Draw Trajectory Paths & Tracks
        for trk in tracks:
            # Trajectory line
            if len(trk.trajectory) > 1:
                for idx in range(1, len(trk.trajectory)):
                    p1 = trk.trajectory[idx - 1]
                    p2 = trk.trajectory[idx]
                    cv2.line(canvas, p1, p2, (0, 255, 255), 1, cv2.LINE_AA)

            x1, y1, x2, y2 = trk.bbox
            
            # Color code based on identity
            if trk.is_known:
                box_color = (0, 220, 100)  # Green for known
            elif trk.identity_name == "Unknown":
                box_color = (0, 140, 255)  # Amber for unknown person
            else:
                box_color = (255, 200, 0)  # Cyan/Blue for objects

            # Bounding box corners (sleek cyber style)
            cv2.rectangle(canvas, (x1, y1), (x2, y2), box_color, 2)

            # Label text
            id_str = f" #{trk.track_id}"
            class_str = f"{trk.class_name.upper()}{id_str}"
            dwell_str = f" ({trk.dwell_time_seconds}s)"
            
            if trk.identity_name:
                badge_str = f"{class_str} | {trk.identity_name}{dwell_str}"
            else:
                badge_str = f"{class_str}{dwell_str}"

            # Label background box
            label_size, _ = cv2.getTextSize(badge_str, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
            cv2.rectangle(canvas, (x1, max(0, y1 - 20)), (x1 + label_size[0] + 6, max(0, y1)), box_color, -1)
            cv2.putText(canvas, badge_str, (x1 + 3, max(12, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 1, cv2.LINE_AA)

        # 3. Draw Face detection badges
        for face in face_results:
            fx1, fy1, fx2, fy2 = face["bbox"]
            is_known = face["is_known"]
            f_color = (0, 255, 128) if is_known else (0, 100, 255)
            cv2.rectangle(canvas, (fx1, fy1), (fx2, fy2), f_color, 1)
            conf_pct = int(face["confidence"] * 100)
            tag = f"{face['name']} ({conf_pct}%)"
            cv2.putText(canvas, tag, (fx1, max(12, fy1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.38, f_color, 1, cv2.LINE_AA)

        # 4. Top Telemetry Status Header HUD
        mode_str = self.source_type.value
        status_text = f"MODE: {mode_str} | FPS: {self.pipeline_fps} | INFER: {self.last_inference_ms}ms | TRACKS: {len(tracks)}"
        
        # Top banner background
        cv2.rectangle(canvas, (0, 0), (w, 24), (10, 14, 18), -1)
        cv2.line(canvas, (0, 24), (w, 24), (40, 50, 65), 1)

        # Mode indicator dot
        dot_color = (0, 255, 0) if mode_str == "LIVE" else ((0, 200, 255) if mode_str == "RECORDED" else (255, 180, 0))
        cv2.circle(canvas, (12, 12), 4, dot_color, -1)
        cv2.putText(canvas, status_text, (24, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (220, 220, 220), 1, cv2.LINE_AA)

        # Timestamp
        time_text = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(canvas, time_text, (w - 150, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (180, 180, 180), 1, cv2.LINE_AA)

    def get_annotated_jpeg(self, quality: int = 80) -> Optional[bytes]:
        """Encode latest annotated frame to JPEG bytes for MJPEG streaming."""
        with self.lock:
            frame = self.latest_annotated_frame
            if frame is None:
                return None
            _, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
            return buffer.tobytes()

    def get_status_summary(self) -> Dict[str, Any]:
        """Get real-time operational status of all pipeline components."""
        with self.lock:
            return {
                "camera_id": self.camera_id,
                "mode": self.source_type.value,
                "source_url": self.source_url,
                "is_running": self.is_running,
                "fps": self.pipeline_fps,
                "capture_fps": self.capture_mgr.measured_fps,
                "inference_ms": self.last_inference_ms,
                "yolo_loaded": self.yolo_detector.is_loaded,
                "face_pipeline_loaded": self.face_pipeline.is_loaded,
                "active_tracks_count": len(self.active_tracks),
                "active_zones_count": len(self.zones),
                "active_rules_count": len(self.rules),
                "camera_status": self.capture_mgr.status.value,
                "last_error": self.capture_mgr.last_error,
            }
