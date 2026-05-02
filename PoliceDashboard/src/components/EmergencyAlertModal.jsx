import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, MapPin, Crosshair, Users } from 'lucide-react';

function isCritical(alert) {
  const s = String(alert?.severity || alert?.priority || '').toLowerCase();
  return s === 'critical' || s === 'high';
}

function locationLabel(alert) {
  if (!Number.isFinite(alert?.latitude) || !Number.isFinite(alert?.longitude)) return 'Location unavailable';
  return `${alert.latitude.toFixed(5)}, ${alert.longitude.toFixed(5)}`;
}

function EmergencyAlertModal({ isOpen, alert, queuedCount = 0, isAudioBlocked = false, onEnableSound, onAccept, onDismiss }) {
  return (
    <AnimatePresence>
      {isOpen && alert && (
        <motion.div className="emergency-alert-overlay" role="dialog" aria-modal="true"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <motion.div className={`emergency-alert-modal ${isCritical(alert) ? 'critical' : ''}`}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}>

            <div className="emergency-alert-header">
              <h2 className="emergency-alert-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <motion.div animate={{ rotate: [0, -15, 15, -15, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                  <AlertTriangle size={28} />
                </motion.div>
                {isCritical(alert) ? 'CRITICAL EMERGENCY' : 'NEW EMERGENCY ALERT'}
              </h2>
              <span className={`emergency-alert-severity ${isCritical(alert) ? 'critical' : ''}`}>
                {String(alert.severity || alert.priority || 'high').toUpperCase()}
              </span>
            </div>

            <motion.div className="emergency-alert-content"
              initial="hidden" animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.08 } } }}>
              {[
                { icon: <Users size={16} />, label: 'User', value: alert.userName || 'Unknown User' },
                { icon: <MapPin size={16} />, label: 'Location', value: locationLabel(alert) },
                ...(Number.isFinite(alert?.locationAccuracy) ? [{ icon: <Crosshair size={16} />, label: 'Accuracy', value: `${Math.round(alert.locationAccuracy)} m` }] : []),
              ].map((row, i) => (
                <motion.div key={i} className="emergency-alert-row"
                  variants={{ hidden: { opacity: 0, x: -10 }, visible: { opacity: 1, x: 0 } }}>
                  <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{row.icon} {row.label}</span>
                  <span className="value">{row.value}</span>
                </motion.div>
              ))}
              {queuedCount > 0 && (
                <div className="emergency-alert-queue">+{queuedCount} more alert{queuedCount > 1 ? 's' : ''} in queue</div>
              )}
            </motion.div>

            {isAudioBlocked && (
              <div className="emergency-alert-audio-warning">
                Sound is blocked by your browser.
                <button type="button" className="button button-primary" onClick={onEnableSound}>Enable Alarm</button>
              </div>
            )}

            <div className="emergency-alert-actions">
              <motion.button type="button" className="button button-danger" onClick={onAccept}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                style={{ padding: '12px 24px' }}>
                Accept / View Alert
              </motion.button>
              <motion.button type="button" className="button emergency-dismiss" onClick={onDismiss}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                Dismiss
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default EmergencyAlertModal;
