import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.auth.security import create_access_token

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/api")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ONLINE"

def test_system_health():
    response = client.get("/api/system/health")
    assert response.status_code == 200
    data = response.json()
    assert "components" in data
    assert "database" in data["components"]
    assert "hardware_camera_0" in data["components"]

def test_auth_login():
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "Sumit@123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["role"] == "ADMIN"

def test_camera_list():
    token = create_access_token("admin", "ADMIN")
    response = client.get(
        "/api/cameras",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    cameras = response.json()
    assert len(cameras) >= 1  # Baseline cameras seeded

def test_camera_device_scan():
    token = create_access_token("admin", "ADMIN")
    response = client.get(
        "/api/cameras/devices/available",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "devices" in data
    assert "count" in data

def test_camera_test_source_demo():
    token = create_access_token("admin", "ADMIN")
    response = client.post(
        "/api/cameras/test-source",
        json={"source_type": "DEMO", "source_url": "demo://corridor"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
