import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Upload, 
  CheckSquare, 
  ShieldCheck, 
  AlertCircle,
  FileText
} from 'lucide-react';
import { api } from '../api/client';

export default function FaceEnroll({ user }) {
  const [faces, setFaces] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [name, setName] = useState('');
  const [identityCode, setIdentityCode] = useState('');
  const [department, setDepartment] = useState('Security Operations');
  const [consent, setConsent] = useState(true);
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const fetchFaces = async () => {
    try {
      const data = await api.getFaces();
      setFaces(data);
    } catch (err) {
      console.error('Failed to fetch enrolled faces:', err);
    }
  };

  useEffect(() => {
    fetchFaces();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleEnroll = async (e) => {
    e.preventDefault();
    if (!name.trim() || !identityCode.trim()) {
      setError('Please provide both full name and unique identity code.');
      return;
    }
    if (!selectedFile) {
      setError('Please select or upload a frontal portrait photo.');
      return;
    }
    if (!consent) {
      setError('Biometric enrollment requires recorded authorization and consent.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('identity_code', identityCode.trim());
      formData.append('role_or_department', department);
      formData.append('consent_recorded', consent);
      formData.append('notes', notes);
      formData.append('photo', selectedFile);

      await api.enrollFace(formData);
      setShowModal(false);
      resetForm();
      fetchFaces();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setIdentityCode('');
    setDepartment('Security Operations');
    setNotes('');
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
  };

  const handleDelete = async (faceId) => {
    if (!window.confirm('Are you sure you want to remove this individual from facial recognition recognition?')) return;
    try {
      await api.deleteFace(faceId);
      fetchFaces();
    } catch (err) {
      alert(`Error deleting face: ${err.message}`);
    }
  };

  return (
    <div className="glass-panel" style={{ margin: '0 16px 20px', padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={22} color="var(--accent-cyan)" />
            Authorized Facial Recognition Directory
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Known personnel identities with 512-dimensional biometric vector embeddings
          </p>
        </div>

        <button 
          onClick={() => { setShowModal(true); resetForm(); }} 
          className="btn btn-primary"
        >
          <UserPlus size={16} />
          <span>Enroll New Individual</span>
        </button>
      </div>

      {/* Faces Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
        {faces.length > 0 ? (
          faces.map(f => (
            <div 
              key={f.id}
              className="glass-panel"
              style={{
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                {f.photo_path ? (
                  <img
                    src={api.getFacePhotoUrl(f.photo_path)}
                    alt={f.name}
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '10px',
                      objectFit: 'cover',
                      border: '1px solid rgba(0, 240, 255, 0.4)'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Users size={24} color="var(--text-muted)" />
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>{f.name}</div>
                  <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                    {f.identity_code}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {f.role_or_department}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', fontSize: '0.75rem' }}>
                <span className="badge badge-live" style={{ fontSize: '0.65rem' }}>
                  <ShieldCheck size={12} /> Consent Logged
                </span>

                <button
                  onClick={() => handleDelete(f.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                  title="Un-enroll individual"
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
            No authorized individuals enrolled yet. Click 'Enroll New Individual' to register a known face.
          </div>
        )}
      </div>

      {/* Enrollment Modal */}
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
          <div className="glass-panel" style={{ width: '480px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={18} color="var(--accent-cyan)" />
              Enroll Authorized Individual
            </h3>

            {error && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid var(--accent-rose)',
                color: '#fca5a5',
                fontSize: '0.8rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleEnroll} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Jane Smith"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">Identity / Badge Code</label>
                  <input
                    type="text"
                    placeholder="e.g. SEC-007"
                    className="form-input"
                    value={identityCode}
                    onChange={(e) => setIdentityCode(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Department / Role</label>
                  <input
                    type="text"
                    placeholder="e.g. Facility Admin"
                    className="form-input"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Portrait Photo (Frontal Face)</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="form-input"
                  onChange={handleFileChange}
                  required
                />
                {previewUrl && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '10px', border: '2px solid var(--accent-cyan)' }} 
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="form-label">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Authorized 24/7 server room access"
                  className="form-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px 12px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                marginTop: '4px'
              }}>
                <input
                  type="checkbox"
                  id="consentCheckbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  style={{ marginTop: '3px', cursor: 'pointer' }}
                />
                <label htmlFor="consentCheckbox" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  I confirm this individual has provided authorized consent for biometric recognition in accordance with data privacy regulations.
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
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
                  {loading ? 'Extracting Biometrics...' : 'Enroll Identity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
