import time
from typing import Generator, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.camera import Camera
from app.core.registry import pipeline_registry
from app.auth.security import decode_access_token
from app.auth.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/stream", tags=["Live Video & Telemetry Streaming"])

def _verify_stream_token(token: Optional[str], db: Session) -> bool:
    """Verify a JWT token passed as a query parameter for MJPEG stream access."""
    if not token:
        return False
    payload = decode_access_token(token)
    if not payload:
        return False
    username = payload.get("sub")
    if not username:
        return False
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    return user is not None

def frame_generator(camera_id: int, quality: int = 80) -> Generator[bytes, None, None]:
    """Continuous MJPEG multipart frame generator."""
    while True:
        pipe = pipeline_registry.get(camera_id)
        if not pipe or not pipe.is_running:
            time.sleep(0.1)
            continue

        frame_bytes = pipe.get_annotated_jpeg(quality=quality)
        if frame_bytes:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
            )
        time.sleep(0.04)  # Cap streaming yield to ~25 FPS to conserve bandwidth

@router.get("/{camera_id}/video_feed")
def get_video_feed(
    camera_id: int,
    quality: int = Query(80, ge=30, le=95),
    token: Optional[str] = Query(None, description="JWT bearer token for stream authentication"),
    db: Session = Depends(get_db)
):
    """
    Live MJPEG Surveillance Stream with AI HUD overlays.
    Requires a valid JWT token passed as ?token=<jwt> query parameter.
    Delivers standard multipart/x-mixed-replace video stream consumable by standard HTML <img>.
    """
    # Authenticate via query token (required because <img src> can't send headers)
    if not _verify_stream_token(token, db):
        raise HTTPException(status_code=401, detail="Valid authentication token required for video stream")

    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    pipe = pipeline_registry.get(camera_id)
    if not pipe or not pipe.is_running:
        # Auto-start pipeline if camera exists
        pipeline_registry.start_pipeline(camera, db)

    return StreamingResponse(
        frame_generator(camera_id, quality=quality),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"}
    )

@router.get("/{camera_id}/snapshot")
def get_camera_snapshot(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch single instant snapshot JPEG of current camera view."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    pipe = pipeline_registry.get(camera_id)
    if not pipe or not pipe.is_running:
        pipe = pipeline_registry.start_pipeline(camera, db)

    jpeg_bytes = pipe.get_annotated_jpeg(quality=85)
    if not jpeg_bytes:
        raise HTTPException(status_code=503, detail="Camera frame not ready yet")

    return Response(content=jpeg_bytes, media_type="image/jpeg")

@router.get("/{camera_id}/telemetry")
def get_stream_telemetry(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve real-time AI detections, active tracks, FPS, and zone metrics."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    pipe = pipeline_registry.get(camera_id)
    if not pipe or not pipe.is_running:
        return {
            "camera_id": camera_id,
            "mode": camera.source_type.value,
            "is_running": False,
            "fps": 0.0,
            "active_tracks": [],
            "zone_events": [],
            "status": "OFFLINE",
        }

    summary = pipe.get_status_summary()
    with pipe.lock:
        tracks = list(pipe.active_tracks)
        zone_events = list(pipe.active_zone_events)

    summary["active_tracks"] = tracks
    summary["zone_events"] = zone_events
    return summary
