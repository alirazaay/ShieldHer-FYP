import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Shield, Plus, Phone, MapPin, User, LayoutGrid, List } from 'lucide-react';
import { subscribeToPoliceUnits, updateUnitStatus } from '../services/firestoreService';
import AddUnitModal from '../components/AddUnitModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { showToast } from '../components/Toast';

const FILTERS = ['All Units', 'Available', 'Dispatched', 'On Emergency'];

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: (i) => ({ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' } }),
};

function UnitsPage() {
  const [units, setUnits] = useState([]);
  const [activeFilter, setActiveFilter] = useState('All Units');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewMode, setViewMode] = useState('grid');

  useEffect(() => {
    const unsub = subscribeToPoliceUnits((all) => { setUnits(all); setLoading(false); });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    if (activeFilter === 'All Units') return units;
    const map = { Available: 'available', Dispatched: 'dispatched', 'On Emergency': 'on_emergency' };
    return units.filter((u) => u.status === map[activeFilter]);
  }, [units, activeFilter]);

  const stats = [
    { label: 'Available', count: units.filter((u) => u.status === 'available').length, color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
    { label: 'Dispatched', count: units.filter((u) => u.status === 'dispatched').length, color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
    { label: 'On Emergency', count: units.filter((u) => u.status === 'on_emergency' || u.status === 'on_scene').length, color: 'var(--color-critical)', bg: 'var(--color-critical-bg)' },
    { label: 'Offline', count: units.filter((u) => u.status === 'offline').length, color: 'var(--color-text-muted)', bg: '#f3f4f6' },
  ];

  const getStatusBadge = (status) => {
    switch (status) {
      case 'available': return <span className="badge badge-success">Available</span>;
      case 'dispatched': return <span className="badge badge-warning">Dispatched</span>;
      case 'on_emergency': case 'on_scene': return <span className="badge badge-critical badge-pulse">On Scene</span>;
      case 'offline': return <span className="badge badge-neutral">Offline</span>;
      default: return <span className="badge badge-neutral">{status}</span>;
    }
  };

  const toggle = async (unit) => {
    try {
      if (unit.status === 'available') { await updateUnitStatus(unit.id, 'offline'); showToast(`${unit.name} set offline`, 'info'); }
      else if (unit.status === 'offline') { await updateUnitStatus(unit.id, 'available'); showToast(`${unit.name} available`, 'success'); }
      else { await updateUnitStatus(unit.id, 'available', null); showToast(`${unit.name} available`, 'success'); }
    } catch (e) { showToast('Failed: ' + e.message, 'error'); }
  };

  if (loading) return <LoadingSpinner message="Loading units..." />;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title"><Shield size={28} /> Units Management</h1>
          <p className="page-subtitle">Monitor and coordinate all police units in the field</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`button ${viewMode === 'grid' ? 'button-primary' : 'button-ghost'}`} onClick={() => setViewMode('grid')} style={{ padding: '8px 10px' }}><LayoutGrid size={18} /></button>
          <button className={`button ${viewMode === 'list' ? 'button-primary' : 'button-ghost'}`} onClick={() => setViewMode('list')} style={{ padding: '8px 10px' }}><List size={18} /></button>
          <button className="button button-primary" onClick={() => setShowAddModal(true)}><Plus size={16} /> Add Unit</button>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((s, i) => (
          <motion.div key={i} className="stat-card" custom={i} variants={cardVariants} initial="hidden" animate="visible"
            style={{ textAlign: 'center', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.count}</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button key={f} className={`filter-pill ${activeFilter === f ? 'active' : ''}`} onClick={() => setActiveFilter(f)}>{f}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-muted)' }}>
          <Shield size={48} style={{ marginBottom: 12, opacity: 0.3 }} /><p>No units found. Add one above.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(300px, 1fr))' : '1fr', gap: 16 }}>
          {filtered.map((unit, i) => (
            <motion.div key={unit.id} className="card" custom={i} variants={cardVariants} initial="hidden" animate="visible"
              whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(67,24,255,0.1)' }}
              style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{unit.name}</span>
                {getStatusBadge(unit.status)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><User size={14} /> {unit.officerName || 'Unassigned'}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={14} /> {unit.station || 'N/A'}</span>
                {unit.officerPhone && <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={14} /> {unit.officerPhone}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {unit.status === 'dispatched' || unit.status === 'on_emergency' || unit.status === 'on_scene' ? (
                  <button className="button button-success" style={{ flex: 1, fontSize: 12 }} onClick={() => toggle(unit)}>Set Available</button>
                ) : (
                  <button className="button button-secondary" style={{ flex: 1, fontSize: 12 }} onClick={() => toggle(unit)}>
                    {unit.status === 'offline' ? 'Set Online' : 'Set Offline'}
                  </button>
                )}
                {unit.officerPhone && (
                  <button className="button button-ghost" style={{ padding: '8px 10px' }} onClick={() => window.open('tel:' + unit.officerPhone)}>
                    <Phone size={16} />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AddUnitModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </>
  );
}

export default UnitsPage;
