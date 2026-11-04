import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  Plus, 
  Trash2, 
  CheckCircle, 
  Clock, 
  ShieldAlert, 
  Volume2, 
  Mail,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { api } from '../api/client';

export default function RuleManager({ cameras, user }) {
  const [rules, setRules] = useState([]);
  const [zones, setZones] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [targetIdentity, setTargetIdentity] = useState('ANY');
  const [targetClasses, setTargetClasses] = useState(['person']);
  const [minDwellSeconds, setMinDwellSeconds] = useState(1.5);
  const [scheduleStart, setScheduleStart] = useState('00:00');
  const [scheduleEnd, setScheduleEnd] = useState('23:59');
  const [cooldownSeconds, setCooldownSeconds] = useState(15);
  const [severity, setSeverity] = useState('HIGH');
  const [soundAlarm, setSoundAlarm] = useState(true);
  const [emailAlert, setEmailAlert] = useState(false);

  const fetchRulesAndZones = async () => {
    try {
      const [rData, zData] = await Promise.all([
        api.getRules(),
        api.getZones()
      ]);
      setRules(rData);
      setZones(zData);
    } catch (err) {
      console.error('Failed to fetch rules/zones:', err);
    }
  };

  useEffect(() => {
    fetchRulesAndZones();
  }, []);

  const handleCreateRule = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setLoading(true);
      await api.createRule({
        name: name.trim(),
        description: description.trim(),
        is_active: true,
        camera_id: cameraId ? Number(cameraId) : null,
        zone_id: zoneId ? Number(zoneId) : null,
        target_classes: targetClasses,
        target_identity: targetIdentity,
        min_dwell_seconds: Number(minDwellSeconds),
        schedule_start: scheduleStart,
        schedule_end: scheduleEnd,
        cooldown_seconds: Number(cooldownSeconds),
        severity: severity,
        sound_alarm: soundAlarm,
        email_alert: emailAlert,
      });

      setShowModal(false);
      resetForm();
      fetchRulesAndZones();
    } catch (err) {
      alert(`Error creating rule: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setCameraId('');
    setZoneId('');
    setTargetIdentity('ANY');
    setTargetClasses(['person']);
    setMinDwellSeconds(1.5);
    setCooldownSeconds(15);
    setSeverity('HIGH');
  };

  const handleToggleActive = async (rule) => {
    try {
      await api.updateRule(rule.id, { is_active: !rule.is_active });
      fetchRulesAndZones();
    } catch (err) {
      alert(`Error toggling rule: ${err.message}`);
    }
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm('Delete this automated security rule?')) return;
    try {
      await api.deleteRule(ruleId);
      fetchRulesAndZones();
    } catch (err) {
      alert(`Error deleting rule: ${err.message}`);
    }
  };

  return (
    <div className="glass-panel" style={{ margin: '0 16px 20px', padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sliders size={22} color="var(--accent-cyan)" />
            Security Rule Engine & Automated Triggers
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Real-time multi-condition security policies evaluating identity, zone intrusion, dwell time, and cooldowns
          </p>
        </div>

        <button 
          onClick={() => { setShowModal(true); resetForm(); }} 
          className="btn btn-primary"
        >
          <Plus size={16} />
          <span>New Security Rule</span>
        </button>
      </div>

      {/* Rules List Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {rules.length > 0 ? (
          rules.map(r => (
            <div 
              key={r.id} 
              className="glass-panel"
              style={{
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                borderLeft: `4px solid ${
                  r.severity === 'CRITICAL' ? 'var(--accent-rose)' : r.severity === 'HIGH' ? 'var(--accent-amber)' : 'var(--accent-cyan)'
                }`,
                opacity: r.is_active ? 1 : 0.6
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{r.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{r.description || 'No description provided'}</div>
                </div>
                <button
                  onClick={() => handleToggleActive(r)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: r.is_active ? 'var(--accent-emerald)' : 'var(--text-muted)' }}
                  title={r.is_active ? 'Rule Active' : 'Rule Inactive'}
                >
                  {r.is_active ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                </button>
              </div>

              {/* Conditions Tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.75rem' }}>
                <span className="badge badge-info">
                  Classes: {r.target_classes.join(', ')}
                </span>
                <span className={`badge ${
                  r.target_identity === 'UNKNOWN' ? 'badge-high' : r.target_identity === 'KNOWN' ? 'badge-live' : 'badge-info'
                }`}>
                  Identity: {r.target_identity}
                </span>
                <span className="badge badge-warning">
                  Dwell &ge; {r.min_dwell_seconds}s
                </span>
                <span className="badge badge-info">
                  Cooldown: {r.cooldown_seconds}s
                </span>
                <span className="badge badge-info">
                  Hours: {r.schedule_start}-{r.schedule_end}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)' }}>
                  {r.sound_alarm && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Volume2 size={13} /> Sound</span>}
                  {r.email_alert && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Mail size={13} /> Email</span>}
                </div>

                <button
                  onClick={() => handleDelete(r.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                  title="Delete rule"
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-rose)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
            No security rules configured. Click 'New Security Rule' to set up automated alerts.
          </div>
        )}
      </div>

      {/* New Rule Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ width: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={18} color="var(--accent-cyan)" />
              Define New Security Rule
            </h3>

            <form onSubmit={handleCreateRule} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="form-label">Rule Name</label>
                <input
                  type="text"
                  placeholder="e.g. Unknown Person Loitering Alert"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Alerts security when an un-enrolled face is seen for > 3s"
                  className="form-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">Bound Camera</label>
                  <select
                    className="form-input"
                    value={cameraId}
                    onChange={(e) => setCameraId(e.target.value)}
                  >
                    <option value="">All Cameras</option>
                    {cameras.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Bound Zone</label>
                  <select
                    className="form-input"
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                  >
                    <option value="">Any Zone / General</option>
                    {zones.map(z => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">Target Identity</label>
                  <select
                    className="form-input"
                    value={targetIdentity}
                    onChange={(e) => setTargetIdentity(e.target.value)}
                  >
                    <option value="ANY">Any (Known or Unknown)</option>
                    <option value="UNKNOWN">Unknown Stranger Only</option>
                    <option value="KNOWN">Known Authorized Only</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Severity Level</label>
                  <select
                    className="form-input"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="WARNING">Warning</option>
                    <option value="INFO">Info</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">Min Dwell Time (Seconds)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className="form-input"
                    value={minDwellSeconds}
                    onChange={(e) => setMinDwellSeconds(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Alert Cooldown (Seconds)</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={cooldownSeconds}
                    onChange={(e) => setCooldownSeconds(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">Schedule Start</label>
                  <input
                    type="time"
                    className="form-input"
                    value={scheduleStart}
                    onChange={(e) => setScheduleStart(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Schedule End</label>
                  <input
                    type="time"
                    className="form-input"
                    value={scheduleEnd}
                    onChange={(e) => setScheduleEnd(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={soundAlarm}
                    onChange={(e) => setSoundAlarm(e.target.checked)}
                  />
                  <span>Dashboard Audio Alarm</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={emailAlert}
                    onChange={(e) => setEmailAlert(e.target.checked)}
                  />
                  <span>Dispatch Email Notification</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary"
                >
                  {loading ? 'Saving...' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
