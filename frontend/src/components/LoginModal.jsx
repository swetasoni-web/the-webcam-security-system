import React, { useState } from 'react';
import { ShieldAlert, Lock, User, Key, AlertCircle, ArrowRight } from 'lucide-react';
import { api } from '../api/client';

export default function LoginModal({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Sumit@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) return;

    try {
      setLoading(true);
      setError(null);
      const data = await api.login(username, password);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const setDemoRole = (userVal, passVal) => {
    setUsername(userVal);
    setPassword(passVal);
    setError(null);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative'
    }}>
      <div 
        className="glass-panel" 
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
        }}
      >
        {/* Brand Icon & Heading */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 10px',
            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
          }}>
            <ShieldAlert size={26} color="#ffffff" />
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            The WebCam Surveillance Console
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            AI-Powered Intelligent Security System
          </p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--accent-rose)',
            color: '#fca5a5',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label htmlFor="login-username" className="form-label">Username</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-username"
                name="username"
                type="text"
                className="form-input"
                style={{ paddingLeft: '34px' }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
              <User size={16} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                name="password"
                type="password"
                className="form-input"
                style={{ paddingLeft: '34px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <Key size={16} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '10px', marginTop: '6px' }}
          >
            <span>{loading ? 'Authenticating...' : 'Sign In to Console'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Demo Credentials Quick-Select Pill Group */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '8px' }}>
            DEMO ROLE PRESETS (CLICK TO LOAD)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setDemoRole('admin', 'Sumit@123')}
              className="btn btn-secondary"
              style={{ padding: '6px', fontSize: '0.75rem' }}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => setDemoRole('operator', 'Sumit@123')}
              className="btn btn-secondary"
              style={{ padding: '6px', fontSize: '0.75rem' }}
            >
              Operator
            </button>
            <button
              type="button"
              onClick={() => setDemoRole('viewer', 'Sumit@123')}
              className="btn btn-secondary"
              style={{ padding: '6px', fontSize: '0.75rem' }}
            >
              Viewer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
