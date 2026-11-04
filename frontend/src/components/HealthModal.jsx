import React, { useState } from 'react';
import { 
  Activity, 
  CheckCircle, 
  AlertCircle, 
  Cpu, 
  HardDrive, 
  Camera, 
  Eye, 
  Users, 
  Database, 
  Radio, 
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { api } from '../api/client';

export default function HealthModal({ isOpen, onClose, healthData, onRefresh, user }) {
  const [seeding, setSeeding] = useState(false);
  if (!isOpen) return null;

  const components = healthData?.components || {};
  const isHealthy = healthData?.status === 'healthy';

  const handleSeedDemo = async () => {
    try {
      setSeeding(true);
      await api.seedDemoData();
      alert('Demo surveillance data seeded successfully!');
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Error seeding demo data: ${err.message}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()} 
        className="glass-panel" 
        style={{ width: '600px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}
      >
        {/* Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={22} color="var(--accent-cyan)" />
            <div>
              <h3 style={{ fontSize: '1.1rem' }}>System Diagnostics & Telemetry</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Real-time hardware verification and AI model status</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
            Close
          </button>
        </div>

        {/* Global Health Pill */}
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: isHealthy ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          border: `1px solid ${isHealthy ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isHealthy ? <CheckCircle size={20} color="var(--accent-emerald)" /> : <AlertCircle size={20} color="var(--accent-rose)" />}
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                System Status: {isHealthy ? 'HEALTHY & OPERATIONAL' : 'DEGRADED'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {healthData?.app_name} v{healthData?.version} ({healthData?.components?.api?.environment})
              </div>
            </div>
          </div>

          <button onClick={onRefresh} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
            <RefreshCw size={12} />
          </button>
        </div>

        {/* Component Health Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          {/* API Backend */}
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Radio size={16} color="var(--accent-cyan)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>FastAPI Backend</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Status:</span>
              <span className="badge badge-live">ONLINE</span>
            </div>
          </div>

          {/* Database */}
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Database size={16} color="var(--accent-cyan)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Database Engine</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>SQLite:</span>
              <span className={`badge ${components?.database?.status === 'ONLINE' ? 'badge-live' : 'badge-critical'}`}>
                {components?.database?.status || 'ONLINE'}
              </span>
            </div>
          </div>

          {/* Hardware Camera 0 */}
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Camera size={16} color="var(--accent-cyan)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Webcam Hardware (Index 0)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>DirectShow Probe:</span>
              <span className={`badge ${components?.hardware_camera_0?.detected ? 'badge-live' : 'badge-demo'}`}>
                {components?.hardware_camera_0?.status || 'UNKNOWN'}
              </span>
            </div>
          </div>

          {/* YOLO Object Detector */}
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Eye size={16} color="var(--accent-cyan)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>YOLO Object Detector</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{components?.yolo_object_detector?.model || 'YOLOv8n'}:</span>
              <span className="badge badge-live">LOADED</span>
            </div>
          </div>

          {/* Face Recognition */}
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Users size={16} color="var(--accent-cyan)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Face Embeddings (512-dim)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Cosine Matcher:</span>
              <span className="badge badge-live">LOADED</span>
            </div>
          </div>

          {/* Active Pipelines */}
          <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Radio size={16} color="var(--accent-cyan)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Active Stream Pipelines</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Running Instances:</span>
              <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>
                {components?.active_pipelines?.count || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Host CPU & RAM Telemetry */}
        <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', marginBottom: '20px' }}>
          <h4 style={{ fontSize: '0.85rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={15} color="var(--accent-cyan)" />
            Host Hardware Resource Utilization
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.78rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>CPU Utilization:</span>
                <span className="mono">{components?.host_resources?.cpu_percent || 0}%</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${components?.host_resources?.cpu_percent || 0}%`, height: '100%', background: 'var(--accent-cyan)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>RAM Usage:</span>
                <span className="mono">{components?.host_resources?.ram_percent || 0}% ({components?.host_resources?.ram_used_mb || 0} MB)</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${components?.host_resources?.ram_percent || 0}%`, height: '100%', background: 'var(--accent-purple)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Demo Data Seeder */}
        {user?.role === 'ADMIN' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSeedDemo}
              disabled={seeding}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem' }}
            >
              <Sparkles size={14} color="var(--accent-amber)" />
              <span>{seeding ? 'Seeding...' : 'Seed Baseline Demo Data'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
