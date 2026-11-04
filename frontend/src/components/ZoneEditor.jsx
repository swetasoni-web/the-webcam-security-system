import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, 
  Plus, 
  Trash2, 
  Save, 
  RotateCcw, 
  Check, 
  AlertTriangle 
} from 'lucide-react';
import { api } from '../api/client';

export default function ZoneEditor({ cameras, selectedCameraId, user }) {
  const [zones, setZones] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState([]); // Array of [x, y] in 0..1 normalized space
  const [zoneName, setZoneName] = useState('');
  const [zoneSeverity, setZoneSeverity] = useState('HIGH');
  const [zoneColor, setZoneColor] = useState('#EF4444');
  const [loading, setLoading] = useState(false);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const activeCamera = cameras.find(c => c.id === Number(selectedCameraId)) || cameras[0];

  const fetchZones = async () => {
    if (!activeCamera) return;
    try {
      const data = await api.getZones(activeCamera.id);
      setZones(data);
    } catch (err) {
      console.error('Failed to fetch zones:', err);
    }
  };

  useEffect(() => {
    fetchZones();
    setPoints([]);
    setIsDrawing(false);
  }, [activeCamera?.id]);

  // Handle canvas click to place polygon point
  const handleCanvasClick = (e) => {
    if (!isDrawing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setPoints(prev => [...prev, [round4(x), round4(y)]]);
  };

  const round4 = (num) => Math.round(num * 10000) / 10000;

  const handleSaveZone = async () => {
    if (!zoneName.trim()) {
      alert('Please specify a name for this restricted zone.');
      return;
    }
    if (points.length < 3) {
      alert('A restricted polygon requires at least 3 points. Click on the camera view to place points.');
      return;
    }

    try {
      setLoading(true);
      await api.createZone({
        camera_id: activeCamera.id,
        name: zoneName.trim(),
        zone_type: 'POLYGON',
        coordinates: points,
        color_hex: zoneColor,
        severity: zoneSeverity,
        is_active: true
      });
      setPoints([]);
      setZoneName('');
      setIsDrawing(false);
      fetchZones();
    } catch (err) {
      alert(`Error saving zone: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteZone = async (zoneId) => {
    if (!window.confirm('Are you sure you want to delete this restricted zone?')) return;
    try {
      await api.deleteZone(zoneId);
      fetchZones();
    } catch (err) {
      alert(`Error deleting zone: ${err.message}`);
    }
  };

  const feedUrl = activeCamera ? api.getVideoFeedUrl(activeCamera.id, 75) : '';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '16px', margin: '0 16px 20px' }}>
      {/* Visual Canvas Area */}
      <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={18} color="var(--accent-rose)" />
              Interactive Zone Perimeter Configuration
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Camera: {activeCamera?.name || 'None selected'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {!isDrawing ? (
              <button 
                onClick={() => { setIsDrawing(true); setPoints([]); }} 
                className="btn btn-primary"
                style={{ padding: '6px 14px' }}
              >
                <Plus size={14} />
                <span>Draw New Zone</span>
              </button>
            ) : (
              <>
                <button 
                  onClick={() => setPoints([])} 
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px' }}
                >
                  <RotateCcw size={14} />
                  <span>Reset Points</span>
                </button>
                <button 
                  onClick={() => setIsDrawing(false)} 
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px' }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Video Canvas with SVG Polygon Overlay */}
        <div 
          ref={containerRef}
          onClick={handleCanvasClick}
          style={{
            position: 'relative',
            width: '100%',
            height: '480px',
            backgroundColor: '#05070a',
            borderRadius: '10px',
            overflow: 'hidden',
            cursor: isDrawing ? 'crosshair' : 'default',
            border: isDrawing ? '2px dashed var(--accent-rose)' : '1px solid var(--border-subtle)'
          }}
        >
          {activeCamera && (
            <img 
              src={feedUrl} 
              alt="Camera Feed" 
              style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} 
            />
          )}

          {/* SVG Overlay to render existing and active drawn polygons */}
          <svg 
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              width: '100%', 
              height: '100%', 
              pointerEvents: 'none' 
            }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* Existing Saved Zones */}
            {zones.map(z => {
              const pts = z.coordinates?.map(p => `${p[0] * 100},${p[1] * 100}`).join(' ');
              return (
                <polygon
                  key={z.id}
                  points={pts}
                  fill={z.color_hex || '#EF4444'}
                  fillOpacity="0.25"
                  stroke={z.color_hex || '#EF4444'}
                  strokeWidth="0.8"
                />
              );
            })}

            {/* Currently Drawing Polygon */}
            {points.length > 0 && (
              <>
                <polygon
                  points={points.map(p => `${p[0] * 100},${p[1] * 100}`).join(' ')}
                  fill={zoneColor}
                  fillOpacity="0.3"
                  stroke={zoneColor}
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                {points.map((p, idx) => (
                  <circle
                    key={idx}
                    cx={p[0] * 100}
                    cy={p[1] * 100}
                    r="1.2"
                    fill="#fff"
                    stroke={zoneColor}
                    strokeWidth="0.5"
                  />
                ))}
              </>
            )}
          </svg>

          {isDrawing && (
            <div style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              background: 'rgba(0, 0, 0, 0.8)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(0, 240, 255, 0.3)'
            }}>
              Click to place polygon vertices ({points.length} placed, min 3 required)
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Zone Attributes & Configured Zones List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Draw / Edit Form */}
        {isDrawing && (
          <div className="glass-panel" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: '12px' }}>New Zone Properties</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="form-label">Zone Name</label>
                <input
                  type="text"
                  placeholder="e.g. Restricted Vault, Server Room"
                  className="form-input"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Severity Level</label>
                <select
                  className="form-input"
                  value={zoneSeverity}
                  onChange={(e) => setZoneSeverity(e.target.value)}
                >
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="WARNING">Warning</option>
                  <option value="INFO">Info</option>
                </select>
              </div>

              <div>
                <label className="form-label">Perimeter Color</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['#EF4444', '#F59E0B', '#8B5CF6', '#3B82F6', '#10B981'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setZoneColor(color)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        background: color,
                        border: zoneColor === color ? '2px solid #fff' : 'none',
                        cursor: 'pointer'
                      }}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={handleSaveZone}
                disabled={loading || points.length < 3 || !zoneName.trim()}
                className="btn btn-primary"
                style={{ marginTop: '8px' }}
              >
                <Save size={14} />
                <span>Save Restricted Zone</span>
              </button>
            </div>
          </div>
        )}

        {/* Existing Zones List */}
        <div className="glass-panel" style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '12px' }}>
            Active Zones ({zones.length})
          </h3>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {zones.length > 0 ? (
              zones.map(z => (
                <div
                  key={z.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: z.color_hex }} />
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{z.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {z.coordinates?.length || 0} Points | {z.severity}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteZone(z.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                    title="Delete Zone"
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-rose)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                No restricted zones configured on this camera. Click 'Draw New Zone' to define one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
