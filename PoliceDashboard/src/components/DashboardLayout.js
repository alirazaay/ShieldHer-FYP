import React from 'react';
import { Outlet } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import EmergencyAlertModal from './EmergencyAlertModal';
import usePoliceAlertNotifications from '../hooks/usePoliceAlertNotifications';

function DashboardLayout() {
  const navigate = useNavigate();

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
      const alertId = encodeURIComponent(alert.id);
      navigate(`/emergency?alertId=${alertId}`);
    },
  });

  return (
    <>
      <div className="app-container">
        <Sidebar />
        <div className="main-content">
          <Outlet />
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
