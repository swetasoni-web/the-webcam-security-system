import pytest
from app.core.tracker import CentroidIoUTracker, calculate_iou, Track

def test_calculate_iou():
    box1 = [0, 0, 10, 10]
    box2 = [0, 0, 10, 10]
    # Exact overlap
    assert calculate_iou(box1, box2) == 1.0

    # Half overlap: box1 area 100, box2 area 100, inter 50, union 150 -> 50/150 = 0.333
    box3 = [5, 0, 15, 10]
    assert round(calculate_iou(box1, box3), 2) == 0.33

    # No overlap
    box4 = [20, 20, 30, 30]
    assert calculate_iou(box1, box4) == 0.0

def test_tracker_tracks_and_face_link():
    tracker = CentroidIoUTracker(max_age_frames=5, iou_threshold=0.2)
    
    # Frame 1: One person detected
    dets1 = [{"class_name": "person", "bbox": [100, 100, 200, 300], "confidence": 0.88}]
    tracks1 = tracker.update(dets1)
    assert len(tracks1) == 1
    t1_id = tracks1[0].track_id

    # Frame 2: Person moves slightly
    dets2 = [{"class_name": "person", "bbox": [105, 102, 205, 302], "confidence": 0.89}]
    tracks2 = tracker.update(dets2)
    assert len(tracks2) == 1
    assert tracks2[0].track_id == t1_id  # Track ID must remain identical!

    # Link face recognition
    face_res = [{
        "bbox": [130, 110, 170, 160],
        "is_known": True,
        "name": "Bob Agent",
        "identity_code": "SEC-007",
        "confidence": 0.95
    }]
    tracker.link_face_to_track(face_res)
    assert tracks2[0].is_known is True
    assert tracks2[0].identity_name == "Bob Agent"
