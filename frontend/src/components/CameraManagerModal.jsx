import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Video, 
  Smartphone, 
  Globe, 
  FileVideo, 
  CheckCircle2, 
  AlertCircle, 
  X,
  Play
} from 'lucide-react';
import { api } from '../api/client';

export default function CameraManagerModal({ isOpen, onClose, cameras, onCamerasUpdated, onSelectCamera, activeCameraId }) {
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'add' | 'scan'
  const [detectedDevices, setDetectedDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // New Camera Form State
  const [newCamName, setNewCamName] = useState('');
  const [newCamType, setNewCamType] = useState('WEBCAM'); // 'WEBCAM' | 'RTSP' | 'RECORDED' | 'DEMO'
  const [newCamUrl, setNewCamUrl] = useState('0');
  const [phonePreset, setPhonePreset] = useState('droidcam'); // 'droidcam' | 'ipwebcam'
  const [phoneIp, setPhoneIp] = useState('192.168.1.5');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      handleScanDevices();
    }
  }, [isOpen]);

  const handleScanDevices = async () => {
    try {
      setScanning(true);
      setError(null);
      const res = await api.getAvailableDevices();
      setDetectedDevices(res.devices || []);
    } catch (err) {
      console.error('Scan devices error:', err);
      setError('Could not scan for hardware devices: ' + err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleAddDetectedWebcam = async (device) => {
    try {
      setLoading(true);
      await api.createCamera({
        name: `${device.name}`,
        source_type: 'WEBCAM',
        source_url: String(device.index),
        resolution_width: device.width || 640,
        resolution_height: device.height || 480,
        fps: 24,
        is_active: true
      });
      await onCamerasUpdated();
      setActiveTab('list');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPhonePreset = (preset, ip) => {
    setNewCamType('RTSP');
    if (preset === 'droidcam') {
      setNewCamName('Phone Camera (DroidCam)');
      setNewCamUrl(`http://${ip}:4747/video`);
    } else if (preset === 'ipwebcam') {
      setNewCamName('Phone Camera (IP Webcam)');
      setNewCamUrl(`http://${ip}:8080/video`);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await api.testCameraSource(newCamType, newCamUrl);
      setTestResult(res);
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleCreateCamera = async (e) => {
    e.preventDefault();
    if (!newCamName.trim() || !newCamUrl.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const newCam = await api.createCamera({
        name: newCamName.trim(),
        source_type: newCamType,
        source_url: newCamUrl.trim(),
        resolution_width: 640,
        resolution_height: 480,
        fps: 24,
        is_active: true
      });
      await onCamerasUpdated();
      onSelectCamera(newCam.id);
      setActiveTab('list');
      setNewCamName('');
      setTestResult(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCamera = async (camId) => {
    if (!window.confirm('Are you sure you want to delete this camera source?')) return;
    try {
      await api.deleteCamera(camId);
      await onCamerasUpdated();
    } catch (err) {
      alert('Failed to delete camera: ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '16px'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Camera size={20} color="var(--accent-cyan)" />
            <div>
              <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Camera Sources & Setup</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                Configure USB webcams, phone cameras, RTSP streams, or demo video
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '6px', borderRadius: '50%' }}
            aria-label="Close Camera Manager"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Controls */}
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '10px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)'
        }}>
          <button
            onClick={() => setActiveTab('list')}
            className={`btn ${activeTab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: '0.8rem' }}
          >
            Connected Cameras ({cameras.length})
          </button>
          <button
            onClick={() => { setActiveTab('scan'); handleScanDevices(); }}
            className={`btn ${activeTab === 'scan' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: '0.8rem' }}
          >
            <RefreshCw size={14} className={scanning ? 'spin' : ''} />
            Scan Webcams
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`btn ${activeTab === 'add' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: '0.8rem' }}
          >
            <Plus size={14} />
            Add Custom Source
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#dc2626',
              fontSize: '0.825rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px'
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: LIST CONNECTED CAMERAS */}
          {activeTab === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {cameras.map((c) => {
                const isSelected = c.id === activeCameraId;
                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                      background: isSelected ? 'var(--bg-secondary)' : 'var(--bg-card)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: 'var(--bg-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-cyan)'
                      }}>
                        {c.source_type === 'WEBCAM' ? <Camera size={18} /> :
                         c.source_type === 'RTSP' ? <Globe size={18} /> :
                         c.source_type === 'RECORDED' ? <FileVideo size={18} /> : <Video size={18} />}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.name}</span>
                          <span className={`badge ${
                            c.source_type === 'WEBCAM' ? 'badge-live' : 
                            c.source_type === 'DEMO' ? 'badge-demo' : 'badge-recorded'
                          }`}>
                            {c.source_type}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                          URL/Index: <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>{c.source_url}</code>
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => { onSelectCamera(c.id); onClose(); }}
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      >
                        {isSelected ? 'Active Now' : 'Select'}
                      </button>
                      <button
                        onClick={() => handleDeleteCamera(c.id)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', color: '#dc2626' }}
                        title="Delete camera"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: HARDWARE WEBCAM SCAN */}
          {activeTab === 'scan' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Scanning hardware video devices connected to your system...
                </p>
                <button 
                  onClick={handleScanDevices}
                  disabled={scanning}
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.775rem' }}
                >
                  <RefreshCw size={12} className={scanning ? 'spin' : ''} />
                  <span>Refresh Scan</span>
                </button>
              </div>

              {scanning ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                  <RefreshCw size={24} className="spin" color="var(--accent-cyan)" />
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    Probing camera indices...
                  </p>
                </div>
              ) : detectedDevices.length === 0 ? (
                <div style={{
                  padding: '24px',
                  borderRadius: '8px',
                  background: 'var(--bg-secondary)',
                  textAlign: 'center'
                }}>
                  <Camera size={32} color="var(--text-muted)" style={{ margin: '0 auto 8px' }} />
                  <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>No physical webcams detected</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Make sure your USB webcam or laptop camera is connected and not blocked by system permissions.
                    You can still use Phone Cameras (DroidCam / IP Webcam) or Demo Mode!
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {detectedDevices.map((dev) => (
                    <div
                      key={dev.index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-card)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <CheckCircle2 size={20} color="var(--accent-emerald)" />
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{dev.name} (Index {dev.index})</span>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                            Backend: {dev.backend} | Resolution: {dev.width}x{dev.height} @ {dev.fps} FPS
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddDetectedWebcam(dev)}
                        disabled={loading}
                        className="btn btn-primary"
                        style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                      >
                        <Plus size={14} />
                        <span>Add as Camera</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ADD CUSTOM CAMERA / PHONE / RTSP */}
          {activeTab === 'add' && (
            <form onSubmit={handleCreateCamera} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Type Selection */}
              <div>
                <label className="form-label">Camera Source Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {[
                    { id: 'WEBCAM', label: 'USB/Webcam', icon: Camera },
                    { id: 'RTSP', label: 'Phone / RTSP', icon: Globe },
                    { id: 'RECORDED', label: 'Video File', icon: FileVideo },
                    { id: 'DEMO', label: 'Demo Sim', icon: Video },
                  ].map(t => {
                    const Icon = t.icon;
                    const isSelected = newCamType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setNewCamType(t.id);
                          if (t.id === 'WEBCAM' && !newCamUrl) setNewCamUrl('0');
                          if (t.id === 'DEMO') setNewCamUrl('demo://corridor');
                        }}
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '8px', fontSize: '0.78rem', flexDirection: 'column', gap: '4px' }}
                      >
                        <Icon size={16} />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mobile Phone Quick Helper */}
              {newCamType === 'RTSP' && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Smartphone size={16} color="var(--accent-cyan)" />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Use Smartphone as WiFi Security Camera:</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    Install <b>DroidCam</b> or <b>IP Webcam</b> (free on Android/iOS). Enter your phone's WiFi IP address:
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                      id="phone-ip-input"
                      name="phoneIp"
                      aria-label="Phone IP Address"
                      type="text"
                      className="form-input"
                      style={{ width: '150px', padding: '6px 10px', fontSize: '0.8rem' }}
                      placeholder="Phone IP (e.g. 192.168.1.5)"
                      value={phoneIp}
                      onChange={(e) => setPhoneIp(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => handleApplyPhonePreset('droidcam', phoneIp)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                    >
                      Use DroidCam URL
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPhonePreset('ipwebcam', phoneIp)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                    >
                      Use IP Webcam URL
                    </button>
                  </div>
                </div>
              )}

              {/* Camera Name */}
              <div>
                <label htmlFor="new-camera-name" className="form-label">Camera Name</label>
                <input
                  id="new-camera-name"
                  name="newCameraName"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Front Gate Camera, Hallway Cam, Phone 1"
                  value={newCamName}
                  onChange={(e) => setNewCamName(e.target.value)}
                  required
                />
              </div>

              {/* Source URL / Index */}
              <div>
                <label htmlFor="new-camera-url" className="form-label">
                  {newCamType === 'WEBCAM' ? 'Webcam Device Index (0 for built-in, 1 or 2 for USB)' :
                   newCamType === 'RTSP' ? 'Stream URL (rtsp:// or http://)' :
                   newCamType === 'RECORDED' ? 'Local Video File Path (.mp4, .avi)' : 'Simulation URL'}
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    id="new-camera-url"
                    name="newCameraUrl"
                    type="text"
                    className="form-input"
                    placeholder={
                      newCamType === 'WEBCAM' ? '0' :
                      newCamType === 'RTSP' ? 'http://192.168.1.5:8080/video or rtsp://admin:12345@192.168.1.100:554/stream1' :
                      newCamType === 'RECORDED' ? 'C:/path/to/security_video.mp4' : 'demo://corridor'
                    }
                    value={newCamUrl}
                    onChange={(e) => setNewCamUrl(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing || !newCamUrl}
                    className="btn btn-secondary"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {testing ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                    <span>Test Feed</span>
                  </button>
                </div>
              </div>

              {/* Test Result Message */}
              {testResult && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: testResult.success ? '#059669' : '#dc2626',
                  border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                }}>
                  {testResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{testResult.message}</span>
                </div>
              )}

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !newCamName.trim()}
                  className="btn btn-primary"
                >
                  <Plus size={16} />
                  <span>Save & Connect Camera</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

