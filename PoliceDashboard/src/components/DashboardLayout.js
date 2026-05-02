import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Bell, ChevronDown } from 'lucide-react';
import Sidebar from './Sidebar';
import EmergencyAlertModal from './EmergencyAlertModal';
import usePoliceAlertNotifications from '../hooks/usePoliceAlertNotifications';
import { useAuth } from '../context/AuthContext';
import { subscribeToAlertStats } from '../services/firestoreService';

function DashboardLayout() {
  const navigate = useNavigate();
  const { policeProfile } = useAuth();
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    const unsub = subscribeToAlertStats((stats) => {
      setAlertCount(stats.active + stats.escalated);
    });
    return () => unsub();
  }, []);

  const {
    activeAlert,
    isModalOpen,
    queuedCount,
    isAudioBlocked,
    enableAlarmAfterGesture,
    acceptCurrentAlert,
    dismissCurrentAlert,
  } = usePoliceAlertNotifications({
    alarmSrc: '/sounds/police-siren.mp3',
    onAcceptAlert: (alert) => {
      navigate(`/emergency?alertId=${encodeURIComponent(alert.id)}`);
    },
  });

  const officerName = policeProfile?.name || 'Officer';
  const initials = officerName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      <div className="app-container">
        <Sidebar />
        <div className="dashboard-wrapper">
          {/* Top Navbar */}
          <motion.div
            className="top-navbar"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <div className="navbar-search">
              <span className="navbar-search-icon"><Search size={18} /></span>
              <input type="text" placeholder="Search alerts, units, users..." />
            </div>
            <div className="navbar-actions">
              <button className="navbar-btn" onClick={() => navigate('/emergency')}>
                <Bell size={20} />
                {alertCount > 0 && (
                  <span className="navbar-badge">{alertCount > 9 ? '9+' : alertCount}</span>
                )}
              </button>
              <div className="navbar-user">
                <div className="navbar-avatar">{initials}</div>
                <div className="navbar-user-info">
                  <span className="navbar-user-name">{officerName}</span>
                  <span className="navbar-user-role">
                    {policeProfile?.rank?.replace(/-/g, ' ') || 'Officer'}
                  </span>
                </div>
                <ChevronDown size={16} style={{ color: 'var(--color-text-muted)' }} />
              </div>
            </div>
          </motion.div>

          {/* Main Content with Page Transition */}
          <div className="main-content">
            <AnimatePresence mode="wait">
              <motion.div
                key={window.location.pathname}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <EmergencyAlertModal
        isOpen={isModalOpen}
        alert={activeAlert}
        queuedCount={queuedCount}
        isAudioBlocked={isAudioBlocked}
        onEnableSound={enableAlarmAfterGesture}
        onAccept={acceptCurrentAlert}
        onDismiss={dismissCurrentAlert}
      />
    </>
  );
}

export default DashboardLayout;
