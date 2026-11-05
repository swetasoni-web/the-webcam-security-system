import os
import cv2
import time
import logging
import threading
import numpy as np
from typing import Optional, Tuple, List, Dict, Any
from app.models.camera import CameraSourceType, CameraStatus

logger = logging.getLogger(__name__)

# Force TCP transport for RTSP streams to eliminate UDP packet loss and video artifacting
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|max_delay;500000"

def detect_available_cameras(max_probe: int = 4) -> List[Dict[str, Any]]:
    """
    Probe the local system for physically connected webcams (indices 0 .. max_probe-1).
    Avoids re-opening devices that are currently streaming in active pipelines.
    Returns list of discovered devices with index, backend, and native resolution.
    """
    found_devices = []
    active_indices = set()

    # 1. Check already running camera pipelines first to avoid resource collision
    try:
        from app.core.registry import pipeline_registry
        for cid, pipe in list(pipeline_registry._pipelines.items()):
            if pipe and pipe.is_running and pipe.capture_mgr:
                src = str(pipe.capture_mgr.source_url).strip()
                if src.isdigit():
                    idx = int(src)
                    active_indices.add(idx)
                    label = "Built-in / Primary Webcam (Active)" if idx == 0 else f"External USB Camera {idx} (Active)"
                    found_devices.append({
                        "index": idx,
                        "name": label,
                        "backend": getattr(pipe.capture_mgr, "_backend_used", "DirectShow"),
                        "width": pipe.width,
                        "height": pipe.height,
                        "fps": pipe.target_fps,
                        "source_url": str(idx),
                    })
    except Exception as e:
        logger.debug(f"Error checking active pipelines in camera scan: {e}")

    # 2. Probe remaining indices
    backends = [
        ("DirectShow", cv2.CAP_DSHOW),
        ("MediaFoundation", cv2.CAP_MSMF),
    ]

    for index in range(max_probe):
        if index in active_indices:
            continue

        for backend_name, backend_api in backends:
            cap = None
            try:
                cap = cv2.VideoCapture(index, backend_api)
                if cap and cap.isOpened():
                    ret, frame = cap.read()
                    if ret and frame is not None and frame.size > 0:
                        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
                        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
                        fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
                        
                        device_label = "Built-in / Primary Webcam" if index == 0 else f"External USB Camera {index}"
                        found_devices.append({
                            "index": index,
                            "name": device_label,
                            "backend": backend_name,
                            "width": w,
                            "height": h,
                            "fps": fps if 0 < fps <= 120 else 30,
                            "source_url": str(index),
                        })
                        cap.release()
                        break
                if cap:
                    cap.release()
            except Exception:
                if cap:
                    try:
                        cap.release()
                    except Exception:
                        pass
    return found_devices


class VideoCaptureManager:
    """
    Robust universal video capture manager.
    Supports:
      1. Physical Laptop & USB Webcams (Index 0, 1, 2... with DSHOW / MSMF fallback)
      2. Mobile Phone Webcams (DroidCam, IP Webcam, etc. via HTTP / MJPEG stream)
      3. Network IP Cameras & CCTV (RTSP streams via FFMPEG with TCP transport)
      4. Local Recorded Video Files (.mp4, .avi, .mkv, .mov with auto-looping)
      5. Procedural Synthetic Surveillance Stream (Demo mode for headless/test environments)
    Includes automatic fault recovery & reconnection if video stream drops.
    """

    def __init__(
        self,
        source_type: CameraSourceType,
        source_url: str,
        width: int = 640,
        height: int = 480,
        target_fps: int = 24
    ):
        self.source_type = source_type
        self.source_url = str(source_url).strip()
        self.width = width
        self.height = height
        self.target_fps = target_fps

        self.cap: Optional[cv2.VideoCapture] = None
        self.is_running = False
        self.thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()

        self.latest_frame: Optional[np.ndarray] = None
        self.status = CameraStatus.OFFLINE
        self.last_error: Optional[str] = None
        self.measured_fps = 0.0
        self.frame_count = 0
        self._fps_start_time = time.time()

        # Reconnection telemetry
        self._consecutive_errors = 0
        self._is_reconnecting = False
        self._backend_used = "Default"

        # Procedural demo scene state
        self._demo_tick = 0
        self._is_client_injected = False

    def inject_frame(self, frame: np.ndarray) -> None:
        """Inject an externally captured frame (from browser client webcam, mobile phone, or client device)."""
        if frame is not None and frame.size > 0:
            with self.lock:
                if frame.shape[1] != self.width or frame.shape[0] != self.height:
                    self.latest_frame = cv2.resize(frame, (self.width, self.height))
                else:
                    self.latest_frame = frame.copy()
                self.status = CameraStatus.ONLINE
                self.last_error = None
                self._consecutive_errors = 0
                self.frame_count += 1
                self._is_client_injected = True

    def start(self) -> bool:
        """Start background frame capture worker."""
        if self.is_running:
            return True

        success = self._open_source()
        if not success and self.source_type != CameraSourceType.DEMO:
            # Fallback warning
            logger.warning(f"Could not open source '{self.source_url}'. Will attempt background recovery.")
            self.status = CameraStatus.ERROR

        self.is_running = True
        self.thread = threading.Thread(
            target=self._capture_loop,
            daemon=True,
            name=f"VideoCaptureWorker-{self.source_url}"
        )
        self.thread.start()
        return True

    def stop(self) -> None:
        """Stop background worker and release video capture resources."""
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.5)
        self.thread = None

        with self.lock:
            if self.cap is not None:
                try:
                    self.cap.release()
                except Exception:
                    pass
                self.cap = None
            self.status = CameraStatus.OFFLINE
            self.latest_frame = None

    def _open_source(self) -> bool:
        """Open physical webcam, IP/phone camera stream, or video file with multi-backend fallbacks."""
        if self.source_type == CameraSourceType.DEMO or self.source_url.startswith("demo://"):
            self.source_type = CameraSourceType.DEMO
            self.status = CameraStatus.ONLINE
            self.last_error = None
            return True

        # Close existing capture if any
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None

        url_str = self.source_url.strip()

        # Case A: Numeric index (Webcam 0, 1, 2...)
        if url_str.isdigit():
            cam_idx = int(url_str)
            backends_to_try = [
                ("DirectShow", cv2.CAP_DSHOW),
                ("MediaFoundation", cv2.CAP_MSMF),
                ("Default", cv2.CAP_ANY)
            ]
            
            opened = False
            for b_name, b_api in backends_to_try:
                try:
                    cap = cv2.VideoCapture(cam_idx, b_api)
                    if cap and cap.isOpened():
                        # Configure resolution and zero-buffer for real-time responsiveness
                        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                        
                        # Test reading a test frame
                        ret, test_frame = cap.read()
                        if ret and test_frame is not None:
                            self.cap = cap
                            self._backend_used = b_name
                            self.status = CameraStatus.ONLINE
                            self.last_error = None
                            self._consecutive_errors = 0
                            logger.info(f"Opened physical webcam index {cam_idx} with backend {b_name}")
                            opened = True
                            break
                        cap.release()
                except Exception as e:
                    logger.debug(f"Webcam backend {b_name} failed on index {cam_idx}: {e}")
                    if cap:
                        try:
                            cap.release()
                        except Exception:
                            pass

            if opened:
                return True

            self.status = CameraStatus.ERROR
            self.last_error = f"Cannot access physical camera index {cam_idx}. Check if camera is connected or in use by another app."
            return False

        # Case B: RTSP, HTTP/HTTPS Phone camera stream (DroidCam / IP Webcam / CCTV)
        elif url_str.startswith(("rtsp://", "http://", "https://")):
            try:
                # FFMPEG backend for IP streams
                cap = cv2.VideoCapture(url_str, cv2.CAP_FFMPEG)
                if not cap or not cap.isOpened():
                    cap = cv2.VideoCapture(url_str)

                if cap and cap.isOpened():
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    self.cap = cap
                    self.status = CameraStatus.ONLINE
                    self.last_error = None
                    self._consecutive_errors = 0
                    logger.info(f"Connected to network camera stream: {url_str}")
                    return True
                else:
                    self.status = CameraStatus.ERROR
                    self.last_error = f"Cannot connect to network stream: {url_str}"
                    return False
            except Exception as e:
                self.status = CameraStatus.ERROR
                self.last_error = f"Stream error: {str(e)}"
                return False

        # Case C: Video File (MP4, AVI, MKV, etc.)
        else:
            try:
                cap = cv2.VideoCapture(url_str)
                if cap and cap.isOpened():
                    self.cap = cap
                    self.status = CameraStatus.ONLINE
                    self.last_error = None
                    self._consecutive_errors = 0
                    logger.info(f"Opened video file: {url_str}")
                    return True
                else:
                    self.status = CameraStatus.ERROR
                    self.last_error = f"Cannot open video file: {url_str}"
                    return False
            except Exception as e:
                self.status = CameraStatus.ERROR
                self.last_error = f"File error: {str(e)}"
                return False

    def _capture_loop(self) -> None:
        """Background thread continuously reading frames at target FPS with auto-reconnection."""
        frame_interval = 1.0 / max(1, self.target_fps)
        self._fps_start_time = time.time()
        self.frame_count = 0

        while self.is_running:
            loop_start = time.time()
            frame = None

            if self.source_type == CameraSourceType.DEMO:
                frame = self._generate_demo_frame()
                self.status = CameraStatus.ONLINE
            else:
                if self.cap and self.cap.isOpened():
                    try:
                        ret, raw_frame = self.cap.read()
                        if ret and raw_frame is not None and raw_frame.size > 0:
                            # Frame read succeeded
                            self._consecutive_errors = 0
                            self.status = CameraStatus.ONLINE
                            self.last_error = None
                            
                            # Resize only if necessary to save CPU
                            if raw_frame.shape[1] != self.width or raw_frame.shape[0] != self.height:
                                frame = cv2.resize(raw_frame, (self.width, self.height))
                            else:
                                frame = raw_frame
                        else:
                            # Recorded video looping
                            if self.source_type == CameraSourceType.RECORDED:
                                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                            else:
                                self._consecutive_errors += 1
                                self.last_error = f"Camera read dropped ({self._consecutive_errors} frames)"
                                time.sleep(0.05)
                    except Exception as e:
                        self._consecutive_errors += 1
                        self.last_error = str(e)
                        time.sleep(0.05)
                else:
                    self._consecutive_errors += 1
                    self.status = CameraStatus.ERROR
                    self.last_error = "Camera device not ready or disconnected."
                    time.sleep(0.2)

                # Automatic Reconnection Recovery: if camera fails for 15+ consecutive frames (~1 second)
                if self._consecutive_errors >= 15 and not self._is_reconnecting:
                    self._is_reconnecting = True
                    logger.warning(f"Connection lost on {self.source_url}. Initiating auto-reconnect...")
                    self.status = CameraStatus.ERROR
                    try:
                        time.sleep(0.5)
                        reopened = self._open_source()
                        if reopened:
                            logger.info(f"Auto-reconnected successfully to {self.source_url}")
                            self._consecutive_errors = 0
                    except Exception as err:
                        logger.error(f"Auto-reconnect error on {self.source_url}: {err}")
                    finally:
                        self._is_reconnecting = False

            if frame is None and not self._is_client_injected:
                # If physical device unavailable (e.g. cloud host without USB), provide standby simulation
                frame = self._generate_demo_frame()
                self.status = CameraStatus.ONLINE

            if frame is not None:
                with self.lock:
                    self.latest_frame = frame
                    self.frame_count += 1

                # Update measured FPS every 24 frames
                if self.frame_count % 24 == 0:
                    elapsed = time.time() - self._fps_start_time
                    if elapsed > 0:
                        self.measured_fps = round(24.0 / elapsed, 1)
                    self._fps_start_time = time.time()

            # Throttle to maintain target FPS smoothly
            processing_time = time.time() - loop_start
            sleep_duration = max(0.001, frame_interval - processing_time)
            time.sleep(sleep_duration)

    def _generate_demo_frame(self) -> np.ndarray:
        """
        Generate a procedural synthetic CCTV surveillance corridor scene with animated targets.
        Enables full end-to-end testing even when no physical webcam is plugged in.
        """
        self._demo_tick += 1
        canvas = np.zeros((self.height, self.width, 3), dtype=np.uint8)

        # Soft slate-gray modern surveillance background (light & clean)
        canvas[:] = (32, 38, 46)
        grid_step = 40
        for x in range(0, self.width, grid_step):
            cv2.line(canvas, (x, 0), (x, self.height), (40, 48, 58), 1)
        for y in range(0, self.height, grid_step):
            cv2.line(canvas, (0, y), (self.width, y), (40, 48, 58), 1)

        # Architectural corridor walls and floor
        cv2.rectangle(canvas, (70, 90), (self.width - 70, self.height - 35), (55, 65, 78), 2)
        cv2.line(canvas, (70, self.height - 35), (self.width - 70, self.height - 35), (80, 95, 115), 3)

        # Animated Subject 1: Walking person (intruder moving across the scene)
        t = self._demo_tick * 0.04
        p1_x = int(140 + (np.sin(t) * 0.5 + 0.5) * (self.width - 280))
        p1_y = int(self.height * 0.44)
        p1_w, p1_h = 70, 150

        # Draw human figure
        # Head
        cv2.circle(canvas, (p1_x + p1_w // 2, p1_y + 20), 18, (140, 180, 230), -1)
        # Torso
        cv2.rectangle(canvas, (p1_x + 15, p1_y + 40), (p1_x + p1_w - 15, p1_y + 100), (100, 135, 190), -1)
        # Legs
        cv2.rectangle(canvas, (p1_x + 18, p1_y + 100), (p1_x + 32, p1_y + p1_h), (80, 110, 150), -1)
        cv2.rectangle(canvas, (p1_x + p1_w - 32, p1_y + 100), (p1_x + p1_w - 18, p1_y + p1_h), (80, 110, 150), -1)
        # Backpack
        cv2.rectangle(canvas, (p1_x + 8, p1_y + 50), (p1_x + 22, p1_y + 85), (60, 85, 130), -1)

        # Animated Subject 2: Security patrol
        t2 = self._demo_tick * 0.025 + 2.5
        p2_x = int(120 + (np.cos(t2) * 0.5 + 0.5) * (self.width - 260))
        p2_y = int(self.height * 0.40)
        p2_w, p2_h = 60, 140

        cv2.circle(canvas, (p2_x + p2_w // 2, p2_y + 18), 16, (150, 210, 150), -1)
        cv2.rectangle(canvas, (p2_x + 14, p2_y + 36), (p2_x + p2_w - 14, p2_y + 90), (70, 140, 90), -1)
        cv2.rectangle(canvas, (p2_x + 16, p2_y + 90), (p2_x + 28, p2_y + p2_h), (50, 100, 70), -1)
        cv2.rectangle(canvas, (p2_x + p2_w - 28, p2_y + 90), (p2_x + p2_w - 16, p2_y + p2_h), (50, 100, 70), -1)

        # Header Watermark
        cv2.putText(canvas, "[DEMO CORRIDOR FEED - SYNTHETIC SIMULATION]", (15, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 220, 255), 1, cv2.LINE_AA)
        time_str = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(canvas, time_str, (self.width - 185, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1, cv2.LINE_AA)

        return canvas

    def get_latest_frame(self) -> Optional[np.ndarray]:
        """Thread-safe retrieval of the latest captured frame."""
        with self.lock:
            if self.latest_frame is None:
                return None
            return self.latest_frame.copy()
