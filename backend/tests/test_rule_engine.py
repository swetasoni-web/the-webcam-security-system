import pytest
import time
from app.core.rule_engine import RuleEngine
from app.core.tracker import Track

def test_rule_engine_matching_and_cooldown():
    engine = RuleEngine()
    
    rules = [{
        "id": 1,
        "name": "Person Intrusion Rule",
        "camera_id": 1,
        "zone_id": 10,
        "target_classes": ["person"],
        "target_identity": "ANY",
        "min_dwell_seconds": 0.0,
        "schedule_start": "00:00",
        "schedule_end": "23:59",
        "cooldown_seconds": 10,
        "severity": "CRITICAL",
        "is_active": True,
        "sound_alarm": True,
        "email_alert": False
    }]

    trk = Track(track_id=1, class_name="person", bbox=[100, 100, 200, 200])
    zone_events = [{
        "zone_id": 10,
        "zone_name": "Vault",
        "track_id": 1,
        "dwell_seconds": 2.0
    }]

    # 1. First evaluation: should trigger alert
    alerts = engine.evaluate_rules(camera_id=1, tracks=[trk], zone_events=zone_events, rules=rules)
    assert len(alerts) == 1
    assert alerts[0]["rule_id"] == 1
    assert alerts[0]["track_id"] == 1
    assert alerts[0]["severity"] == "CRITICAL"

    # 2. Immediate re-evaluation: cooldown should suppress duplicate alert
    alerts_cooldown = engine.evaluate_rules(camera_id=1, tracks=[trk], zone_events=zone_events, rules=rules)
    assert len(alerts_cooldown) == 0

def test_rule_engine_identity_filter():
    engine = RuleEngine()
    rules = [{
        "id": 2,
        "name": "Unknown Only Rule",
        "camera_id": None,
        "zone_id": None,
        "target_classes": ["person"],
        "target_identity": "UNKNOWN",
        "min_dwell_seconds": 0.0,
        "schedule_start": "00:00",
        "schedule_end": "23:59",
        "cooldown_seconds": 10,
        "severity": "HIGH",
        "is_active": True
    }]

    # Track with Known identity
    trk_known = Track(track_id=2, class_name="person", bbox=[100, 100, 200, 200])
    trk_known.is_known = True
    trk_known.identity_name = "Alice"

    alerts = engine.evaluate_rules(camera_id=1, tracks=[trk_known], zone_events=[], rules=rules)
    assert len(alerts) == 0  # Should NOT trigger for known identity

    # Track with Unknown identity
    trk_unknown = Track(track_id=3, class_name="person", bbox=[100, 100, 200, 200])
    trk_unknown.is_known = False
    trk_unknown.identity_name = "Unknown"

    alerts2 = engine.evaluate_rules(camera_id=1, tracks=[trk_unknown], zone_events=[], rules=rules)
    assert len(alerts2) == 1  # Should trigger for unknown
