import time
from typing import List, Dict, Any, Tuple, Optional
from app.models.zone import ZoneType

def is_point_in_polygon(point: Tuple[float, float], polygon: List[Tuple[float, float]]) -> bool:
    """
    Ray-casting algorithm to determine if a point (x, y) is inside a polygon.
    All coordinates should be in the same space (normalized 0.0-1.0 or pixels).
    """
    x, y = point
    n = len(polygon)
    inside = False

    p1x, p1y = polygon[0]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y

    return inside


class ZoneEngine:
    """
    Manages restricted security zones, intrusion detection, and dwell tracking.
    """

    def __init__(self):
        # Key: (zone_id, track_id) -> entry_timestamp
        self._dwell_records: Dict[Tuple[int, int], float] = {}

    def evaluate_tracks_in_zones(
        self,
        tracks: List[Any],
        zones: List[Dict[str, Any]],
        frame_width: int,
        frame_height: int
    ) -> List[Dict[str, Any]]:
        """
        Evaluate all active tracks against configured restricted zones.
        Returns a list of zone status events:
        {
            "zone_id": int,
            "zone_name": str,
            "track_id": int,
            "class_name": str,
            "identity_name": str,
            "is_known": bool,
            "dwell_seconds": float,
            "is_new_entry": bool,
            "severity": str,
            "footstep_norm": [x, y],
        }
        """
        now = time.time()
        active_zone_events: List[Dict[str, Any]] = []
        current_active_pairs = set()

        for zone in zones:
            if not zone.get("is_active", True):
                continue

            zone_id = zone["id"]
            coords = zone["coordinates"]  # List of [x, y] normalized 0..1
            if len(coords) < 3:
                continue

            poly_pts = [(p[0], p[1]) for p in coords]

            for trk in tracks:
                # Use normalized footstep (cx, y2)
                cx, cy = trk.centroid
                fx, fy = trk.footstep

                fx_norm = fx / max(1, frame_width)
                fy_norm = fy / max(1, frame_height)

                # Check if bottom of track (footstep) is inside zone polygon
                inside = is_point_in_polygon((fx_norm, fy_norm), poly_pts)

                if inside:
                    pair_key = (zone_id, trk.track_id)
                    current_active_pairs.add(pair_key)

                    is_new_entry = False
                    if pair_key not in self._dwell_records:
                        self._dwell_records[pair_key] = now
                        is_new_entry = True

                    dwell_time = round(now - self._dwell_records[pair_key], 1)

                    active_zone_events.append({
                        "zone_id": zone_id,
                        "zone_name": zone["name"],
                        "track_id": trk.track_id,
                        "class_name": trk.class_name,
                        "identity_name": trk.identity_name or "Unknown",
                        "is_known": trk.is_known,
                        "dwell_seconds": dwell_time,
                        "is_new_entry": is_new_entry,
                        "severity": zone.get("severity", "HIGH"),
                        "footstep_norm": [round(fx_norm, 3), round(fy_norm, 3)],
                        "bbox": trk.bbox,
                    })

        # Cleanup dwell records for tracks that have exited
        stale_pairs = [pair for pair in self._dwell_records.keys() if pair not in current_active_pairs]
        for pair in stale_pairs:
            del self._dwell_records[pair]

        return active_zone_events
