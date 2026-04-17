import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToAlertStats,
  subscribeToPoliceUnits,
  subscribeToUsers,
} from '../services/firestoreService';
import LoadingSpinner from '../components/LoadingSpinner';

function DashboardPage() {
  const { policeProfile } = useAuth();
  const [alertStats, setAlertStats] = useState(null);
  const [unitCount, setUnitCount] = useState({ available: 0, total: 0 });
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAlerts = subscribeToAlertStats((stats) => {
      setAlertStats(stats);
      setLoading(false);
    });

    const unsubUnits = subscribeToPoliceUnits((units) => {
      setUnitCount({
        available: units.filter((u) => u.status === 'available').length,
        total: units.length,
      });
    });

    const unsubUsers = subscribeToUsers((users) => {
      setUserCount(users.length);
    });

    return () => {
      unsubAlerts();
      unsubUnits();
      unsubUsers();
    };
  }, []);

  const stats = [
    {
      icon: '🚨',
      count: alertStats ? (alertStats.active + alertStats.escalated) : '—',
      title: 'Active Emergencies',
      subtitle: `${alertStats?.escalated || 0} escalated to police`,
      color: '#ff4444',
      textColor: '#ff0000',
    },
    {
      icon: '🚓',
      count: unitCount.available,
      title: 'Units Available',
      subtitle: `${unitCount.total} total units`,
      color: '#ffa500',
      textColor: '#ff8800',
    },
    {
      icon: '👥',
      count: userCount,
      title: 'Registered Users',
      subtitle: 'ShieldHer app users',
      color: '#8b5cf6',
      textColor: '#6b46c1',
    },
    {
      icon: '📋',
      count: alertStats ? alertStats.responded : '—',
      title: 'Pending Cases',
      subtitle: `${alertStats?.resolved || 0} resolved total`,
      color: '#10b981',
      textColor: '#059669',
    },
  ];

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  const officerName = policeProfile?.name || 'Officer';
  const station = policeProfile?.station || 'HQ';
  const initials = officerName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Welcome Back, {officerName}</h1>
          <p className="page-subtitle">Here&apos;s what&apos;s happening with ShieldHer today</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ 
            width: '50px', 
            height: '50px', 
            borderRadius: '50%', 
            background: '#4318ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '20px',
            fontWeight: 'bold'
          }}>{initials}</div>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{officerName}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>{station}</div>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card" style={{ borderTopColor: stat.color }}>
            <div className="stat-icon">{stat.icon}</div>
            <div className="stat-count">{stat.count}</div>
            <div className="stat-title">{stat.title}</div>
            <div className="stat-subtitle" style={{ color: stat.textColor }}>
              {stat.subtitle}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default DashboardPage;
