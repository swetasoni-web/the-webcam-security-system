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
  Plus
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
  const videoContainerRef = useRef(null);

  const activeCamera = cameras.find(c => c.id === Number(selectedCameraId)) || cameras[0];

  // Poll real-time telemetry every 1000ms
  useEffect(() => {
    if (!activeCamera) return;

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
    const interval = setInterval(fetchTelemetry, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeCamera?.id]);

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
  const currentMode = telemetry?.mode || activeCamera?.source_type || 'DEMO';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', padding: '0 16px 20px' }}>
      {/* Left Column: Video Viewport & Controls */}
      <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        
        {/* Top Camera Switcher & Action Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          
          {/* Camera Selection & Quick Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
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
              >
                <Plus size={15} />
                <span>Add / Manage</span>
              </button>
            </div>

            {/* Mode Badge */}
            <span className={`badge ${
              currentMode === 'WEBCAM' || currentMode === 'LIVE' ? 'badge-live' : 
              currentMode === 'DEMO' ? 'badge-demo' : 'badge-recorded'
            }`}>
              <span className={currentMode === 'WEBCAM' || currentMode === 'LIVE' ? 'live-indicator-dot' : 'demo-indicator-dot'} />
              {currentMode}
            </span>
          </div>

          {/* Player Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              onClick={toggleStream} 
              className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
              style={{ padding: '7px 14px' }}
            >
              {isPlaying ? <Square size={14} /> : <Play size={14} />}
              <span>{isPlaying ? 'Stop' : 'Start Stream'}</span>
            </button>

            <button 
              onClick={handleTakeSnapshot} 
              className="btn btn-secondary" 
              style={{ padding: '7px 12px' }}
              title="Capture Instant Frame Snapshot"
            >
              <Camera size={14} />
              <span>Snapshot</span>
            </button>

            <button 
              onClick={() => setStreamKey(Date.now())} 
              className="btn btn-secondary" 
              style={{ padding: '7px 10px' }}
              title="Refresh Stream Connection"
            >
              <RefreshCw size={14} />
            </button>

            <button 
              onClick={toggleFullscreen} 
              className="btn btn-secondary" 
              style={{ padding: '7px 10px' }}
              title="Toggle Fullscreen"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

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
                  background: cam.status === 'ONLINE' ? 'var(--accent-emerald)' : 'var(--text-muted)'
                }} />
                {cam.name}
              </button>
            );
          })}
        </div>

        {/* Video Canvas Container */}
        <div 
          ref={videoContainerRef}
          style={{
            position: 'relative',
            width: '100%',
            height: '500px',
            backgroundColor: '#05070a',
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
          }}
        >
          {isPlaying && activeCamera ? (
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
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <Radio size={44} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p style={{ fontWeight: 600, color: '#fff' }}>Stream Paused</p>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Click 'Start Stream' to resume AI video feed</p>
            </div>
          )}

          {/* Stream Overlay HUD Telemetry */}
          {isPlaying && (
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
              color: '#fff'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span className="mono" style={{ color: '#38bdf8' }}>
                  FPS: {telemetry?.fps || 0}
                </span>
                <span className="mono" style={{ color: '#cbd5e1' }}>
                  INFER: {telemetry?.inference_ms || 0} ms
                </span>
                <span className="mono" style={{ color: '#f8fafc' }}>
                  TRACKS: {telemetry?.active_tracks?.length || 0}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                <span className="mono" style={{ color: '#34d399', fontSize: '0.7rem' }}>
                  YOLOv8 + FACE DETECTION
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Video Quality & Source URL Footnote */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span>Source: <code className="mono" style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>{activeCamera?.source_url}</code></span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Quality:</span>
            <select
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
        </div>
      </div>

      {/* Right Column: Real-time Tracks & Entities HUD */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        
        {/* Active Entities Card */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '330px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={16} color="var(--accent-cyan)" />
              Detected Entities ({telemetry?.active_tracks?.length || 0})
            </h3>
            <span className="badge badge-info" style={{ fontSize: '0.625rem' }}>LIVE</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {telemetry?.active_tracks?.length > 0 ? (
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
                        {track.identity_name || 'Unidentified'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Clock size={11} /> {track.dwell_time}s
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                No active targets in view
              </div>
            )}
          </div>
        </div>

        {/* Active Zone Status Card */}
        <div className="glass-panel" style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldAlert size={16} color="var(--accent-rose)" />
              Zone Intrusion Status
            </h3>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {telemetry?.zone_events?.length > 0 ? (
              telemetry.zone_events.map((ze, idx) => (
                <div 
                  key={idx}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-rose)' }}>
                      {ze.zone_name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      Target #{ze.track_id} ({ze.identity_name})
                    </div>
                  </div>
                  <span className="badge badge-critical" style={{ fontSize: '0.625rem' }}>
                    {ze.dwell_seconds}s
                  </span>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                All zones secure
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Camera Management & Setup Modal */}
      <CameraManagerModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        cameras={cameras}
        activeCameraId={activeCamera?.id}
        onSelectCamera={onSelectCamera}
        onCamerasUpdated={onCamerasUpdated || (() => {})}
      />
    </div>
  );
}
