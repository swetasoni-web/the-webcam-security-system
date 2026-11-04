import os
import cv2
import time
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List
import numpy as np
from app.config import settings

logger = logging.getLogger(__name__)

class EvidenceService:
    """Manages saving, retrieving, and safely pruning surveillance evidence snapshots."""

    def __init__(self, evidence_dir: Optional[Path] = None):
        self.evidence_dir = evidence_dir or settings.EVIDENCE_DIR
        self.evidence_dir.mkdir(parents=True, exist_ok=True)

    def save_snapshot(
        self,
        frame: np.ndarray,
        camera_id: int,
        event_type: str,
        bbox: Optional[List[int]] = None
    ) -> Optional[str]:
        """
        Save evidence frame to date-partitioned storage directory.
        Optionally draws evidence highlight box around the offending entity.
        Returns relative file path string for database persistence.
        """
        if frame is None:
            return None

        try:
            date_dir_name = datetime.utcnow().strftime("%Y-%m-%d")
            save_folder = self.evidence_dir / date_dir_name
            save_folder.mkdir(parents=True, exist_ok=True)

            timestamp_str = int(time.time() * 1000)
            safe_event = "".join(c for c in event_type if c.isalnum() or c in "_-").lower()
            filename = f"cam_{camera_id}_{safe_event}_{timestamp_str}.jpg"
            full_path = save_folder / filename

            annotated_frame = frame.copy()
            if bbox and len(bbox) == 4:
                x1, y1, x2, y2 = bbox
                # Red evidence box with corner markers
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                cv2.putText(
                    annotated_frame,
                    f"EVIDENCE: {event_type}",
                    (x1, max(15, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 0, 255),
                    2,
                    cv2.LINE_AA
                )

            # Save JPEG with high quality
            cv2.imwrite(str(full_path), annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
            
            # Return relative path from evidence_dir
            return f"{date_dir_name}/{filename}"
        except Exception as e:
            logger.error(f"Failed to save evidence snapshot: {e}")
            return None

    def get_full_path(self, relative_path: str) -> Optional[Path]:
        """
        Safely resolve relative evidence path preventing directory traversal.
        """
        try:
            # Strip leading slashes
            clean_rel = relative_path.lstrip("/\\")
            full_path = (self.evidence_dir / clean_rel).resolve()
            
            # Check for path traversal attacks
            if not str(full_path).startswith(str(self.evidence_dir.resolve())):
                logger.warning(f"Path traversal attempt blocked: {relative_path}")
                return None

            if full_path.exists() and full_path.is_file():
                return full_path
            return None
        except Exception as e:
            logger.error(f"Error resolving evidence path: {e}")
            return None

    def prune_old_evidence(self, max_days: int = 30) -> int:
        """Prune evidence older than max_days. Returns count of files removed."""
        removed_count = 0
        cutoff = time.time() - (max_days * 86400)
        try:
            for item in self.evidence_dir.rglob("*.jpg"):
                if item.is_file() and item.stat().st_mtime < cutoff:
                    item.unlink()
                    removed_count += 1
        except Exception as e:
            logger.error(f"Error pruning evidence files: {e}")
        return removed_count

evidence_service = EvidenceService()
