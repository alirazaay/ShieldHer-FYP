import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function LogoutConfirmModal({ isOpen, onCancel }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogout = async () => {
    setIsLoading(true); setError(null);
    try { await logout(); navigate('/'); }
    catch { setError('Failed to log out.'); setIsLoading(false); }
  };

  const handleKeyDown = useCallback((e) => { if (e.key === 'Escape' && isOpen) onCancel(); }, [isOpen, onCancel]);
  useEffect(() => { document.addEventListener('keydown', handleKeyDown); return () => document.removeEventListener('keydown', handleKeyDown); }, [handleKeyDown]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="modal-overlay" onClick={onCancel}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="modal-content" onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
            <div className="modal-header">
              <div className="modal-icon"><Shield size={28} style={{ color: 'var(--color-primary)' }} /></div>
            </div>
            <h2 className="modal-title" style={{ justifyContent: 'center' }}>Confirm Logout</h2>
            <p className="modal-message" style={{ textAlign: 'center' }}>Are you sure you want to log out of your ShieldHer session?</p>
            {error && <p className="modal-error">{error}</p>}
            <div className="modal-buttons" style={{ justifyContent: 'center' }}>
              <button className="btn-cancel" onClick={onCancel} disabled={isLoading}>Cancel</button>
              <motion.button className="btn-logout" onClick={handleLogout} disabled={isLoading}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <LogOut size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {isLoading ? 'Logging out...' : 'Yes, Log Out'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LogoutConfirmModal;
