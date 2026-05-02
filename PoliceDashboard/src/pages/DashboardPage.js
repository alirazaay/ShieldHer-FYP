import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Shield, Clock, CheckCircle, TrendingUp, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToAlertStats,
  subscribeToPoliceUnits,
  subscribeToUsers,
  subscribeToAlerts,
  formatTimestamp,
} from '../services/firestoreService';
import LoadingSpinner from '../components/LoadingSpinner';

/* ── tiny count-up hook ── */
function useCountUp(target, duration = 800) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (typeof target !== 'number') { setValue(target); return; }
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(step);
      else prev.current = target;
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: (i) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' },
  }),
};

function DashboardPage() {
  const { policeProfile } = useAuth();
  const [alertStats, setAlertStats] = useState(null);
  const [unitCount, setUnitCount] = useState({ available: 0, total: 0 });
  const [userCount, setUserCount] = useState(0);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAlerts = subscribeToAlertStats((stats) => { setAlertStats(stats); setLoading(false); });
    const unsubUnits = subscribeToPoliceUnits((units) => {
      setUnitCount({ available: units.filter((u) => u.status === 'available').length, total: units.length });
    });
    const unsubUsers = subscribeToUsers((users) => setUserCount(users.length));
    const unsubRecent = subscribeToAlerts((all) => setRecentAlerts(all.slice(0, 6)));
    return () => { unsubAlerts(); unsubUnits(); unsubUsers(); unsubRecent(); };
  }, []);

  const activeCount = useCountUp(alertStats ? alertStats.active + alertStats.escalated : 0);
  const deployedCount = useCountUp(unitCount.total - unitCount.available);
  const resolvedCount = useCountUp(alertStats?.resolved || 0);
  const usersDisplay = useCountUp(userCount);

  const stats = [
    { icon: AlertTriangle, count: activeCount, title: 'Active Alerts', subtitle: `${alertStats?.escalated || 0} escalated`, color: '#dc2626', bg: '#fef2f2' },
    { icon: Shield, count: deployedCount, title: 'Units Deployed', subtitle: `${unitCount.total} total units`, color: '#d97706', bg: '#fffbeb' },
    { icon: Clock, count: usersDisplay, title: 'Registered Users', subtitle: 'ShieldHer app users', color: '#4318FF', bg: '#ece8ff' },
    { icon: CheckCircle, count: resolvedCount, title: 'Resolved Today', subtitle: `${alertStats?.responded || 0} pending`, color: '#16a34a', bg: '#f0fdf4' },
  ];

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;

  const officerName = policeProfile?.name || 'Officer';

  const getPriorityBadge = (status) => {
    switch (status) {
      case 'active': case 'escalated': return <span className="badge badge-critical badge-pulse">ACTIVE</span>;
      case 'responded': return <span className="badge badge-warning">RESPONDED</span>;
      case 'resolved': return <span className="badge badge-success">RESOLVED</span>;
      default: return <span className="badge badge-neutral">{status?.toUpperCase()}</span>;
    }
  };

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Welcome Back, {officerName}</h1>
          <p className="page-subtitle">Here's what's happening with ShieldHer today</p>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div key={i} className="stat-card" custom={i} variants={cardVariants} initial="hidden" animate="visible">
              <div className="stat-card-icon" style={{ background: stat.bg, color: stat.color }}>
                <Icon size={24} />
              </div>
              <div className="stat-count">{stat.count}</div>
              <div className="stat-title">{stat.title}</div>
              <div className="stat-subtitle">
                <span className="stat-trend-up"><ArrowUpRight size={14} /></span>
                {stat.subtitle}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Recent Alerts Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Recent Alerts</h2>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{recentAlerts.length} shown</span>
        </div>
        <div className="table-container">
          <div className="table-header-row" style={{ gridTemplateColumns: '1fr 1.2fr 1fr 0.8fr' }}>
            <span>Alert ID</span><span>Status</span><span>Type</span><span>Time</span>
          </div>
          {recentAlerts.map((alert, i) => (
            <motion.div
              key={alert.id}
              className="table-row"
              style={{ gridTemplateColumns: '1fr 1.2fr 1fr 0.8fr' }}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.55 + i * 0.04 }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                {alert.id.slice(0, 8)}…
              </span>
              <span>{getPriorityBadge(alert.status)}</span>
              <span style={{ fontSize: 13 }}>{alert.type || alert.alertType || 'Manual'}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                {formatTimestamp(alert.createdAt)}
              </span>
            </motion.div>
          ))}
          {recentAlerts.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>No recent alerts</div>
          )}
        </div>
      </motion.div>
    </>
  );
}

export default DashboardPage;
