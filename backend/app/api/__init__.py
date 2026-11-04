from app.api.auth import router as auth_router
from app.api.cameras import router as cameras_router
from app.api.stream import router as stream_router
from app.api.faces import router as faces_router
from app.api.zones import router as zones_router
from app.api.rules import router as rules_router
from app.api.alerts import router as alerts_router
from app.api.evidence import router as evidence_router
from app.api.system import router as system_router

__all__ = [
    "auth_router",
    "cameras_router",
    "stream_router",
    "faces_router",
    "zones_router",
    "rules_router",
    "alerts_router",
    "evidence_router",
    "system_router",
]
