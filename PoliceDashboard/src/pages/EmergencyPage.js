import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToAlerts,
  getUserById,
  getUserGuardians,
  resolveAlert,
  formatTimestamp,
} from '../services/firestoreService';
import UnitSelectorModal from '../components/UnitSelectorModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { showToast } from '../components/Toast';

function EmergencyPage() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [userCache, setUserCache] = useState({});
  const [activeFilter, setActiveFilter] = useState('All Alerts');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [dispatchModal, setDispatchModal] = useState({
    open: false,
    alertId: null,
    policeAlertId: null,
  });

  const filters = ['All Alerts', 'Critical', 'Responded', 'Resolved'];

  // Subscribe to all alerts
  useEffect(() => {
    const unsubscribe = subscribeToAlerts((allAlerts) => {
      setAlerts(allAlerts);
      setLoading(false);

      // Fetch user details for each alert
      allAlerts.forEach(async (alert) => {
        const uid = alert.userId || alert.ownerId;
        if (uid && !userCache[uid]) {
          const userData = await getUserById(uid);
          if (userData) {
            setUserCache((prev) => ({ ...prev, [uid]: userData }));
          }
        }
      });
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    let result = alerts;

    // Status filter
    switch (activeFilter) {
      case 'Critical':
        result = result.filter((a) => a.status === 'active' || a.status === 'escalated');
        break;
      case 'Responded':
        result = result.filter((a) => a.status === 'responded');
        break;
      case 'Resolved':
        result = result.filter((a) => a.status === 'resolved' || a.status === 'cancelled');
        break;
      default:
        break;
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((alert) => {
        const uid = alert.userId || alert.ownerId;
        const userData = userCache[uid];
        const name = userData?.fullName?.toLowerCase() || '';
        const phone = userData?.phone || '';
        const location = `${alert.latitude || ''} ${alert.longitude || ''}`;
        return name.includes(q) || phone.includes(q) || location.includes(q);
      });
    }

    return result;
  }, [alerts, activeFilter, searchQuery, userCache]);

  const getStatusInfo = (status) => {
    switch (status) {
      case 'active':
        return { label: 'ACTIVE', color: '#ff0000', bgColor: '#ffe5e5' };
      case 'escalated':
        return { label: 'ESCALATED', color: '#ff6600', bgColor: '#fff3e5' };
      case 'responded':
        return { label: 'RESPONDED', color: '#ffa500', bgColor: '#fff8e5' };
      case 'resolved':
        return { label: 'RESOLVED', color: '#00d9a5', bgColor: '#e5f9f4' };
      case 'cancelled':
        return { label: 'CANCELLED', color: '#666', bgColor: '#f5f5f5' };
      default:
        return { label: status?.toUpperCase() || 'UNKNOWN', color: '#666', bgColor: '#f5f5f5' };
    }
  };

  const handleResolve = async (alert) => {
    try {
      await resolveAlert(alert.id, null, null, user?.uid);
      showToast('Alert resolved successfully', 'success');
    } catch (error) {
      showToast('Failed to resolve: ' + error.message, 'error');
    }
  };

  const handleContactGuardian = async (alert) => {
    const uid = alert.userId || alert.ownerId;
    if (!uid) return;
    try {
      const guardians = await getUserGuardians(uid);
      if (guardians.length > 0) {
        const guardian = guardians[0];
        const info = `Guardian: ${guardian.name || 'N/A'}\nPhone: ${guardian.phone || 'N/A'}\nEmail: ${guardian.email || 'N/A'}`;
        alert.guardianInfo = info;
        window.alert(info);
      } else {
        showToast('No guardians found for this user', 'warning');
      }
    } catch (error) {
      showToast('Failed to fetch guardian info', 'error');
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading emergency alerts..." />;
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">🚨 Emergency Alerts</h1>
        <p className="page-subtitle">
          Monitor and manage all emergency situations in real-time
          {alerts.length > 0 && (
            <span style={{ marginLeft: '10px', fontWeight: '600' }}>({alerts.length} total)</span>
          )}
        </p>
      </div>

      <div
        style={{
          marginBottom: '20px',
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: '600', marginRight: '10px' }}>Filter by:</span>
        {filters.map((filter, index) => (
          <button
            key={index}
            onClick={() => setActiveFilter(filter)}
            style={{
              padding: '8px 18px',
              borderRadius: '20px',
              border: 'none',
              background: activeFilter === filter ? '#000' : '#fff',
              color: activeFilter === filter ? '#fff' : '#000',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '13px',
            }}
          >
            {filter}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Search by name, location, phone..."
        className="input"
        style={{ marginBottom: '20px' }}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {filteredAlerts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>📭</div>
          <p>
            No alerts found {activeFilter !== 'All Alerts' ? `for "${activeFilter}" filter` : ''}
          </p>
        </div>
      ) : (
        filteredAlerts.map((alert) => {
          const uid = alert.userId || alert.ownerId;
          const userData = userCache[uid];
          const statusInfo = getStatusInfo(alert.status);

          return (
            <div
              key={alert.id}
              className="card"
              style={{ borderLeft: `6px solid ${statusInfo.color}` }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}
              >
                <span className="badge" style={{ backgroundColor: statusInfo.color }}>
                  {statusInfo.label}
                </span>
                <span style={{ fontSize: '12px', color: '#666' }}>
                  {formatTimestamp(alert.createdAt)}
                </span>
              </div>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>
                {alert.status === 'active' || alert.status === 'escalated'
                  ? 'Safety Concern'
                  : 'Emergency'}{' '}
                — {userData?.fullName || uid || 'Unknown User'}
              </h3>

              <div style={{ marginBottom: '8px', fontSize: '13px', color: '#333' }}>
                📍{' '}
                {alert.latitude && alert.longitude
                  ? `${Number(alert.latitude).toFixed(4)}, ${Number(alert.longitude).toFixed(4)}`
                  : 'Location not available'}
              </div>
              <div style={{ marginBottom: '8px', fontSize: '13px', color: '#333' }}>
                📱 {userData?.phone || 'Phone not available'}
              </div>
              <div style={{ marginBottom: '8px', fontSize: '13px', color: '#333' }}>
                🔔 Trigger: {alert.type || alert.alertType || 'Manual'}
              </div>
              {userData?.email && (
                <div style={{ marginBottom: '15px', fontSize: '13px', color: '#333' }}>
                  ✉️ {userData.email}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {(alert.status === 'active' || alert.status === 'escalated') && (
                  <>
                    <button
                      className="button button-danger"
                      onClick={() =>
                        setDispatchModal({ open: true, alertId: alert.id, policeAlertId: null })
                      }
                    >
                      🚨 Dispatch Unit Now
                    </button>
                    <button
                      className="button"
                      style={{ background: '#fff', border: '1px solid #ddd' }}
                      onClick={() => {
                        if (userData?.phone) window.open('tel:' + userData.phone);
                        else showToast('No phone number available', 'warning');
                      }}
                    >
                      📞 Contact
                    </button>
                    <button
                      className="button button-primary"
                      onClick={() => handleContactGuardian(alert)}
                    >
                      📞 Contact Guardian
                    </button>
                  </>
                )}
                {alert.status === 'responded' && (
                  <>
                    <button className="button button-success" onClick={() => handleResolve(alert)}>
                      ✓ Case Closed
                    </button>
                    <button
                      className="button"
                      style={{ background: '#fff', border: '1px solid #ddd' }}
                      onClick={() => {
                        if (userData?.phone) window.open('tel:' + userData.phone);
                      }}
                    >
                      📞 Contact
                    </button>
                  </>
                )}
                {(alert.status === 'resolved' || alert.status === 'cancelled') && (
                  <button className="button" style={{ background: '#e5f9f4', color: '#00b894' }}>
                    ✓ {alert.status === 'resolved' ? 'Successfully Resolved' : 'Cancelled'}
                  </button>
                )}
              </div>

              <div
                style={{
                  marginTop: '15px',
                  padding: '8px 15px',
                  borderRadius: '15px',
                  background: statusInfo.bgColor,
                  display: 'inline-block',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: '600', color: statusInfo.color }}>
                  {statusInfo.label}
                </span>
              </div>
            </div>
          );
        })
      )}

      <UnitSelectorModal
        isOpen={dispatchModal.open}
        onClose={() => setDispatchModal({ open: false, alertId: null, policeAlertId: null })}
        alertId={dispatchModal.alertId}
        policeAlertId={dispatchModal.policeAlertId}
      />
    </>
  );
}

export default EmergencyPage;
