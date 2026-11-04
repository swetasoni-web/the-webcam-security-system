from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse
from app.services.evidence_service import evidence_service
from app.config import settings

router = APIRouter(prefix="/api/evidence", tags=["Evidence & Forensics"])

@router.get("/snapshot/{image_path:path}")
def get_evidence_image(image_path: str):
    """
    Retrieve evidence snapshot image with path-traversal protection.
    """
    full_path = evidence_service.get_full_path(image_path)
    if not full_path:
        raise HTTPException(status_code=404, detail="Evidence snapshot not found or access denied")

    return FileResponse(
        path=str(full_path),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"}
    )

@router.get("/faces/{photo_path:path}")
def get_enrolled_face_photo(photo_path: str):
    """
    Retrieve profile picture of enrolled known individual.
    """
    clean_path = photo_path.lstrip("/\\")
    full_path = (settings.ENROLLED_FACES_DIR / clean_path).resolve()
    
    # Path traversal guard
    if not str(full_path).startswith(str(settings.ENROLLED_FACES_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")

    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Profile photo not found")

    return FileResponse(
        path=str(full_path),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"}
    )
