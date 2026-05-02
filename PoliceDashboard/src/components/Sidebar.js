import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LogoutConfirmModal from './LogoutConfirmModal';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Bell,
  Shield,
  MapPin,
  Users,
  BarChart3,
  LogOut,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/emergency', label: 'Emergency Alerts', icon: Bell },
  { path: '/units', label: 'Units', icon: Shield },
  { path: '/live-map', label: 'Live Map', icon: MapPin },
  { path: '/users', label: 'Users', icon: Users },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
];

const sidebarVariants = {
  hidden: { x: -280 },
  visible: { x: 0, transition: { type: 'spring', stiffness: 300, damping: 30, staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
};

function Sidebar() {
  const location = useLocation();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const { policeProfile } = useAuth();

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
      <motion.div
        className="sidebar"
        variants={sidebarVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="sidebar-header">
          <motion.div
            className="logo-circle"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
          >
            <Shield size={28} strokeWidth={2.5} />
          </motion.div>
          <div className="app-name">ShieldHer</div>
          <div className="app-subtitle">Police Portal</div>
        </div>

        {policeProfile && (
          <motion.div className="sidebar-profile" variants={itemVariants}>
            <div className="sidebar-profile-avatar">{getInitials()}</div>
            <div>
              <div className="sidebar-profile-name">{policeProfile.name}</div>
              <div className="sidebar-profile-rank">
                {policeProfile.rank?.replace(/-/g, ' ') || 'Officer'}
              </div>
            </div>
          </motion.div>
        )}

        <div className="menu">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <motion.div key={item.path} variants={itemVariants} whileHover={{ scale: 1.02 }}>
                <Link
                  to={item.path}
                  className={`menu-item ${isActive ? 'active' : ''}`}
                >
                  <span className="menu-icon">
                    <Icon size={19} />
                  </span>
                  <span>{item.label}</span>
                </Link>
              </motion.div>
            );
          })}

          <motion.div variants={itemVariants}>
            <button
              className="menu-item logout-btn"
              onClick={(e) => { e.preventDefault(); setShowLogoutModal(true); }}
            >
              <span className="menu-icon"><LogOut size={19} /></span>
              <span>Logout</span>
            </button>
          </motion.div>
        </div>

        <div className="sidebar-status">
          <div className="sidebar-status-dot" />
          <span className="sidebar-status-text">System Online</span>
        </div>
      </motion.div>

      <LogoutConfirmModal isOpen={showLogoutModal} onCancel={() => setShowLogoutModal(false)} />
    </>
  );
}

export default Sidebar;
