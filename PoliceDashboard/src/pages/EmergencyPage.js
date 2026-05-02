import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Phone, UserCheck, Radio, CheckCircle2, MapPin, Clock, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToAlerts, getUserById, getUserGuardians,
  resolveAlert, formatTimestamp,
} from '../services/firestoreService';
import UnitSelectorModal from '../components/UnitSelectorModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { showToast } from '../components/Toast';

const FILTERS = ['All Alerts', 'Critical', 'Responded', 'Resolved'];

function EmergencyPage() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [userCache, setUserCache] = useState({});
  const [activeFilter, setActiveFilter] = useState('All Alerts');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [dispatchModal, setDispatchModal] = useState({ open: false, alertId: null, policeAlertId: null });

  useEffect(() => {
    const unsub = subscribeToAlerts((all) => {
      setAlerts(all);
      setLoading(false);
      all.forEach(async (a) => {
        const uid = a.userId || a.ownerId;
        if (uid && !userCache[uid]) {
          const u = await getUserById(uid);
          if (u) setUserCache((p) => ({ ...p, [uid]: u }));
        }
      });
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let r = alerts;
    switch (activeFilter) {
      case 'Critical': r = r.filter((a) => a.status === 'active' || a.status === 'escalated'); break;
      case 'Responded': r = r.filter((a) => a.status === 'responded'); break;
      case 'Resolved': r = r.filter((a) => a.status === 'resolved' || a.status === 'cancelled'); break;
      default: break;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter((a) => {
        const uid = a.userId || a.ownerId;
        const ud = userCache[uid];
        return (ud?.fullName?.toLowerCase() || '').includes(q) || (ud?.phone || '').includes(q);
      });
    }
    return r;
  }, [alerts, activeFilter, searchQuery, userCache]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active': return <span className="badge badge-critical badge-pulse">ACTIVE</span>;
      case 'escalated': return <span className="badge badge-critical badge-pulse">ESCALATED</span>;
      case 'responded': return <span className="badge badge-warning">RESPONDED</span>;
      case 'resolved': return <span className="badge badge-success">RESOLVED</span>;
      case 'cancelled': return <span className="badge badge-neutral">CANCELLED</span>;
      default: return <span className="badge badge-neutral">{status?.toUpperCase()}</span>;
    }
  };

  const handleResolve = async (alert) => {
    try { await resolveAlert(alert.id, null, null, user?.uid); showToast('Alert resolved', 'success'); }
    catch (e) { showToast('Failed: ' + e.message, 'error'); }
  };

  const handleGuardian = async (alert) => {
    const uid = alert.userId || alert.ownerId;
    if (!uid) return;
    try {
      const gs = await getUserGuardians(uid);
      if (gs.length > 0) {
        const g = gs[0];
        window.alert(`Guardian: ${g.name || 'N/A'}\nPhone: ${g.phone || 'N/A'}\nEmail: ${g.email || 'N/A'}`);
      } else showToast('No guardians found', 'warning');
    } catch { showToast('Failed to fetch guardian', 'error'); }
  };

  if (loading) return <LoadingSpinner message="Loading emergency alerts..." />;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title"><AlertTriangle size={28} /> Emergency Alerts</h1>
        <p className="page-subtitle">Monitor and manage all emergency situations in real-time
          {alerts.length > 0 && <span style={{ fontWeight: 600, marginLeft: 8 }}>({alerts.length} total)</span>}
        </p>
      </div>

      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button key={f} className={`filter-pill ${activeFilter === f ? 'active' : ''}`} onClick={() => setActiveFilter(f)}>{f}</button>
        ))}
      </div>

      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
        <input className="input" style={{ paddingLeft: 42 }} placeholder="Search by name, phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-muted)' }}>
          <AlertTriangle size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p>No alerts found {activeFilter !== 'All Alerts' ? `for "${activeFilter}"` : ''}</p>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-header-row" style={{ gridTemplateColumns: '0.8fr 1.2fr 1.2fr 0.8fr 0.8fr 0.7fr 1.3fr' }}>
            <span>ID</span><span>User</span><span>Location</span><span>Type</span><span>Status</span><span>Time</span><span>Actions</span>
          </div>
          {filtered.map((alert, i) => {
            const uid = alert.userId || alert.ownerId;
            const ud = userCache[uid];
            return (
              <motion.div key={alert.id} className="table-row" style={{ gridTemplateColumns: '0.8fr 1.2fr 1.2fr 0.8fr 0.8fr 0.7fr 1.3fr' }}
                initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>{alert.id.slice(0, 8)}…</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{ud?.fullName || uid?.slice(0, 8) || '—'}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={13} />{alert.latitude && alert.longitude ? `${Number(alert.latitude).toFixed(4)}, ${Number(alert.longitude).toFixed(4)}` : 'N/A'}
                </span>
                <span style={{ fontSize: 12 }}>{alert.type || alert.alertType || 'Manual'}</span>
                <span>{getStatusBadge(alert.status)}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{formatTimestamp(alert.createdAt)}</span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(alert.status === 'active' || alert.status === 'escalated') && (
                    <>
                      <button className="button button-danger" style={{ padding: '6px 12px', fontSize: 11 }}
                        onClick={() => setDispatchModal({ open: true, alertId: alert.id, policeAlertId: null })}>
                        <Radio size={13} /> Dispatch
                      </button>
                      <button className="button button-secondary" style={{ padding: '6px 10px', fontSize: 11 }}
                        onClick={() => ud?.phone ? window.open('tel:' + ud.phone) : showToast('No phone', 'warning')}>
                        <Phone size={13} />
                      </button>
                      <button className="button button-primary" style={{ padding: '6px 10px', fontSize: 11 }} onClick={() => handleGuardian(alert)}>
                        <UserCheck size={13} />
                      </button>
                    </>
                  )}
                  {alert.status === 'responded' && (
                    <button className="button button-success" style={{ padding: '6px 12px', fontSize: 11 }} onClick={() => handleResolve(alert)}>
                      <CheckCircle2 size={13} /> Resolve
                    </button>
                  )}
                  {(alert.status === 'resolved' || alert.status === 'cancelled') && (
                    <span className="badge badge-success"><CheckCircle2 size={12} /> Closed</span>
                  )}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}

      <UnitSelectorModal isOpen={dispatchModal.open}
        onClose={() => setDispatchModal({ open: false, alertId: null, policeAlertId: null })}
        alertId={dispatchModal.alertId} policeAlertId={dispatchModal.policeAlertId} />
    </>
  );
}

export default EmergencyPage;
