#!/usr/bin/env python3
"""
The WebCam Production Start Script
Generates a secure random SECRET_KEY if not already set, then starts the server.
Usage: python start.py
"""
import os
import secrets
import subprocess
import sys

# Auto-generate SECRET_KEY if using the default placeholder
secret = os.getenv("SECRET_KEY", "")
if not secret or "CHANGE_ME" in secret or "voltwatch-surveillance" in secret:
    generated = secrets.token_hex(32)
    os.environ["SECRET_KEY"] = generated
    print(f"[WARN] No SECRET_KEY set — generated ephemeral key for this session.")
    print(f"[WARN] For persistent sessions, set SECRET_KEY={generated} in your .env")

port = os.getenv("PORT", "8000")
host = os.getenv("HOST", "0.0.0.0")

cmd = [
    sys.executable, "-m", "uvicorn",
    "app.main:app",
    "--host", host,
    "--port", port,
    "--workers", "1",  # Single worker for SQLite (no shared state)
]

print(f"[INFO] Starting The WebCam backend on {host}:{port}")
subprocess.run(cmd, cwd=os.path.join(os.path.dirname(__file__), "backend"))

