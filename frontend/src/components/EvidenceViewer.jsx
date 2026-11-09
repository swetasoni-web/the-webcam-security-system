import React, { useState, useEffect } from 'react';
import { 
  Eye, 
  Download, 
  ExternalLink, 
  Clock, 
  Camera, 
  ShieldAlert,
  Search,
  CheckCircle2
} from 'lucide-react';
import { api } from '../api/client';

export default function EvidenceViewer({ cameras }) {
  const [alertsWithEvidence, setAlertsWithEvidence] = useState([]);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cameraFilter, setCameraFilter] = useState('');

  const fetchEvidence = async () => {
    try {
      setLoading(true);
      const params = { limit: 100 };
      if (cameraFilter) params.cameraId = cameraFilter;
      const data = await api.getAlerts(params);
      // Filter for items with evidence_image_path
      const filtered = data.filter(a => !!a.evidence_image_path);
      setAlertsWithEvidence(filtered);
    } catch (err) {
      console.error('Failed to fetch evidence:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvidence();
  }, [cameraFilter]);

  return (
    <div className="glass-panel" style={{ margin: '0 16px 20px', padding: '20px' }}>
      {/* Header & Filter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Eye size={22} color="var(--accent-cyan)" />
            Forensic Evidence Snapshot Repository
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Timestamped visual evidence captures with security incident bounding box annotations
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select 
            id="evidence-camera-filter"
            aria-label="Filter evidence by camera"
            value={cameraFilter} 
            onChange={(e) => setCameraFilter(e.target.value)}
            className="form-input" 
            style={{ width: '180px', padding: '6px 10px', fontSize: '0.8rem' }}
          >
            <option value="">All Cameras</option>
            {cameras.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button onClick={fetchEvidence} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
            Refresh Gallery
          </button>
        </div>
      </div>

      {/* Grid of Evidence Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {alertsWithEvidence.length > 0 ? (
          alertsWithEvidence.map(item => (
            <div 
              key={item.id}
              onClick={() => setSelectedAlert(item)}
              className="glass-panel"
              style={{
                padding: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-cyan)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-glass)'}
            >
              <div style={{
                width: '100%',
                height: '160px',
                backgroundColor: '#05070a',
                borderRadius: '8px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <img
                  src={api.getEvidenceImageUrl(item.evidence_image_path)}
                  alt="Incident Evidence"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <span className={`badge ${
                  item.severity === 'CRITICAL' ? 'badge-critical' : item.severity === 'HIGH' ? 'badge-high' : 'badge-warning'
                }`} style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.65rem' }}>
                  {item.severity}
                </span>
              </div>

              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>
                  {item.event_type}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {item.message}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> {new Date(item.created_at).toLocaleTimeString()}
                  </span>
                  <span>Target #{item.track_id}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            {loading ? 'Loading forensic repository...' : 'No evidence snapshots recorded yet. Evidence is captured when security rules trigger.'}
          </div>
        )}
      </div>

      {/* Forensic Zoom Modal */}
      {selectedAlert && (
        <div 
          onClick={() => setSelectedAlert(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="glass-panel" 
            style={{ maxWidth: '850px', width: '100%', overflow: 'hidden' }}
          >
            <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <h3 style={{ fontSize: '1rem' }}>Incident Evidence: #{selectedAlert.id} - {selectedAlert.event_type}</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(selectedAlert.created_at).toLocaleString()}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href={api.getEvidenceImageUrl(selectedAlert.evidence_image_path)}
                  download={`evidence_${selectedAlert.id}.jpg`}
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  <Download size={14} /> Download Image
                </a>
                <button 
                  onClick={() => setSelectedAlert(null)} 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ padding: '16px', background: '#05070a', textAlign: 'center' }}>
              <img 
                src={api.getEvidenceImageUrl(selectedAlert.evidence_image_path)} 
                alt="Forensic Snapshot" 
                style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: '6px' }} 
              />
            </div>

            <div style={{ padding: '14px 18px', background: 'rgba(15, 21, 35, 0.9)', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '0.8rem' }}>
              <div>
                <span className="form-label">Offending Entity</span>
                <span style={{ fontWeight: 600 }}>{selectedAlert.entity_class?.toUpperCase()} ({selectedAlert.identity_name})</span>
              </div>
              <div>
                <span className="form-label">Severity Level</span>
                <span className={`badge ${selectedAlert.severity === 'CRITICAL' ? 'badge-critical' : 'badge-warning'}`}>
                  {selectedAlert.severity}
                </span>
              </div>
              <div>
                <span className="form-label">Review Status</span>
                <span>{selectedAlert.is_acknowledged ? 'Reviewed & Logged' : 'Pending Review'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
