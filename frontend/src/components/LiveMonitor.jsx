import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Camera, 
  Maximize2, 
  Radio, 
  Activity, 
  ShieldAlert, 
  UserCheck, 
  UserX, 
  Clock, 
  RefreshCw,
  Plus,
  Video,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Eye
} from 'lucide-react';
import { api } from '../api/client';
import CameraManagerModal from './CameraManagerModal';

export default function LiveMonitor({ cameras, selectedCameraId, onSelectCamera, onNewAlert, onCamerasUpdated }) {
  const [telemetry, setTelemetry] = useState(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [quality, setQuality] = useState(80);
  const [streamError, setStreamError] = useState(false);
  const [streamKey, setStreamKey] = useState(Date.now());
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  
  // Universal Device Camera State (Laptop, PC, Android Phone, iOS)
  const [isDeviceCamActive, setIsDeviceCamActive] = useState(false);
  const [deviceCamLoading, setDeviceCamLoading] = useState(false);
  const [deviceCamError, setDeviceCamError] = useState(null);
  const [facingMode, setFacingMode] = useState('user'); // 'user' (Front/Selfie) | 'environment' (Rear/Main)
  const [clientFps, setClientFps] = useState(0);
  const [latestDetections, setLatestDetections] = useState([]);
  const [deviceCamAlert, setDeviceCamAlert] = useState(null);
  const [alertToast, setAlertToast] = useState(null); // { message, severity, id }
  const [lastInferenceMs, setLastInferenceMs] = useState(0);
  const [aiServerStatus, setAiServerStatus] = useState('STANDBY'); // 'STANDBY' | 'CONNECTING' | 'ACTIVE' | 'ERROR'
  const [aiServerMessage, setAiServerMessage] = useState('');

  const videoContainerRef = useRef(null);
  const localVideoRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const localStreamRef = useRef(null);
  const facingModeRef = useRef(facingMode);

  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  const activeCamera = cameras.find(c => c.id === Number(selectedCameraId)) || cameras[0] || { id: 1, name: 'Hardware Webcam', source_type: 'WEBCAM' };

  // Poll real-time telemetry every 3000ms ONLY when not using device camera (prevents 502 connection flooding)
  useEffect(() => {
    if (!activeCamera || isDeviceCamActive) return;

    let isMounted = true;
    const fetchTelemetry = async () => {
      try {
        const data = await api.getStreamTelemetry(activeCamera.id);
        if (isMounted) {
          setTelemetry(data);
          setStreamError(!data.is_running && data.status === 'ERROR');
        }
      } catch (err) {
        if (isMounted) setStreamError(true);
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeCamera?.id, isDeviceCamActive]);

  // Clean up device camera stream on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
    };
  }, []);

  // Ensure video element plays stream as soon as isDeviceCamActive changes
  useEffect(() => {
    if (isDeviceCamActive && localStreamRef.current && localVideoRef.current) {
      if (localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      localVideoRef.current.play().catch(e => {
        console.debug('Video play attempt on effect:', e);
      });
    }
  }, [isDeviceCamActive]);

  // Universal Device Camera: Start / Stop / Flip
  const startDeviceCamera = async (mode = facingMode) => {
    try {
      setDeviceCamLoading(true);
      setDeviceCamError(null);

      // Stop existing tracks if switching modes
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API (getUserMedia) is not supported in this browser or environment.');
      }

      let stream = null;
      try {
        // 1. Preferred constraints (ideal mode so it doesn't fail on PC webcams without facingMode tags)
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: false
        });
      } catch (err1) {
        console.warn('Ideal camera constraints failed, attempting fallback to generic video: true', err1);
        // 2. Generic fallback (guaranteed to work on all USB webcams, laptops, and virtual cams)
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      localStreamRef.current = stream;

      // Assign to video element immediately
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        try {
          await localVideoRef.current.play();
        } catch (e) {
          console.debug('Direct play err, onLoadedMetadata will play:', e);
        }
      }

      setIsDeviceCamActive(true);
      setDeviceCamLoading(false);
      setStreamError(false);
    } catch (err) {
      console.error('Error starting device camera:', err);
      let msg = err.message;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please click the camera icon in your browser address bar and choose "Always allow".';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No physical camera device was detected on this hardware.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera is already in use by another application. Please close Zoom/Teams/Camera app and retry.';
      }
      setDeviceCamError(msg);
      setIsDeviceCamActive(false);
      setDeviceCamLoading(false);
    }
  };

  const stopDeviceCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setIsDeviceCamActive(false);
    setLatestDetections([]);
    setDeviceCamAlert(null);
    setAiServerStatus('STANDBY');
    setAiServerMessage('');
    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const toggleDeviceCamera = () => {
    if (isDeviceCamActive) {
      stopDeviceCamera();
    } else {
      startDeviceCamera(facingMode);
    }
  };

  const flipCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startDeviceCamera(nextMode);
  };

  // Real-time AI processing loop for client device camera
  useEffect(() => {
    if (!isDeviceCamActive) return;

    let isRunning = true;
    let inFlight = false;
    let lastFrameTime = performance.now();
    let frameCount = 0;

    const offscreen = document.createElement('canvas');
    // High-speed 320x240 capture: 85% less network payload (~6KB vs 45KB), 3x faster inference
    offscreen.width = 320;
    offscreen.height = 240;
    const offCtx = offscreen.getContext('2d');

    const sendFrame = async () => {
      if (!isRunning) return;
      const video = localVideoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight || video.readyState < 2 || video.paused || video.ended || inFlight) {
        if (isRunning) requestAnimationFrame(() => setTimeout(sendFrame, 100));
        return;
      }

      inFlight = true;
      let nextDelay = 120; // Default: ~8 FPS (ideal real-time cadence on cloud free-tier)
      try {
        offCtx.drawImage(video, 0, 0, 320, 240);
        const dataUrl = offscreen.toDataURL('image/jpeg', 0.55);

        const targetCamId = activeCamera?.id || 1;
        const res = await api.ingestFrame(targetCamId, { image_base64: dataUrl });
        if (isRunning && res && res.success) {
          setAiServerStatus('ACTIVE');
          setAiServerMessage(`Infer: ${res.inference_ms || 0}ms`);
          setLastInferenceMs(res.inference_ms || 0);
          nextDelay = 120;

          const combined = [...(res.detections || [])];
          if (res.faces && res.faces.length > 0) {
            res.faces.forEach((f, idx) => {
              const alreadyHasPerson = combined.some(d => d.class_name === 'person');
              if (!alreadyHasPerson) {
                combined.push({
                  track_id: `face-${idx + 1}`,
                  class_name: 'person',
                  confidence: f.confidence || 0.95,
                  identity: f.identity || 'Authorized/Visitor',
                  identity_confidence: 0.9,
                  is_authorized: f.is_authorized,
                  bbox: f.bbox
                });
              }
            });
          }
          setLatestDetections(combined);
          drawHUDOverlay(res);

          if (res.alerts && res.alerts.length > 0) {
            setDeviceCamAlert(res.alerts[0]);
            // Show toast notification for security alert
            const toastMsg = res.alerts[0].description || res.alerts[0].rule_name || 'Security Alert Triggered!';
            setAlertToast({ message: toastMsg, severity: res.alerts[0].severity || 'HIGH', id: Date.now() });
            setTimeout(() => setAlertToast(null), 4000);
            if (onNewAlert) {
              res.alerts.forEach(a => onNewAlert(a));
            }
          }

          // Compute Client FPS
          frameCount++;
          const now = performance.now();
          if (now - lastFrameTime >= 1000) {
            setClientFps(Math.round((frameCount * 1000) / (now - lastFrameTime)));
            frameCount = 0;
            lastFrameTime = now;
          }
        }
      } catch (err) {
        console.debug('Frame ingestion error:', err);
        setAiServerStatus('CONNECTING');
        setAiServerMessage('Connecting to AI cloud service (Render waking up, please wait ~20s)...');
        nextDelay = 2500; // 2.5s backoff on 502/network failure allows cloud container to boot and recover
      } finally {
        inFlight = false;
        if (isRunning) {
          setTimeout(sendFrame, nextDelay);
        }
      }
    };

    const timer = setTimeout(sendFrame, 200);

    return () => {
      isRunning = false;
      clearTimeout(timer);
    };
  }, [isDeviceCamActive, activeCamera?.id]);

  const drawHUDOverlay = (res) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width = canvas.clientWidth || 640;
    const height = canvas.height = canvas.clientHeight || 480;
    ctx.clearRect(0, 0, width, height);

    // Compute exact video aspect ratio fit (handles pillarbox & letterbox on PC and Mobile)
    const video = localVideoRef.current;
    const vw = (video && video.videoWidth > 0) ? video.videoWidth : 640;
    const vh = (video && video.videoHeight > 0) ? video.videoHeight : 480;
    const videoAspect = vw / vh;
    const containerAspect = width / height;

    let renderW = width;
    let renderH = height;
    let offsetX = 0;
    let offsetY = 0;

    if (containerAspect > videoAspect) {
      // Container is wider than video -> pillarboxed (black bars on left & right)
      renderH = height;
      renderW = height * videoAspect;
      offsetX = (width - renderW) / 2;
    } else {
      // Container is taller than video -> letterboxed (black bars on top & bottom)
      renderW = width;
      renderH = width / videoAspect;
      offsetY = (height - renderH) / 2;
    }

    const baseW = res.frame_width || 320;
    const baseH = res.frame_height || 240;
    const scaleX = renderW / baseW;
    const scaleY = renderH / baseH;

    // Draw Detections
    const detections = res.detections || [];
    detections.forEach((det) => {
      if (!det.bbox || det.bbox.length < 4) return;
      const [x1, y1, x2, y2] = det.bbox.map((v, i) => i % 2 === 0 ? v * scaleX : v * scaleY);
      const boxW = x2 - x1;
      const boxH = y2 - y1;

      // Invert X when front selfie camera is mirrored via CSS scaleX(-1)
      const isMirrored = isDeviceCamActive && (facingModeRef.current === 'user');
      const renderX = offsetX + (isMirrored ? (renderW - x2) : x1);
      const renderY = offsetY + y1;

      const isAuth = det.is_authorized === true;
      const isAlert = det.identity === 'UNAUTHORIZED' || det.is_authorized === false;

      let strokeColor = '#00F0FF'; // Cyber cyan
      if (isAuth) strokeColor = '#10B981'; // Emerald
      if (isAlert) strokeColor = '#EF4444'; // Red alert

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(renderX, renderY, boxW, boxH);

      // Label text
      let label = `${det.class_name.toUpperCase()} ${Math.round((det.confidence || 0) * 100)}%`;
      if (det.identity && det.identity !== 'Unknown') {
        label = `${det.identity.toUpperCase()} [${Math.round((det.identity_confidence || 0) * 100)}%]`;
      }

      ctx.font = 'bold 12px sans-serif';
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = strokeColor;
      ctx.fillRect(renderX, Math.max(offsetY, renderY - 22), textWidth + 12, 22);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, renderX + 6, Math.max(offsetY + 15, renderY - 6));
    });

    // Draw Face Target Overlays
    const faces = res.faces || [];
    faces.forEach((f) => {
      if (!f.bbox || f.bbox.length < 4) return;
      const [fx1, fy1, fx2, fy2] = f.bbox.map((v, i) => i % 2 === 0 ? v * scaleX : v * scaleY);
      const fBoxW = fx2 - fx1;
      const fBoxH = fy2 - fy1;
      const isMirrored = isDeviceCamActive && (facingModeRef.current === 'user');
      const fRenderX = offsetX + (isMirrored ? (renderW - fx2) : fx1);
      const fRenderY = offsetY + fy1;

      const isKnown = f.is_authorized === true;
      const faceColor = isKnown ? '#10B981' : '#F59E0B'; // Emerald if authorized, Amber if unrecognized

      ctx.save();
      ctx.strokeStyle = faceColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(fRenderX, fRenderY, fBoxW, fBoxH);
      ctx.restore();

      const faceLabel = `👤 ${f.identity || 'Person'} (${Math.round((f.confidence || 0) * 100)}%)`;
      ctx.font = '10px monospace';
      ctx.fillStyle = faceColor;
      ctx.fillText(faceLabel, fRenderX, Math.max(offsetY + 12, fRenderY - 4));
    });

    // Top status indicator on canvas
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#00F0FF';
    ctx.fillText(`AI INFERENCE: ${res.inference_ms || 0}ms | DETECTIONS: ${detections.length} | FACES: ${faces.length}`, 16, 26);
  };

  const toggleStream = async () => {
    if (!activeCamera) return;
    try {
      if (isPlaying) {
        await api.stopCamera(activeCamera.id);
        setIsPlaying(false);
      } else {
        await api.startCamera(activeCamera.id);
        setIsPlaying(true);
        setStreamKey(Date.now());
      }
    } catch (err) {
      alert(`Error toggling camera: ${err.message}`);
    }
  };

  const handleTakeSnapshot = () => {
    if (isDeviceCamActive && localVideoRef.current) {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = localVideoRef.current.videoWidth || 640;
      snapCanvas.height = localVideoRef.current.videoHeight || 480;
      const ctx = snapCanvas.getContext('2d');
      ctx.drawImage(localVideoRef.current, 0, 0);
      const win = window.open();
      if (win) {
        win.document.write(`<img src="${snapCanvas.toDataURL('image/jpeg', 0.9)}" style="max-width:100%; height:auto;" />`);
      }
      return;
    }
    if (!activeCamera) return;
    const url = api.getSnapshotUrl(activeCamera.id);
    window.open(url, '_blank');
  };

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen().catch(err => console.error(err));
    }
  };

  const feedUrl = activeCamera ? api.getVideoFeedUrl(activeCamera.id, quality) + `&t=${streamKey}` : '';
  const currentMode = isDeviceCamActive ? 'THIS DEVICE' : (telemetry?.mode || activeCamera?.source_type || 'DEMO');

  return (
    <div className="monitor-grid">
      {/* Left Column: Video Viewport & Controls */}
      <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        
        {/* Top Camera Switcher & Action Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          
          {/* Camera Selection & Quick Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                id="active-camera-select"
                aria-label="Select Active Camera"
                className="form-input"
                style={{ width: '230px', fontWeight: 600, padding: '7px 10px' }}
                value={activeCamera?.id || ''}
                onChange={(e) => onSelectCamera(Number(e.target.value))}
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.source_type})
                  </option>
                ))}
              </select>

              <button
                onClick={() => setIsCameraModalOpen(true)}
                className="btn btn-primary"
                style={{ padding: '7px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                title="Add new camera or scan hardware webcams"
                aria-label="Add or Manage Cameras"
              >
                <Plus size={15} />
                <span>Add / Manage</span>
              </button>
            </div>

            {/* Mode Badge */}
            <span className={`badge ${
              isDeviceCamActive ? 'badge-live' :
              currentMode === 'WEBCAM' || currentMode === 'LIVE' ? 'badge-live' : 
              currentMode === 'DEMO' ? 'badge-demo' : 'badge-recorded'
            }`}>
              <span className={isDeviceCamActive || currentMode === 'WEBCAM' || currentMode === 'LIVE' ? 'live-indicator-dot' : 'demo-indicator-dot'} />
              {currentMode}
            </span>
          </div>

          {/* Player Controls & Universal Device Camera Trigger */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            
            {/* Primary Toggle: USE DEVICE CAMERA (Laptop/PC/Phone) */}
            <button
              onClick={toggleDeviceCamera}
              className={`btn ${isDeviceCamActive ? 'btn-danger' : 'btn-primary'}`}
              style={{
                padding: '7px 14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: isDeviceCamActive ? '#EF4444' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#fff',
                boxShadow: isDeviceCamActive ? '0 0 12px rgba(239, 68, 68, 0.4)' : '0 0 12px rgba(2, 132, 199, 0.35)'
              }}
              title="Stream from this device's camera (Laptop, PC USB Webcam, Android, iOS)"
              aria-label={isDeviceCamActive ? 'Stop Device Camera' : 'Use My Device Camera'}
            >
              <Video size={16} />
              <span>{isDeviceCamActive ? 'Stop Device Camera' : '🎥 Use My Device Camera'}</span>
            </button>

            {/* Mobile Camera Flip Button (Front / Rear) */}
            {isDeviceCamActive && (
              <button
                onClick={flipCamera}
                className="btn btn-secondary"
                style={{ padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                title="Flip between Front (Selfie) and Rear (Main) Camera"
                aria-label="Flip Camera between Front and Rear"
              >
                <RefreshCw size={14} />
                <span>Flip ({facingMode === 'user' ? 'Front' : 'Rear'})</span>
              </button>
            )}

            {!isDeviceCamActive && (
              <button 
                onClick={toggleStream} 
                className={`btn ${isPlaying ? 'btn-secondary' : 'btn-primary'}`}
                style={{ padding: '7px 12px' }}
                aria-label={isPlaying ? 'Pause Feed' : 'Start Feed'}
              >
                {isPlaying ? <Square size={14} /> : <Play size={14} />}
                <span>{isPlaying ? 'Pause Feed' : 'Start Feed'}</span>
              </button>
            )}

            <button 
              onClick={handleTakeSnapshot} 
              className="btn btn-secondary" 
              style={{ padding: '7px 12px' }}
              title="Capture Instant Frame Snapshot"
              aria-label="Capture Instant Frame Snapshot"
            >
              <Camera size={14} />
              <span>Snapshot</span>
            </button>

            <button 
              onClick={toggleFullscreen} 
              className="btn btn-secondary" 
              style={{ padding: '7px 10px' }}
              title="Toggle Fullscreen"
              aria-label="Toggle Fullscreen"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        {/* Device Camera Error Alert if Permission Denied */}
        {deviceCamError && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid #ef4444',
            color: '#ef4444',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertTriangle size={18} />
            <span>{deviceCamError}</span>
          </div>
        )}

        {/* Quick Camera Pills Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Cameras:
          </span>
          {cameras.map((cam) => {
            const isCur = cam.id === activeCamera?.id;
            return (
              <button
                key={cam.id}
                onClick={() => onSelectCamera(cam.id)}
                style={{
                  padding: '3px 10px',
                  borderRadius: '16px',
                  border: isCur ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                  background: isCur ? 'rgba(2, 132, 199, 0.12)' : 'var(--bg-secondary)',
                  color: isCur ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: isCur ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap'
                }}
              >
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: cam.status === 'ONLINE' || (isCur && isDeviceCamActive) ? 'var(--accent-emerald)' : 'var(--text-muted)'
                }} />
                {cam.name}
              </button>
            );
          })}
        </div>

        {/* Video Canvas Container */}
        <div 
          ref={videoContainerRef}
          className="camera-viewport"
          style={{
            position: 'relative',
            width: '100%',
            height: 'min(520px, 65vh)',
            minHeight: '300px',
            backgroundColor: '#05070a',
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: isDeviceCamActive ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
            boxShadow: isDeviceCamActive ? '0 0 20px rgba(2, 132, 199, 0.25)' : '0 4px 12px rgba(0, 0, 0, 0.15)'
          }}
        >
          {/* Always-mounted Client Device Camera Video element (Eliminates React unmounted ref bug) */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={(e) => {
              e.target.play().catch(err => console.debug('Video onLoadedMetadata play err:', err));
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: isDeviceCamActive ? 'block' : 'none',
              transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
              backgroundColor: '#000'
            }}
          />

          {/* AI HUD Overlay Canvas */}
          <canvas
            ref={overlayCanvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              display: isDeviceCamActive ? 'block' : 'none'
            }}
          />

          {/* Top Banner on Device Camera */}
          {isDeviceCamActive && (
            <div style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              zIndex: 10
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(2, 132, 199, 0.85)',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 600,
                backdropFilter: 'blur(4px)',
                letterSpacing: '0.04em'
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
                LIVE HARDWARE WEBCAM ({facingMode.toUpperCase()})
              </div>

              {aiServerStatus === 'CONNECTING' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(245, 158, 11, 0.90)',
                  color: '#fff',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  backdropFilter: 'blur(4px)'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />
                  AI CONNECTING...
                </div>
              )}
              {aiServerStatus === 'ACTIVE' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(16, 185, 129, 0.85)',
                  color: '#fff',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  backdropFilter: 'blur(4px)'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />
                  AI ACTIVE
                </div>
              )}
              {/* Inference timing badge when active */}
              {aiServerStatus === 'ACTIVE' && lastInferenceMs > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  color: '#94a3b8',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  backdropFilter: 'blur(4px)',
                  fontFamily: 'monospace'
                }}>
                  ⚡ {lastInferenceMs}ms
                </div>
              )}
            </div>
          )}

          {/* Security Alert Toast Notification */}
          {alertToast && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 50,
              maxWidth: '260px',
              background: 'rgba(239, 68, 68, 0.95)',
              color: '#fff',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.5)',
              backdropFilter: 'blur(8px)',
              animation: 'fadeIn 0.3s ease'
            }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🚨</span>
              <div>
                <div style={{ fontSize: '0.68rem', opacity: 0.85, marginBottom: '2px' }}>
                  SECURITY ALERT [{alertToast.severity}]
                </div>
                <div>{alertToast.message}</div>
              </div>
            </div>
          )}

          {/* Server-side MJPEG Stream when Device Camera is NOT active */}
          {!isDeviceCamActive && isPlaying && activeCamera ? (
            <img
              src={feedUrl}
              alt="Live Surveillance Stream"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block'
              }}
              onError={() => setStreamError(true)}
              onLoad={() => setStreamError(false)}
            />
          ) : !isDeviceCamActive ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <Radio size={44} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p style={{ fontWeight: 600, color: '#fff' }}>Stream Paused</p>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Click 'Use My Device Camera' or 'Start Feed' to begin</p>
            </div>
          ) : null}

          {/* Stream Overlay HUD Telemetry */}
          <div style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            right: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pointerEvents: 'none',
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(8px)',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            color: '#fff',
            zIndex: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span className="mono" style={{ color: '#38bdf8' }}>
                FPS: {isDeviceCamActive ? clientFps : (telemetry?.fps || 0)}
              </span>
              <span className="mono" style={{ color: '#cbd5e1' }}>
                INFER: {isDeviceCamActive ? lastInferenceMs : (telemetry?.inference_ms || 0)} ms
              </span>
              <span className="mono" style={{ color: '#f8fafc' }}>
                TRACKS: {isDeviceCamActive ? latestDetections.length : (telemetry?.active_tracks?.length || 0)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
              <span className="mono" style={{ color: '#34d399', fontSize: '0.7rem' }}>
                {isDeviceCamActive ? 'CLIENT DEVICE HARDWARE' : 'AI ORCHESTRATOR ONLINE'}
              </span>
            </div>
          </div>
        </div>

        {/* Video Quality & Source URL Footnote */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span>Source: <code className="mono" style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>
            {isDeviceCamActive ? `Browser Hardware (${facingMode})` : activeCamera?.source_url}
          </code></span>
          {!isDeviceCamActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="stream-quality-select" style={{ fontSize: '0.75rem' }}>Quality:</label>
              <select
                id="stream-quality-select"
                aria-label="Stream Video Quality"
                value={quality}
                onChange={(e) => {
                  setQuality(Number(e.target.value));
                  setStreamKey(Date.now());
                }}
                className="form-input"
                style={{ width: '75px', padding: '2px 6px', fontSize: '0.75rem' }}
              >
                <option value="60">60%</option>
                <option value="80">80%</option>
                <option value="95">95%</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Real-time Tracks & Entities HUD */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        
        {/* Active Entities Card */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '330px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={16} color="var(--accent-cyan)" />
              Detected Entities ({isDeviceCamActive ? latestDetections.length : (telemetry?.active_tracks?.length || 0)})
            </h3>
            <span className="badge badge-info" style={{ fontSize: '0.625rem' }}>
              {isDeviceCamActive ? 'DEVICE' : 'LIVE'}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {isDeviceCamActive ? (
              latestDetections.length > 0 ? (
                latestDetections.map((det, idx) => (
                  <div 
                    key={det.track_id || idx} 
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {det.is_authorized ? (
                        <UserCheck size={18} color="var(--accent-emerald)" />
                      ) : det.class_name === 'person' ? (
                        <UserX size={18} color="var(--accent-amber)" />
                      ) : (
                        <Radio size={18} color="var(--accent-cyan)" />
                      )}
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          {det.class_name.toUpperCase()} #{det.track_id || idx + 1}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: det.identity && det.identity !== 'Unknown' ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                          {det.identity && det.identity !== 'Unknown' ? det.identity : 'Unidentified Object'}
                        </div>
                      </div>
                    </div>
                    <span className="badge badge-live" style={{ fontSize: '0.65rem' }}>
                      {Math.round((det.confidence || 0) * 100)}%
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: '0.8rem' }}>
                  {aiServerStatus === 'CONNECTING' ? (
                    <div>
                      <div style={{ color: 'var(--accent-amber)', fontWeight: 600, marginBottom: '6px' }}>
                        ⏳ Connecting to Cloud AI Engine...
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        Free-tier cloud backend is spinning up. Please keep camera open for ~20-30 seconds.
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)' }}>
                      Scanning camera frame... Bring a person, phone, or object into view.
                    </div>
                  )}
                </div>
              )
            ) : telemetry?.active_tracks?.length > 0 ? (
              telemetry.active_tracks.map((track) => (
                <div 
                  key={track.track_id} 
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {track.is_known ? (
                      <UserCheck size={18} color="var(--accent-emerald)" />
                    ) : track.class_name === 'person' ? (
                      <UserX size={18} color="var(--accent-amber)" />
                    ) : (
                      <Radio size={18} color="var(--accent-cyan)" />
                    )}
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {track.class_name.toUpperCase()} #{track.track_id}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: track.is_known ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                        {track.identity || 'Unidentified Person'}
                      </div>
                    </div>
                  </div>
                  <span className="badge badge-live" style={{ fontSize: '0.65rem' }}>
                    {Math.round((track.confidence || 0) * 100)}%
                  </span>
                </div>
              ))
            ) : (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                No active entities detected
              </div>
            )}
          </div>
        </div>

        {/* Security Summary & Device Tips Card */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '0.875rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldAlert size={16} color="var(--accent-amber)" />
            Universal Camera Support
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <CheckCircle2 size={15} color="var(--accent-emerald)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span><strong>Laptop & PC:</strong> Click <em>Use My Device Camera</em> to activate built-in webcam or external USB camera.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <Smartphone size={15} color="var(--accent-cyan)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span><strong>Android & iPhone:</strong> Open website on mobile browser and click <em>Use My Device Camera</em>, then use <em>Flip</em> for rear camera.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <Radio size={15} color="var(--accent-amber)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span><strong>CCTV / IP Webcams:</strong> Click <em>Add / Manage</em> to connect DroidCam or RTSP CCTV streams.</span>
            </div>
          </div>
        </div>

      </div>

      {/* Modal: Camera Source Setup */}
      {isCameraModalOpen && (
        <CameraManagerModal
          isOpen={isCameraModalOpen}
          onClose={() => setIsCameraModalOpen(false)}
          cameras={cameras}
          onCamerasUpdated={onCamerasUpdated}
          onSelectCamera={onSelectCamera}
          activeCameraId={activeCamera?.id}
        />
      )}
    </div>
  );
}
