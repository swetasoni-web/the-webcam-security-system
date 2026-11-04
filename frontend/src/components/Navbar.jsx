import React from 'react';
import { 
  ShieldAlert, 
  Video, 
  Bell, 
  MapPin, 
  Sliders, 
  Users, 
  Eye, 
  Activity, 
  LogOut,
  Sun,
  Moon
} from 'lucide-react';

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  user, 
  onLogout, 
  onOpenHealth, 
  healthData,
  unreadAlertCount = 0,
  theme = 'light',
  onToggleTheme
}) {
  const isHealthy = healthData?.status === 'healthy';

  const navItems = [
    { id: 'monitor', label: 'Live Monitor', icon: Video },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: unreadAlertCount },
    { id: 'zones', label: 'Restricted Zones', icon: MapPin },
    { id: 'rules', label: 'Rule Engine', icon: Sliders },
    { id: 'faces', label: 'Face Directory', icon: Users },
    { id: 'evidence', label: 'Evidence Gallery', icon: Eye },
  ];

  return (
    <header className="glass-panel" style={{ 
      margin: '10px 16px', 
      padding: '8px 18px', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      gap: '14px',
      position: 'sticky',
      top: '10px',
      zIndex: 100
    }}>
      {/* Brand & Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ 
          width: '34px', 
          height: '34px', 
          borderRadius: '8px', 
          background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
        }}>
          <ShieldAlert size={20} color="#ffffff" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.975rem', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
              THE WEBCAM
            </span>
            <span className="badge badge-info" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>
              AI CONSOLE
            </span>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>Smart Facial & Object Recognition</p>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '7px 12px',
                borderRadius: '6px',
                border: 'none',
                background: isActive ? 'rgba(2, 132, 199, 0.12)' : 'transparent',
                color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.825rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                outline: 'none',
                position: 'relative'
              }}
            >
              <Icon size={15} />
              <span>{item.label}</span>
              {item.badge > 0 && (
                <span style={{
                  background: 'var(--accent-rose)',
                  color: '#fff',
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '10px',
                  marginLeft: '2px'
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Right Controls: Theme Toggle + Health + User Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        
        {/* Theme Toggle (Light / Dark) */}
        <button
          onClick={onToggleTheme}
          className="btn btn-secondary"
          style={{ padding: '6px 10px', fontSize: '0.75rem' }}
          title={theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} color="#facc15" />}
          <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
        </button>

        {/* System Health Status Button */}
        <button
          onClick={onOpenHealth}
          className="btn btn-secondary"
          style={{ padding: '6px 10px', fontSize: '0.75rem' }}
          title="View system health & diagnostics"
        >
          <Activity size={14} color="var(--accent-cyan)" />
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%', 
              backgroundColor: isHealthy ? 'var(--accent-emerald)' : 'var(--accent-rose)' 
            }} />
            <span className="mono">HEALTH</span>
          </span>
        </button>

        {/* User Pill & Sign Out */}
        {user && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '4px 10px',
            background: 'var(--bg-secondary)',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>{user.username}</div>
              <span className={`badge ${
                user.role === 'ADMIN' ? 'badge-critical' : user.role === 'OPERATOR' ? 'badge-warning' : 'badge-info'
              }`} style={{ fontSize: '0.55rem', padding: '0 4px' }}>
                {user.role}
              </span>
            </div>
            <button
              onClick={onLogout}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '3px',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Sign Out"
            >
              <LogOut size={15} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
