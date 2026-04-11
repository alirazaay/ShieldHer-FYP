import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/LogoutConfirmModal.css';

function LogoutConfirmModal({ isOpen, onCancel }) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  if (!isOpen) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-icon">🛡️</div>
        </div>
        <h2 className="modal-title">Confirm Logout</h2>
        <p className="modal-message">Are you sure you want to log out of your ShieldHer session?</p>
        <div className="modal-buttons">
          <button className="btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-logout" onClick={handleLogout}>
            Yes Log Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogoutConfirmModal;
