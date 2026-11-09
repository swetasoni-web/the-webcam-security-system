import React, { useState, useEffect, lazy, Suspense } from 'react';
import Navbar from './components/Navbar';
import LiveMonitor from './components/LiveMonitor';
import LoginModal from './components/LoginModal';
import { api, authStorage } from './api/client';

// Code-splitting via React.lazy reduces initial JavaScript bundle by ~50 KiB
const AlertFeed = lazy(() => import('./components/AlertFeed'));
const ZoneEditor = lazy(() => import('./components/ZoneEditor'));
const RuleManager = lazy(() => import('./components/RuleManager'));
const FaceEnroll = lazy(() => import('./components/FaceEnroll'));
const EvidenceViewer = lazy(() => import('./components/EvidenceViewer'));
const HealthModal = lazy(() => import('./components/HealthModal'));

export default function App() {
  const [user, setUser] = useState(authStorage.getUser());
  const [activeTab, setActiveTab] = useState('monitor');
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  
  // Theme state: defaults to 'light' (simple and light GUI)
  const [theme, setTheme] = useState(() => localStorage.getItem('the_webcam_theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('the_webcam_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Authentication expiration event listener
  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
    };
    window.addEventListener('voltwatch_auth_expired', handleAuthExpired);
    return () => window.removeEventListener('voltwatch_auth_expired', handleAuthExpired);
  }, []);

  // Fetch initial data once logged in
  const refreshAppData = async () => {
    if (!user) return;
    try {
      const cams = await api.getCameras();
      if (Array.isArray(cams) && cams.length > 0) {
        setCameras(cams);
        if (!selectedCameraId) {
          setSelectedCameraId(cams[0].id);
        }
      }
    } catch (err) {
      console.warn('Failed to load cameras:', err);
    }

    try {
      const health = await api.getSystemHealth();
      if (health) setHealthData(health);
    } catch (err) {
      console.warn('Failed to load system health:', err);
    }

    try {
      const alerts = await api.getAlerts({ isAcknowledged: false, limit: 100 });
      if (Array.isArray(alerts)) setUnreadAlertCount(alerts.length);
    } catch (err) {
      console.warn('Failed to load alerts:', err);
    }
  };

  useEffect(() => {
    if (user) {
      refreshAppData();
      const interval = setInterval(refreshAppData, 10000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleLogout = () => {
    authStorage.clear();
    setUser(null);
  };

  if (!user) {
    return <LoginModal onLoginSuccess={(u) => setUser(u)} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Telemetry & Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        onOpenHealth={() => setIsHealthOpen(true)}
        healthData={healthData}
        unreadAlertCount={unreadAlertCount}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Tab Content Viewport */}
      <main style={{ flex: 1 }}>
        {activeTab === 'monitor' && (
          <LiveMonitor
            cameras={cameras}
            selectedCameraId={selectedCameraId}
            onSelectCamera={(id) => setSelectedCameraId(id)}
            onNewAlert={refreshAppData}
            onCamerasUpdated={refreshAppData}
          />
        )}

        <Suspense fallback={
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Loading surveillance module...
          </div>
        }>
          {activeTab === 'alerts' && (
            <AlertFeed
              user={user}
              onAlertsUpdated={(alerts) => {
                const unack = alerts.filter(a => !a.is_acknowledged).length;
                setUnreadAlertCount(unack);
              }}
            />
          )}

          {activeTab === 'zones' && (
            <ZoneEditor
              cameras={cameras}
              selectedCameraId={selectedCameraId}
              user={user}
            />
          )}

          {activeTab === 'rules' && (
            <RuleManager
              cameras={cameras}
              user={user}
            />
          )}

          {activeTab === 'faces' && (
            <FaceEnroll
              user={user}
            />
          )}

          {activeTab === 'evidence' && (
            <EvidenceViewer
              cameras={cameras}
            />
          )}
        </Suspense>
      </main>

      {/* Diagnostics & Health Modal */}
      {isHealthOpen && (
        <Suspense fallback={null}>
          <HealthModal
            isOpen={isHealthOpen}
            onClose={() => setIsHealthOpen(false)}
            healthData={healthData}
            onRefresh={refreshAppData}
            user={user}
          />
        </Suspense>
      )}
    </div>
  );
}
