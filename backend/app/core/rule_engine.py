import time
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from app.models.rule import TargetIdentityType

class RuleEngine:
    """
    Configurable Security Rule Engine with event deduplication and per-track cooldowns.
    Evaluates:
      - Object classification match
      - Known / Unknown identity match
      - Restricted zone presence
      - Minimum dwell time threshold
      - Time-of-day schedule
    """

    def __init__(self):
        # Key: (rule_id, track_id) -> last_triggered_timestamp
        self._cooldown_tracker: Dict[Tuple[int, int], float] = {}

    def _is_within_schedule(self, start_hhmm: str, end_hhmm: str) -> bool:
        """Check if current time is within rule's active operating schedule."""
        now_str = datetime.now().strftime("%H:%M")
        if start_hhmm <= end_hhmm:
            return start_hhmm <= now_str <= end_hhmm
        else:
            # Over midnight window (e.g. 22:00 to 06:00)
            return now_str >= start_hhmm or now_str <= end_hhmm

    def evaluate_rules(
        self,
        camera_id: int,
        tracks: List[Any],
        zone_events: List[Dict[str, Any]],
        rules: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Evaluate security rules against current camera tracks and zone intrusion events.
        Returns triggered alert specifications.
        """
        now = time.time()
        triggered_alerts: List[Dict[str, Any]] = []

        # Create quick lookup for zone events by track_id
        zone_events_by_track: Dict[int, List[Dict[str, Any]]] = {}
        for ze in zone_events:
            tid = ze["track_id"]
            if tid not in zone_events_by_track:
                zone_events_by_track[tid] = []
            zone_events_by_track[tid].append(ze)

        for rule in rules:
            if not rule.get("is_active", True):
                continue

            rule_id = rule["id"]
            
            # 1. Camera binding check
            rule_cam_id = rule.get("camera_id")
            if rule_cam_id is not None and rule_cam_id != camera_id:
                continue

            # 2. Schedule window check
            start_sched = rule.get("schedule_start", "00:00")
            end_sched = rule.get("schedule_end", "23:59")
            if not self._is_within_schedule(start_sched, end_sched):
                continue

            target_classes = rule.get("target_classes", ["person"])
            target_identity = rule.get("target_identity", "ANY")
            rule_zone_id = rule.get("zone_id")
            min_dwell = float(rule.get("min_dwell_seconds", 0.0))
            cooldown = int(rule.get("cooldown_seconds", 15))

            for trk in tracks:
                # 3. Class match check
                if trk.class_name not in target_classes:
                    continue

                # 4. Identity check (ANY, KNOWN, UNKNOWN)
                is_known = trk.is_known is True
                if target_identity == TargetIdentityType.KNOWN.value and not is_known:
                    continue
                if target_identity == TargetIdentityType.UNKNOWN.value and is_known:
                    continue

                # 5. Zone check (if rule specifies a zone)
                track_zone_events = zone_events_by_track.get(trk.track_id, [])
                matched_zone_event = None

                if rule_zone_id is not None:
                    # Must be inside this specific zone
                    for ze in track_zone_events:
                        if ze["zone_id"] == rule_zone_id:
                            matched_zone_event = ze
                            break
                    if not matched_zone_event:
                        continue
                else:
                    # General rule (takes first zone if inside any, or None)
                    if track_zone_events:
                        matched_zone_event = track_zone_events[0]

                # 6. Dwell time check
                effective_dwell = matched_zone_event["dwell_seconds"] if matched_zone_event else trk.dwell_time_seconds
                if effective_dwell < min_dwell:
                    continue

                # 7. Cooldown & Deduplication check
                cooldown_key = (rule_id, trk.track_id)
                last_time = self._cooldown_tracker.get(cooldown_key, 0.0)
                if now - last_time < cooldown:
                    # Suppress alert during cooldown period
                    continue

                # Trigger Rule!
                self._cooldown_tracker[cooldown_key] = now

                event_type = "ZONE_INTRUSION" if matched_zone_event else f"{trk.class_name.upper()}_ALERT"
                if target_identity == TargetIdentityType.UNKNOWN.value:
                    event_type = "UNKNOWN_PERSON_DETECTED"

                zone_desc = f" in {matched_zone_event['zone_name']}" if matched_zone_event else ""
                identity_desc = f" [{trk.identity_name}]" if trk.identity_name else ""
                message = f"Security Rule '{rule['name']}' triggered: {trk.class_name.title()}{identity_desc}{zone_desc} (Dwell: {effective_dwell}s)"

                triggered_alerts.append({
                    "camera_id": camera_id,
                    "rule_id": rule_id,
                    "zone_id": matched_zone_event["zone_id"] if matched_zone_event else None,
                    "event_type": event_type,
                    "severity": rule.get("severity", "HIGH"),
                    "message": message,
                    "track_id": trk.track_id,
                    "entity_class": trk.class_name,
                    "identity_name": trk.identity_name or "Unknown",
                    "confidence": 0.85,
                    "sound_alarm": rule.get("sound_alarm", True),
                    "email_alert": rule.get("email_alert", False),
                    "bbox": trk.bbox,
                })

        # Periodically prune old cooldown records (> 5 minutes old)
        if len(self._cooldown_tracker) > 200:
            stale_keys = [k for k, t in self._cooldown_tracker.items() if now - t > 300]
            for k in stale_keys:
                del self._cooldown_tracker[k]

        return triggered_alerts
