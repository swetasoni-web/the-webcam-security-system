# Architecture & Engineering Decisions (ADR)

## ADR 001: Python 3.11 Runtime & Package Isolation
- **Context:** The host system default Python is 3.14.7, which lacks binary prebuilt wheels for PyTorch, OpenCV, Ultralytics, and scientific packages on Windows.
- **Decision:** Use `uv` to provision a dedicated, isolated Python 3.11.15 environment in `.venv`.
- **Consequences:** Eliminates C++ compiler dependencies for wheels; guarantees 100% stable compatibility with OpenCV and PyTorch.

## ADR 002: CPU-Optimized Model Selection
- **Context:** The host has an Intel UHD Graphics 620 integrated GPU (no dedicated NVIDIA CUDA hardware).
- **Decision:** Use YOLOv8n (nano, ~3.2M params) for object detection and lightweight face embedding models with cosine similarity vector matching.
- **Consequences:** Delivers 15-30 FPS on standard modern Intel CPUs without requiring CUDA or heavy external GPU dependencies.

## ADR 003: Video Pipeline & Non-Blocking Architecture
- **Context:** Running heavy AI models directly in an HTTP request handler would block the event loop, causing dropped frames and sluggish UI responses.
- **Decision:** Implement a multi-threaded `VideoPipeline` where frame capture, AI inference, tracking, and rule evaluation run in dedicated background worker threads, exposing thread-safe buffer snapshots for MJPEG streaming and WebSocket events.
- **Consequences:** Keeps web API response latencies below 10ms regardless of video processing workload.

## ADR 004: Explicit Operational Modes & Status Integrity
- **Context:** Project requires strict truth in reporting hardware states, refusing to fake live camera feeds or AI detection results.
- **Decision:** System reports 4 distinct modes:
  1. `LIVE`: Real webcam / USB camera or authenticated RTSP IP camera verified.
  2. `RECORDED`: Playing a sample video file from disk with simulated real-time frame timing.
  3. `DEMO`: Procedural synthetic frames clearly labelled with animated visual targets for testing without a camera.
  4. `ERROR`: Explicit disconnection or failure reason displayed with recovery instructions.
- **Consequences:** Full academic and operational transparency.

## ADR 005: Normalized Geometric Zones
- **Context:** Video streams may be rendered at varying resolutions (e.g., 640x480, 1280x720, 1920x1080) and dashboard displays are responsive.
- **Decision:** Store all zone polygon coordinates as normalized ratios `(x, y)` where `0.0 <= x <= 1.0` and `0.0 <= y <= 1.0`.
- **Consequences:** Zones remain accurate regardless of input stream resolution changes or aspect ratio scaling.
