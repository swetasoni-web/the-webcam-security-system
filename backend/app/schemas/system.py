from datetime import datetime
from typing import Dict, Any, List
from pydantic import BaseModel

class SystemHealthResponse(BaseModel):
    status: str
    timestamp: datetime
    app_name: str
    version: str
    environment: str
    components: Dict[str, Dict[str, Any]]

class StreamStatsResponse(BaseModel):
    camera_id: int
    mode: str  # LIVE, RECORDED, DEMO, ERROR
    source_url: str
    is_running: bool
    fps: float
    resolution: str
    active_tracks_count: int
    current_detections: List[Dict[str, Any]]
