import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LogoutConfirmModal from './LogoutConfirmModal';

function Sidebar() {
  const location = useLocation();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const { policeProfile } = useAuth();

  const menuItems = [
    { path: '/dashboard', label: 'DashBoard', icon: '🏠' },
    { path: '/emergency', label: 'Emergency Alert', icon: '⚠️' },
    { path: '/units', label: 'Units', icon: '🚓' },
    { path: '/users', label: 'Users', icon: '👥' },
    { path: '/live-map', label: 'Live Map', icon: '📍' },
    { path: '/reports', label: 'Report', icon: '📊' },
  ];

  const handleLogoutClick = (e) => {
    e.preventDefault();
    setShowLogoutModal(true);
  };

  // Get officer initials for avatar
  const getInitials = () => {
    if (!policeProfile?.name) return '?';
    return policeProfile.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo-circle">🛡️</div>
          <div className="app-name">ShieldHer</div>
          <div className="app-subtitle">Police Portal</div>
        </div>

        {/* Officer profile in sidebar */}
        {policeProfile && (
          <div style={{
            padding: '12px 15px',
            margin: '0 5px 15px',
            background: '#fff',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#4318ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '13px',
              fontWeight: 'bold',
            }}>
              {getInitials()}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#000' }}>
                {policeProfile.name}
              </div>
              <div style={{ fontSize: '10px', color: '#666', textTransform: 'capitalize' }}>
                {policeProfile.rank?.replace(/-/g, ' ') || 'Officer'}
              </div>
            </div>
          </div>
        )}

        <div className="menu">
          {menuItems.map((item, index) => (
            <Link
              key={index}
              to={item.path}
              className={`menu-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="menu-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
          <button
            className="menu-item logout-btn"
            onClick={handleLogoutClick}
          >
            <span className="menu-icon">🚪</span>
            <span>LOGOUT</span>
          </button>
        </div>
      </div>

      <LogoutConfirmModal 
        isOpen={showLogoutModal} 
        onCancel={() => setShowLogoutModal(false)}
      />
    </>
  );
}

export default Sidebar;
