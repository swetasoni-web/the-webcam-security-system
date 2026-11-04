import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LiveMonitor from './components/LiveMonitor';
import AlertFeed from './components/AlertFeed';
import ZoneEditor from './components/ZoneEditor';
import RuleManager from './components/RuleManager';
import FaceEnroll from './components/FaceEnroll';
import EvidenceViewer from './components/EvidenceViewer';
import HealthModal from './components/HealthModal';
import LoginModal from './components/LoginModal';
import { api, authStorage } from './api/client';

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
      const [cams, health, alerts] = await Promise.all([
        api.getCameras(),
        api.getSystemHealth(),
        api.getAlerts({ isAcknowledged: false, limit: 100 })
      ]);
      setCameras(cams);
      setHealthData(health);
      setUnreadAlertCount(alerts.length);
      
      if (cams.length > 0 && !selectedCameraId) {
        setSelectedCameraId(cams[0].id);
      }
    } catch (err) {
      console.error('Failed to load initial surveillance data:', err);
    }
  };

  useEffect(() => {
    if (user) {
      refreshAppData();
      const interval = setInterval(refreshAppData, 5000);
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
      </main>

      {/* Diagnostics & Health Modal */}
      <HealthModal
        isOpen={isHealthOpen}
        onClose={() => setIsHealthOpen(false)}
        healthData={healthData}
        onRefresh={refreshAppData}
        user={user}
      />
    </div>
  );
}
