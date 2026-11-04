import cv2
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.camera import Camera, CameraSourceType, CameraStatus
from app.schemas.camera import CameraCreate, CameraUpdate, CameraResponse
from app.auth.dependencies import require_operator, require_viewer
from app.core.registry import pipeline_registry
from app.core.capture import detect_available_cameras

router = APIRouter(prefix="/api/cameras", tags=["Camera Management"])

class TestCameraSourceRequest(BaseModel):
    source_type: str
    source_url: str

@router.get("/devices/available")
def get_available_devices(
    current_user = Depends(require_viewer)
):
    """
    Auto-detect physical webcams connected to this computer.
    Returns list of discovered webcams with index, backend name, and resolution.
    """
    devices = detect_available_cameras(max_probe=4)
    return {
        "count": len(devices),
        "devices": devices
    }

@router.post("/test-source")
def test_camera_source(
    req: TestCameraSourceRequest,
    current_user = Depends(require_operator)
):
    """
    Test a video camera source before saving it (webcam index, IP stream URL, or file).
    """
    url_str = req.source_url.strip()
    if req.source_type == "DEMO" or url_str.startswith("demo://"):
        return {"success": True, "message": "Demo procedural stream is valid and ready."}

    try:
        if url_str.isdigit():
            # Physical camera test
            cam_idx = int(url_str)
            cap = cv2.VideoCapture(cam_idx, cv2.CAP_DSHOW)
            if not cap or not cap.isOpened():
                cap = cv2.VideoCapture(cam_idx, cv2.CAP_MSMF)
            if not cap or not cap.isOpened():
                cap = cv2.VideoCapture(cam_idx)
        else:
            # RTSP / HTTP stream test
            cap = cv2.VideoCapture(url_str, cv2.CAP_FFMPEG)
            if not cap or not cap.isOpened():
                cap = cv2.VideoCapture(url_str)

        if not cap or not cap.isOpened():
            return {
                "success": False,
                "message": f"Could not connect to source: '{url_str}'. Verify that the device is plugged in or the stream URL is correct."
            }

        ret, frame = cap.read()
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()

        if ret and frame is not None and frame.size > 0:
            return {
                "success": True,
                "message": f"Connection verified successfully! ({w}x{h})",
                "width": w,
                "height": h
            }
        else:
            return {
                "success": False,
                "message": "Camera opened, but failed to read initial frame."
            }
    except Exception as e:
        return {
            "success": False,
            "message": f"Test failed with error: {str(e)}"
        }

@router.get("", response_model=List[CameraResponse])
def list_cameras(
    db: Session = Depends(get_db),
    current_user = Depends(require_viewer)
):
    """List all registered camera video sources with live operational status."""
    cameras = db.query(Camera).all()
    # Enrich with real-time status from registry
    for cam in cameras:
        pipe = pipeline_registry.get(cam.id)
        if pipe and pipe.is_running:
            cam.status = pipe.capture_mgr.status
            cam.last_error = pipe.capture_mgr.last_error
            cam.fps = int(pipe.pipeline_fps) or cam.fps
        else:
            cam.status = CameraStatus.OFFLINE
    return cameras

@router.get("/{camera_id}", response_model=CameraResponse)
def get_camera(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_viewer)
):
    """Retrieve details for a specific camera."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    pipe = pipeline_registry.get(camera.id)
    if pipe and pipe.is_running:
        camera.status = pipe.capture_mgr.status
        camera.last_error = pipe.capture_mgr.last_error
        camera.fps = int(pipe.pipeline_fps) or camera.fps
    else:
        camera.status = CameraStatus.OFFLINE
    return camera

@router.post("", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
def create_camera(
    camera_in: CameraCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """Register a new camera video source (Webcam, RTSP, Video File, or Demo Stream)."""
    # Auto-detect source type if numeric or URL
    src_url = camera_in.source_url.strip()
    src_type = camera_in.source_type
    if src_url.startswith(("rtsp://", "http://", "https://")):
        src_type = CameraSourceType.RTSP
    elif src_url.isdigit():
        src_type = CameraSourceType.WEBCAM

    camera = Camera(
        name=camera_in.name,
        source_type=src_type,
        source_url=src_url,
        resolution_width=camera_in.resolution_width,
        resolution_height=camera_in.resolution_height,
        fps=camera_in.fps,
        is_active=camera_in.is_active,
        status=CameraStatus.OFFLINE
    )
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return camera

@router.put("/{camera_id}", response_model=CameraResponse)
def update_camera(
    camera_id: int,
    camera_in: CameraUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """Update camera properties and restart pipeline if source changed."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    source_changed = False
    if camera_in.name is not None:
        camera.name = camera_in.name
    if camera_in.source_type is not None and camera_in.source_type != camera.source_type:
        camera.source_type = camera_in.source_type
        source_changed = True
    if camera_in.source_url is not None and camera_in.source_url != camera.source_url:
        camera.source_url = camera_in.source_url
        source_changed = True
    if camera_in.resolution_width is not None:
        camera.resolution_width = camera_in.resolution_width
    if camera_in.resolution_height is not None:
        camera.resolution_height = camera_in.resolution_height
    if camera_in.fps is not None:
        camera.fps = camera_in.fps
    if camera_in.is_active is not None:
        camera.is_active = camera_in.is_active

    db.commit()
    db.refresh(camera)

    # If stream source changed and pipeline is running, restart with new source
    if source_changed and pipeline_registry.get(camera_id):
        pipeline_registry.stop_pipeline(camera_id)
        pipeline_registry.start_pipeline(camera, db)

    return camera

@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_camera(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """Remove camera and stop active pipeline."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    pipeline_registry.stop_pipeline(camera_id)
    db.delete(camera)
    db.commit()
    return None

@router.post("/{camera_id}/start")
def start_camera_pipeline(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """Start video processing and AI pipeline for camera."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    pipe = pipeline_registry.start_pipeline(camera, db)
    return {
        "status": "started",
        "camera_id": camera.id,
        "mode": camera.source_type.value,
        "is_running": pipe.is_running
    }

@router.post("/{camera_id}/stop")
def stop_camera_pipeline(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """Stop video processing pipeline for camera."""
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    stopped = pipeline_registry.stop_pipeline(camera_id)
    return {
        "status": "stopped" if stopped else "already_stopped",
        "camera_id": camera_id
    }
