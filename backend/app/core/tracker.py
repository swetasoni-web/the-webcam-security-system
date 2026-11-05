import time
import numpy as np
from typing import List, Dict, Any, Optional, Tuple

class Track:
    """Represents a single tracked entity across consecutive video frames."""

    def __init__(self, track_id: int, class_name: str, bbox: List[int], confidence: float = 0.85):
        self.track_id = track_id
        self.class_name = class_name
        self.bbox = bbox
        self.confidence = float(confidence or 0.85)
        self.trajectory: List[Tuple[int, int]] = []
        
        self.first_seen_time = time.time()
        self.last_seen_time = time.time()
        self.time_since_update = 0  # Number of missed frames
        self.hits = 1
        
        # Biometric identity binding (if face recognition matches this track)
        self.identity_name: Optional[str] = None
        self.identity_code: Optional[str] = None
        self.is_known: Optional[bool] = None

        self._update_centroid()

    @property
    def identity(self) -> str:
        return self.identity_name or "Unknown"

    @property
    def identity_confidence(self) -> float:
        return 0.9 if self.is_known else 0.0

    @property
    def is_authorized(self) -> bool:
        return bool(self.is_known)

    def _update_centroid(self) -> None:
        x1, y1, x2, y2 = self.bbox
        cx = int((x1 + x2) / 2)
        cy = int((y1 + y2) / 2)
        self.centroid = (cx, cy)
        # Footstep coordinate: bottom center of bbox (most accurate for ground plane zone intrusion)
        self.footstep = (cx, y2)
        self.trajectory.append(self.centroid)
        # Limit trajectory history to last 50 points
        if len(self.trajectory) > 50:
            self.trajectory.pop(0)

    def update(self, bbox: List[int], class_name: Optional[str] = None, confidence: Optional[float] = None) -> None:
        """Update track with newly observed detection."""
        self.bbox = bbox
        if class_name:
            self.class_name = class_name
        if confidence is not None:
            self.confidence = float(confidence)
        self.last_seen_time = time.time()
        self.time_since_update = 0
        self.hits += 1
        self._update_centroid()

    def mark_missed(self) -> None:
        """Increment missed frame counter."""
        self.time_since_update += 1

    @property
    def dwell_time_seconds(self) -> float:
        """Total active seconds this track has been present."""
        return round(self.last_seen_time - self.first_seen_time, 1)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "track_id": self.track_id,
            "class_name": self.class_name,
            "confidence": getattr(self, "confidence", 0.85),
            "bbox": self.bbox,
            "centroid": self.centroid,
            "footstep": self.footstep,
            "dwell_time": self.dwell_time_seconds,
            "hits": self.hits,
            "identity": self.identity,
            "identity_name": self.identity_name or "Unknown",
            "is_authorized": self.is_authorized,
            "is_known": self.is_known if self.is_known is not None else False,
            "trajectory": self.trajectory[-15:],  # Return recent 15 points
        }


def calculate_iou(boxA: List[int], boxB: List[int]) -> float:
    """Calculate Intersection over Union (IoU) of two bounding boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter_width = max(0, xB - xA)
    inter_height = max(0, yB - yA)
    inter_area = inter_width * inter_height

    boxA_area = max(0, boxA[2] - boxA[0]) * max(0, boxA[3] - boxA[1])
    boxB_area = max(0, boxB[2] - boxB[0]) * max(0, boxB[3] - boxB[1])

    union_area = float(boxA_area + boxB_area - inter_area)
    if union_area <= 0:
        return 0.0
    return inter_area / union_area


class CentroidIoUTracker:
    """
    Combined Centroid & IoU Multi-Object Tracker.
    Maintains persistent IDs across occlusions, handles new tracks, and prunes stale tracks.
    """

    def __init__(self, max_age_frames: int = 30, iou_threshold: float = 0.25):
        self.max_age_frames = max_age_frames
        self.iou_threshold = iou_threshold
        self.tracks: Dict[int, Track] = {}
        self.next_track_id = 1

    def update(self, detections: List[Dict[str, Any]]) -> List[Track]:
        """
        Associate detections with existing tracks using IoU matching.
        Creates new tracks for unmatched detections.
        """
        # If no active tracks, initialize all detections as new tracks
        if len(self.tracks) == 0:
            for det in detections:
                self._create_track(det)
            return list(self.tracks.values())

        track_ids = list(self.tracks.keys())
        active_tracks = [self.tracks[tid] for tid in track_ids]

        if len(detections) == 0:
            for trk in active_tracks:
                trk.mark_missed()
            self._prune_stale_tracks()
            return [t for t in self.tracks.values() if t.time_since_update == 0]

        # Compute IoU cost matrix: rows = existing tracks, cols = new detections
        iou_matrix = np.zeros((len(active_tracks), len(detections)), dtype=np.float32)
        for i, trk in enumerate(active_tracks):
            for j, det in enumerate(detections):
                # Bonus if class names match
                class_match = (trk.class_name == det["class_name"])
                base_iou = calculate_iou(trk.bbox, det["bbox"])
                iou_matrix[i, j] = base_iou if class_match else (base_iou * 0.5)

        # Greedy bipartite matching
        matched_tracks = set()
        matched_detections = set()

        while True:
            max_iou = np.max(iou_matrix)
            if max_iou < self.iou_threshold:
                break
            
            # Find row, col of max IoU
            max_idx = np.unravel_index(np.argmax(iou_matrix), iou_matrix.shape)
            trk_idx, det_idx = int(max_idx[0]), int(max_idx[1])

            matched_trk = active_tracks[trk_idx]
            det = detections[det_idx]

            matched_trk.update(det["bbox"], det.get("class_name"), confidence=det.get("confidence"))
            matched_tracks.add(matched_trk.track_id)
            matched_detections.add(det_idx)

            # Invalidate this row and column
            iou_matrix[trk_idx, :] = -1.0
            iou_matrix[:, det_idx] = -1.0

        # Unmatched existing tracks
        for trk in active_tracks:
            if trk.track_id not in matched_tracks:
                trk.mark_missed()

        # Unmatched detections -> create new tracks
        for j, det in enumerate(detections):
            if j not in matched_detections:
                self._create_track(det)

        self._prune_stale_tracks()
        return [t for t in self.tracks.values() if t.time_since_update == 0]

    def _create_track(self, det: Dict[str, Any]) -> Track:
        trk = Track(
            track_id=self.next_track_id,
            class_name=det.get("class_name", "object"),
            bbox=det["bbox"],
            confidence=det.get("confidence", 0.85)
        )
        self.tracks[self.next_track_id] = trk
        self.next_track_id += 1
        return trk

    def _prune_stale_tracks(self) -> None:
        """Remove tracks that haven't been detected for more than max_age_frames."""
        stale_ids = [
            tid for tid, trk in self.tracks.items()
            if trk.time_since_update > self.max_age_frames
        ]
        for tid in stale_ids:
            del self.tracks[tid]

    def link_face_to_track(self, face_results: List[Dict[str, Any]]) -> None:
        """
        Link face recognition results to tracked persons whose bounding box contains the face.
        """
        for face in face_results:
            fx1, fy1, fx2, fy2 = face["bbox"]
            fcx, fcy = (fx1 + fx2) / 2, (fy1 + fy2) / 2

            # Find person track containing this face center
            for trk in self.tracks.values():
                if trk.class_name == "person":
                    px1, py1, px2, py2 = trk.bbox
                    if px1 <= fcx <= px2 and py1 <= fcy <= py2:
                        trk.identity_name = face["name"]
                        trk.identity_code = face.get("identity_code")
                        trk.is_known = face["is_known"]
                        break
