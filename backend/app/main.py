import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.database import engine, Base, SessionLocal
import app.models  # Ensure all model tables are registered
from app.models.user import User, UserRole
from app.models.camera import Camera, CameraSourceType, CameraStatus
from app.models.zone import RestrictedZone, ZoneType, ZoneSeverity
from app.models.rule import SecurityRule, TargetIdentityType, RuleSeverity
from app.auth.security import get_password_hash
from app.core.registry import pipeline_registry
from app.api import (
    auth_router,
    cameras_router,
    stream_router,
    faces_router,
    zones_router,
    rules_router,
    alerts_router,
    evidence_router,
    system_router,
)
import json

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("the_webcam")

# Rate limiter instance (shared across app)
limiter = Limiter(key_func=get_remote_address)

def init_db_and_seed() -> None:
    """Create all SQLite database tables and seed baseline users & sample camera."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # 1. Seed baseline Admin user if no users exist
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@voltwatch.com",
                hashed_password=get_password_hash(settings.DEFAULT_ADMIN_PASSWORD),
                role=UserRole.ADMIN,
                is_active=True
            )
            db.add(admin)
            logger.info("Initialized default administrator: admin")
        else:
            admin.email = "admin@voltwatch.com"
            admin.hashed_password = get_password_hash(settings.DEFAULT_ADMIN_PASSWORD)

        # 2. Seed Operator user
        operator = db.query(User).filter(User.username == "operator").first()
        if not operator:
            operator = User(
                username="operator",
                email="operator@voltwatch.com",
                hashed_password=get_password_hash(settings.DEFAULT_OPERATOR_PASSWORD),
                role=UserRole.OPERATOR,
                is_active=True
            )
            db.add(operator)
        else:
            operator.email = "operator@voltwatch.com"
            operator.hashed_password = get_password_hash(settings.DEFAULT_OPERATOR_PASSWORD)

        # 3. Seed Viewer user
        viewer = db.query(User).filter(User.username == "viewer").first()
        if not viewer:
            viewer = User(
                username="viewer",
                email="viewer@voltwatch.com",
                hashed_password=get_password_hash(settings.DEFAULT_VIEWER_PASSWORD),
                role=UserRole.VIEWER,
                is_active=True
            )
            db.add(viewer)
        else:
            viewer.email = "viewer@voltwatch.com"
            viewer.hashed_password = get_password_hash(settings.DEFAULT_VIEWER_PASSWORD)

        # 4. Seed initial Camera sources if none exist
        if db.query(Camera).count() == 0:
            # Live Webcam
            live_cam = Camera(
                name="Primary Live Webcam",
                source_type=CameraSourceType.WEBCAM,
                source_url="0",
                resolution_width=640,
                resolution_height=480,
                fps=24,
                is_active=True,
                status=CameraStatus.OFFLINE
            )
            db.add(live_cam)

            # Procedural Simulation Demo Camera
            demo_cam = Camera(
                name="Security Corridor (Demo Feed)",
                source_type=CameraSourceType.DEMO,
                source_url="demo://corridor",
                resolution_width=640,
                resolution_height=480,
                fps=24,
                is_active=True,
                status=CameraStatus.OFFLINE
            )
            db.add(demo_cam)
            db.commit()
            db.refresh(demo_cam)

            # Sample Restricted Zone on Demo Feed
            zone = RestrictedZone(
                camera_id=demo_cam.id,
                name="Secure Doorway Zone",
                zone_type=ZoneType.POLYGON,
                coordinates_json=json.dumps([
                    [0.50, 0.25],
                    [0.85, 0.25],
                    [0.85, 0.85],
                    [0.50, 0.85]
                ]),
                color_hex="#EF4444",
                severity=ZoneSeverity.HIGH,
                is_active=True
            )
            db.add(zone)
            db.commit()
            db.refresh(zone)

            # Sample Rule: Alert on Zone Intrusion
            rule = SecurityRule(
                name="Doorway Intrusion Alert",
                description="Trigger alert when person enters Secure Doorway Zone",
                is_active=True,
                camera_id=demo_cam.id,
                zone_id=zone.id,
                target_classes_json='["person"]',
                target_identity=TargetIdentityType.ANY,
                min_dwell_seconds=1.0,
                schedule_start="00:00",
                schedule_end="23:59",
                cooldown_seconds=15,
                severity=RuleSeverity.HIGH,
                sound_alarm=True,
                email_alert=False
            )
            db.add(rule)

        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error initializing DB seed: {e}")
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and graceful shutdown handler."""
    logger.info("Initializing The WebCam Surveillance System backend...")
    init_db_and_seed()
    yield
    logger.info("Shutting down The WebCam backend, releasing all camera pipelines...")
    pipeline_registry.stop_all()

# FastAPI Application
app = FastAPI(
    title=settings.APP_NAME,
    description="The WebCam: AI-Powered Intelligent Security Surveillance System Using Face Recognition and Object Detection",
    version="1.0.0",
    lifespan=lifespan,
    # Hide docs in production
    docs_url="/docs" if not settings.is_production() else None,
    redoc_url="/redoc" if not settings.is_production() else None,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Middleware — restrict to configured origins in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if settings.is_production() else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Register API Routers
app.include_router(auth_router)
app.include_router(cameras_router)
app.include_router(stream_router)
app.include_router(faces_router)
app.include_router(zones_router)
app.include_router(rules_router)
app.include_router(alerts_router)
app.include_router(evidence_router)
app.include_router(system_router)

@app.get("/api")
def root():
    return {
        "app": settings.APP_NAME,
        "status": "ONLINE",
        "version": "1.0.0",
    }

# --- Serve React SPA (production static files) ---
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve React SPA — catch-all for client-side routing."""
        requested = FRONTEND_DIST / full_path
        if requested.exists() and requested.is_file():
            return FileResponse(str(requested))
        return FileResponse(str(FRONTEND_DIST / "index.html"))

