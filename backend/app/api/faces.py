import os
import cv2
import json
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
import numpy as np
from app.database import get_db
from app.models.face import EnrolledFace
from app.models.audit import AuditLog
from app.schemas.face import FaceResponse
from app.auth.dependencies import require_operator, require_viewer
from app.config import settings
from app.core.face_pipeline import FaceRecognitionPipeline
from app.core.registry import pipeline_registry

router = APIRouter(prefix="/api/faces", tags=["Biometric Face Management"])

# Helper face pipeline instance for enrollment extraction
enrollment_pipeline = FaceRecognitionPipeline()

@router.get("", response_model=List[FaceResponse])
def list_enrolled_faces(
    db: Session = Depends(get_db),
    current_user = Depends(require_viewer)
):
    """List all authorized registered individuals."""
    return db.query(EnrolledFace).filter(EnrolledFace.is_active == True).all()

@router.post("/enroll", response_model=FaceResponse, status_code=status.HTTP_201_CREATED)
async def enroll_face(
    name: str = Form(...),
    identity_code: str = Form(...),
    role_or_department: str = Form("Authorized Personnel"),
    consent_recorded: bool = Form(True),
    notes: Optional[str] = Form(None),
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """
    Enroll a new known individual with biometric consent verification.
    Extracts 512-dimensional embedding and immediately updates running surveillance pipelines.
    """
    # 1. Check for duplicate identity code
    existing = db.query(EnrolledFace).filter(EnrolledFace.identity_code == identity_code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Identity code '{identity_code}' is already registered."
        )

    # 2. Read and decode uploaded image
    contents = await photo.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image file uploaded.")

    # 3. Detect face in uploaded photo
    boxes = enrollment_pipeline.detect_faces(image)
    if len(boxes) == 0:
        raise HTTPException(
            status_code=400,
            detail="No human face detected in the uploaded photo. Please ensure good lighting and clear frontal angle."
        )

    # Use the primary (largest) face box
    boxes.sort(key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)
    fx1, fy1, fx2, fy2 = boxes[0]
    face_crop = image[fy1:fy2, fx1:fx2]

    # 4. Compute 512-d embedding
    embedding = enrollment_pipeline.compute_embedding(face_crop)
    if embedding is None:
        raise HTTPException(status_code=500, detail="Failed to compute biometric embedding from photo.")

    # 5. Save photo to storage
    file_ext = os.path.splitext(photo.filename or "face.jpg")[1] or ".jpg"
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    photo_save_path = settings.ENROLLED_FACES_DIR / unique_filename
    cv2.imwrite(str(photo_save_path), image)

    # 6. Save DB record
    enrolled = EnrolledFace(
        name=name.strip(),
        identity_code=identity_code.strip(),
        role_or_department=role_or_department.strip(),
        embedding_json=json.dumps(embedding.tolist()),
        photo_path=unique_filename,
        consent_recorded=consent_recorded,
        notes=notes,
        is_active=True
    )
    db.add(enrolled)
    db.commit()
    db.refresh(enrolled)

    # 7. Audit log
    audit = AuditLog(
        user_id=current_user.id,
        action="ENROLL_FACE",
        entity_type="EnrolledFace",
        entity_id=str(enrolled.id),
        details_json=f'{{"name": "{enrolled.name}", "code": "{enrolled.identity_code}"}}'
    )
    db.add(audit)
    db.commit()

    # 8. Synchronize all running pipelines immediately
    for cid, pipe in pipeline_registry._pipelines.items():
        pipeline_registry.sync_camera_data(pipe, cid, db)

    return enrolled

@router.delete("/{face_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_face(
    face_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_operator)
):
    """Deactivate or remove enrolled individual."""
    enrolled = db.query(EnrolledFace).filter(EnrolledFace.id == face_id).first()
    if not enrolled:
        raise HTTPException(status_code=404, detail="Enrolled identity not found")

    # Remove photo file if exists
    if enrolled.photo_path:
        photo_file = settings.ENROLLED_FACES_DIR / enrolled.photo_path
        if photo_file.exists():
            try:
                photo_file.unlink()
            except Exception:
                pass

    db.delete(enrolled)
    db.commit()

    # Sync running pipelines
    for cid, pipe in pipeline_registry._pipelines.items():
        pipeline_registry.sync_camera_data(pipe, cid, db)

    return None
