import pytest
import time
from app.core.zone_engine import is_point_in_polygon, ZoneEngine
from app.core.tracker import Track

def test_point_in_polygon_unit_square():
    square = [(0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8)]
    
    # Clearly inside
    assert is_point_in_polygon((0.5, 0.5), square) is True
    assert is_point_in_polygon((0.3, 0.3), square) is True
    
    # Clearly outside
    assert is_point_in_polygon((0.1, 0.5), square) is False
    assert is_point_in_polygon((0.9, 0.9), square) is False
    assert is_point_in_polygon((0.5, 0.1), square) is False

def test_zone_engine_evaluation():
    engine = ZoneEngine()
    zones = [{
        "id": 1,
        "name": "Restricted Zone A",
        "coordinates": [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]],
        "severity": "HIGH",
        "is_active": True
    }]
    
    # Create track whose footstep is inside (cx=320, cy=240, bottom y=240 -> normalized cx=0.5, fy=0.5)
    trk_inside = Track(track_id=101, class_name="person", bbox=[300, 100, 340, 240])
    
    # Frame size 640x480
    events = engine.evaluate_tracks_in_zones([trk_inside], zones, 640, 480)
    assert len(events) == 1
    assert events[0]["zone_id"] == 1
    assert events[0]["track_id"] == 101
    assert events[0]["is_new_entry"] is True

    # Check dwell time on subsequent call
    time.sleep(0.05)
    events2 = engine.evaluate_tracks_in_zones([trk_inside], zones, 640, 480)
    assert len(events2) == 1
    assert events2[0]["is_new_entry"] is False
    assert events2[0]["dwell_seconds"] >= 0.05

    # Move track outside
    trk_outside = Track(track_id=101, class_name="person", bbox=[50, 50, 70, 70])
    events3 = engine.evaluate_tracks_in_zones([trk_outside], zones, 640, 480)
    assert len(events3) == 0
