import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  CheckCircle, 
  AlertTriangle, 
  Trash2, 
  Filter, 
  ExternalLink, 
  Image as ImageIcon,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { api } from '../api/client';

export default function AlertFeed({ user, onAlertsUpdated }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('');
  const [ackFilter, setAckFilter] = useState('');
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [ackNotes, setAckNotes] = useState('');
  const [acknowledgingId, setAcknowledgingId] = useState(null);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const params = {};
      if (severityFilter) params.severity = severityFilter;
      if (ackFilter !== '') params.isAcknowledged = ackFilter === 'true';
      const data = await api.getAlerts(params);
      setAlerts(data);
      if (onAlertsUpdated) onAlertsUpdated(data);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 3000);
    return () => clearInterval(interval);
  }, [severityFilter, ackFilter]);

  const handleAcknowledge = async (alertId) => {
    try {
      await api.acknowledgeAlert(alertId, ackNotes);
      setAcknowledgingId(null);
      setAckNotes('');
      fetchAlerts();
    } catch (err) {
      alert(`Error acknowledging alert: ${err.message}`);
    }
  };

  const handleDelete = async (alertId) => {
    if (!window.confirm('Are you sure you want to delete this alert record?')) return;
    try {
      await api.deleteAlert(alertId);
      fetchAlerts();
    } catch (err) {
      alert(`Error deleting alert: ${err.message}`);
    }
  };

  const getSeverityBadgeClass = (sev) => {
    switch (sev) {
      case 'CRITICAL': return 'badge-critical';
      case 'HIGH': return 'badge-high';
      case 'WARNING': return 'badge-warning';
      default: return 'badge-info';
    }
  };

  return (
    <div className="glass-panel" style={{ margin: '0 16px 20px', padding: '20px' }}>
      {/* Title & Filter Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bell size={20} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: '1.15rem' }}>Security Alerts & Incident Log</h2>
          <span className="badge badge-info">{alerts.length} Records</span>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select 
            id="alert-severity-filter"
            aria-label="Filter alerts by severity"
            value={severityFilter} 
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="form-input" 
            style={{ width: '130px', padding: '6px 10px', fontSize: '0.8rem' }}
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
          </select>

          <select 
            id="alert-ack-filter"
            aria-label="Filter alerts by status"
            value={ackFilter} 
            onChange={(e) => setAckFilter(e.target.value)}
            className="form-input" 
            style={{ width: '150px', padding: '6px 10px', fontSize: '0.8rem' }}
          >
            <option value="">All Statuses</option>
            <option value="false">Unacknowledged</option>
            <option value="true">Acknowledged</option>
          </select>

          <button onClick={fetchAlerts} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Alert Feed Table / List */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '10px 12px' }}>Severity</th>
              <th style={{ padding: '10px 12px' }}>Event & Message</th>
              <th style={{ padding: '10px 12px' }}>Target Entity</th>
              <th style={{ padding: '10px 12px' }}>Timestamp</th>
              <th style={{ padding: '10px 12px' }}>Evidence</th>
              <th style={{ padding: '10px 12px' }}>Status</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length > 0 ? (
              alerts.map((a) => (
                <tr 
                  key={a.id} 
                  style={{ 
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    backgroundColor: !a.is_acknowledged && a.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.05)' : 'transparent'
                  }}
                >
                  <td style={{ padding: '12px' }}>
                    <span className={`badge ${getSeverityBadgeClass(a.severity)}`}>
                      {a.severity}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 600, color: '#fff' }}>{a.event_type}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{a.message}</div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 500 }}>{a.entity_class?.toUpperCase() || 'UNKNOWN'} #{a.track_id}</div>
                    <div style={{ fontSize: '0.75rem', color: a.identity_name === 'Unknown' ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
                      {a.identity_name || 'Unidentified'}
                    </div>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                    <div className="mono" style={{ fontSize: '0.75rem' }}>
                      {new Date(a.created_at).toLocaleTimeString()}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {new Date(a.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {a.evidence_image_path ? (
                      <button
                        onClick={() => setSelectedEvidence(api.getEvidenceImageUrl(a.evidence_image_path))}
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        title="View captured evidence snapshot"
                      >
                        <ImageIcon size={14} color="var(--accent-cyan)" />
                        <span>View</span>
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>None</span>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {a.is_acknowledged ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-emerald)', fontSize: '0.78rem' }}>
                        <ShieldCheck size={14} /> Reviewed
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-rose)', fontSize: '0.78rem' }}>
                        <AlertTriangle size={14} /> Pending Triage
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                      {!a.is_acknowledged && (
                        <button
                          onClick={() => setAcknowledgingId(a.id)}
                          className="btn btn-primary"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                          <CheckCircle size={14} />
                          <span>Acknowledge</span>
                        </button>
                      )}
                      {user?.role === 'ADMIN' && (
                        <button
                          onClick={() => handleDelete(a.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                          title="Delete Alert Record"
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-rose)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  {loading ? 'Loading security incidents...' : 'No incident alerts matching criteria.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Acknowledge Notes Modal */}
      {acknowledgingId && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ width: '400px', padding: '24px' }}>
            <h3 style={{ marginBottom: '12px' }}>Acknowledge Incident Alert</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Confirm review of Alert #{acknowledgingId}. You can record optional investigation notes.
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label className="form-label">Operator Notes</label>
              <textarea
                className="form-input"
                rows="3"
                placeholder="e.g. Verified authorized personnel badge; false alarm."
                value={ackNotes}
                onChange={(e) => setAckNotes(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button 
                onClick={() => setAcknowledgingId(null)} 
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleAcknowledge(acknowledgingId)} 
                className="btn btn-primary"
              >
                Confirm Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Snapshot Modal */}
      {selectedEvidence && (
        <div 
          onClick={() => setSelectedEvidence(null)}
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
            style={{ maxWidth: '800px', width: '100%', overflow: 'hidden' }}
          >
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '0.95rem' }}>Forensic Evidence Snapshot</h3>
              <button 
                onClick={() => setSelectedEvidence(null)} 
                className="btn btn-secondary" 
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              >
                Close
              </button>
            </div>
            <div style={{ padding: '16px', background: '#05070a', textAlign: 'center' }}>
              <img 
                src={selectedEvidence} 
                alt="Evidence Snapshot" 
                style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: '6px', border: '1px solid rgba(255, 0, 0, 0.4)' }} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
