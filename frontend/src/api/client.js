// Centralized API client for The WebCam Surveillance System

// In production (built with Vite), VITE_API_URL can be set to the deployed backend URL.
// In development the Vite proxy forwards /api → http://127.0.0.1:8000.
const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export const authStorage = {
  getToken: () => localStorage.getItem('voltwatch_token'),
  setToken: (token) => localStorage.setItem('voltwatch_token', token),
  getUser: () => {
    try {
      const u = localStorage.getItem('voltwatch_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },
  setUser: (user) => localStorage.setItem('voltwatch_user', JSON.stringify(user)),
  clear: () => {
    localStorage.removeItem('voltwatch_token');
    localStorage.removeItem('voltwatch_user');
  }
};

async function apiFetch(endpoint, options = {}) {
  const token = authStorage.getToken();
  const headers = { ...options.headers };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Do not set Content-Type if sending FormData (browser sets boundary)
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    authStorage.clear();
    // Do not reload automatically if already logging in
    if (!endpoint.includes('/auth/login')) {
      window.dispatchEvent(new CustomEvent('voltwatch_auth_expired'));
    }
  }

  if (!response.ok) {
    let errMessage = `Error ${response.status}: ${response.statusText}`;
    if (response.status === 502 || response.status === 504) {
      errMessage = 'Backend server is not running on http://127.0.0.1:8000. Please start the backend server.';
    } else {
      try {
        const errData = await response.json();
        if (errData && errData.detail) {
          errMessage = typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail);
        }
      } catch {}
    }
    throw new Error(errMessage);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  // Authentication
  login: async (username, password) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    authStorage.setToken(data.access_token);
    authStorage.setUser(data.user);
    return data;
  },
  getMe: () => apiFetch('/auth/me'),
  getUsers: () => apiFetch('/auth/users'),
  createUser: (user) => apiFetch('/auth/users', { method: 'POST', body: JSON.stringify(user) }),

  // Cameras
  getCameras: () => apiFetch('/cameras'),
  getCamera: (id) => apiFetch(`/cameras/${id}`),
  createCamera: (cam) => apiFetch('/cameras', { method: 'POST', body: JSON.stringify(cam) }),
  updateCamera: (id, cam) => apiFetch(`/cameras/${id}`, { method: 'PUT', body: JSON.stringify(cam) }),
  deleteCamera: (id) => apiFetch(`/cameras/${id}`, { method: 'DELETE' }),
  startCamera: (id) => apiFetch(`/cameras/${id}/start`, { method: 'POST' }),
  stopCamera: (id) => apiFetch(`/cameras/${id}/stop`, { method: 'POST' }),
  getAvailableDevices: () => apiFetch('/cameras/devices/available'),
  testCameraSource: (sourceType, sourceUrl) => apiFetch('/cameras/test-source', {
    method: 'POST',
    body: JSON.stringify({ source_type: sourceType, source_url: sourceUrl })
  }),

  // Stream & Telemetry — token injected into URL for MJPEG <img> src compatibility
  getVideoFeedUrl: (id, quality = 80) => {
    const token = authStorage.getToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${API_BASE}/stream/${id}/video_feed?quality=${quality}${tokenParam}`;
  },
  getSnapshotUrl: (id) => `${API_BASE}/stream/${id}/snapshot`,
  getStreamTelemetry: (id) => apiFetch(`/stream/${id}/telemetry`),
  ingestFrame: (id, payload) => apiFetch(`/stream/${id}/ingest_frame`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // Restricted Zones
  getZones: (cameraId = null) => {
    const q = cameraId ? `?camera_id=${cameraId}` : '';
    return apiFetch(`/zones${q}`);
  },
  createZone: (zone) => apiFetch('/zones', { method: 'POST', body: JSON.stringify(zone) }),
  updateZone: (id, zone) => apiFetch(`/zones/${id}`, { method: 'PUT', body: JSON.stringify(zone) }),
  deleteZone: (id) => apiFetch(`/zones/${id}`, { method: 'DELETE' }),

  // Security Rules
  getRules: (cameraId = null) => {
    const q = cameraId ? `?camera_id=${cameraId}` : '';
    return apiFetch(`/rules${q}`);
  },
  createRule: (rule) => apiFetch('/rules', { method: 'POST', body: JSON.stringify(rule) }),
  updateRule: (id, rule) => apiFetch(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(rule) }),
  deleteRule: (id) => apiFetch(`/rules/${id}`, { method: 'DELETE' }),

  // Alerts
  getAlerts: (params = {}) => {
    const query = new URLSearchParams();
    if (params.cameraId) query.set('camera_id', params.cameraId);
    if (params.severity) query.set('severity', params.severity);
    if (params.isAcknowledged !== undefined) query.set('is_acknowledged', params.isAcknowledged);
    if (params.limit) query.set('limit', params.limit);
    return apiFetch(`/alerts?${query.toString()}`);
  },
  acknowledgeAlert: (id, notes = '') => apiFetch(`/alerts/${id}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({ notes })
  }),
  deleteAlert: (id) => apiFetch(`/alerts/${id}`, { method: 'DELETE' }),

  // Face Biometrics
  getFaces: () => apiFetch('/faces'),
  enrollFace: (formData) => apiFetch('/faces/enroll', {
    method: 'POST',
    body: formData
  }),
  deleteFace: (id) => apiFetch(`/faces/${id}`, { method: 'DELETE' }),

  // Evidence
  getEvidenceImageUrl: (relPath) => `${API_BASE}/evidence/snapshot/${relPath}`,
  getFacePhotoUrl: (relPath) => `${API_BASE}/evidence/faces/${relPath}`,

  // System Diagnostics
  getSystemHealth: () => apiFetch('/system/health'),
  getAuditLogs: (limit = 50) => apiFetch(`/system/audit?limit=${limit}`),
  seedDemoData: () => apiFetch('/system/seed_demo_data', { method: 'POST' }),
};
