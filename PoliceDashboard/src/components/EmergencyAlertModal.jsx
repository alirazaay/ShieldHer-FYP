import React from 'react';

function isCritical(alert) {
  const severity = String(alert?.severity || alert?.priority || '').toLowerCase();
  return severity === 'critical' || severity === 'high';
}

function locationLabel(alert) {
  const hasCoordinates = Number.isFinite(alert?.latitude) && Number.isFinite(alert?.longitude);
  if (!hasCoordinates) return 'Location unavailable';
  return `${alert.latitude.toFixed(5)}, ${alert.longitude.toFixed(5)}`;
}

function EmergencyAlertModal({
  isOpen,
  alert,
  queuedCount = 0,
  isAudioBlocked = false,
  onEnableSound,
  onAccept,
  onDismiss,
}) {
  if (!isOpen || !alert) return null;

  const critical = isCritical(alert);
  const severityText = String(alert.severity || alert.priority || 'high').toUpperCase();

  return (
    <div className="emergency-alert-overlay" role="dialog" aria-modal="true">
      <div className={`emergency-alert-modal ${critical ? 'critical' : ''}`}>
        <div className="emergency-alert-header">
          <h2 className="emergency-alert-title">
            {critical ? 'CRITICAL EMERGENCY ALERT' : 'NEW EMERGENCY ALERT'}
          </h2>
          <span className={`emergency-alert-severity ${critical ? 'critical' : ''}`}>
            {severityText}
          </span>
        </div>

        <div className="emergency-alert-content">
          <div className="emergency-alert-row">
            <span className="label">User:</span>
            <span className="value">{alert.userName || 'Unknown User'}</span>
          </div>
          <div className="emergency-alert-row">
            <span className="label">Location:</span>
            <span className="value">{locationLabel(alert)}</span>
          </div>
          {Number.isFinite(alert?.locationAccuracy) && (
            <div className="emergency-alert-row">
              <span className="label">Accuracy:</span>
              <span className="value">{Math.round(alert.locationAccuracy)} m</span>
            </div>
          )}
          {queuedCount > 0 && (
            <div className="emergency-alert-queue">
              +{queuedCount} more alert{queuedCount > 1 ? 's' : ''} in queue
            </div>
          )}
        </div>

        {isAudioBlocked && (
          <div className="emergency-alert-audio-warning">
            Sound is blocked by your browser. Click below to enable alarm audio.
            <button type="button" className="button button-primary" onClick={onEnableSound}>
              Enable Alarm Sound
            </button>
          </div>
        )}

        <div className="emergency-alert-actions">
          <button type="button" className="button button-danger" onClick={onAccept}>
            Accept / View Alert
          </button>
          <button type="button" className="button emergency-dismiss" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default EmergencyAlertModal;
