import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/LogoutConfirmModal.css';

function LogoutConfirmModal({ isOpen, onCancel }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogout = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await logout();
      navigate('/');
    } catch (err) {
      setError('Failed to log out. Please try again.');
      setIsLoading(false);
    }
  };

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape' && isOpen) {
      onCancel();
    }
  }, [isOpen, onCancel]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon">🛡️</div>
        </div>
        <h2 className="modal-title">Confirm Logout</h2>
        <p className="modal-message">Are you sure you want to log out of your ShieldHer session?</p>
        
        {error && <p className="modal-error">{error}</p>}
        
        <div className="modal-buttons">
          <button 
            className="btn-cancel" 
            onClick={onCancel} 
            disabled={isLoading}
          >
            Cancel
          </button>
          <button 
            className="btn-logout" 
            onClick={handleLogout} 
            disabled={isLoading}
          >
            {isLoading ? 'Logging out...' : 'Yes, Log Out'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogoutConfirmModal;
