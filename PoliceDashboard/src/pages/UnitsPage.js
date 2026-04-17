import React, { useState, useEffect, useMemo } from 'react';
import {
  subscribeToPoliceUnits,
  updateUnitStatus,
} from '../services/firestoreService';
import AddUnitModal from '../components/AddUnitModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { showToast } from '../components/Toast';

function UnitsPage() {
  const [units, setUnits] = useState([]);
  const [activeFilter, setActiveFilter] = useState('All Units');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const filters = ['All Units', 'Available', 'Dispatched', 'On Emergency'];

  useEffect(() => {
    const unsubscribe = subscribeToPoliceUnits((allUnits) => {
      setUnits(allUnits);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredUnits = useMemo(() => {
    if (activeFilter === 'All Units') return units;
    const statusMap = {
      'Available': 'available',
      'Dispatched': 'dispatched',
      'On Emergency': 'on_emergency',
    };
    return units.filter((u) => u.status === statusMap[activeFilter]);
  }, [units, activeFilter]);

  const stats = [
    { label: 'Available', count: units.filter((u) => u.status === 'available').length, color: '#10b981' },
    { label: 'Dispatched', count: units.filter((u) => u.status === 'dispatched').length, color: '#ffa500' },
    { label: 'On Emergency', count: units.filter((u) => u.status === 'on_emergency' || u.status === 'on_scene').length, color: '#ff4444' },
    { label: 'Offline', count: units.filter((u) => u.status === 'offline').length, color: '#8b5cf6' },
  ];

  const getStatusDisplay = (status) => {
    switch (status) {
      case 'available': return { label: 'Available', color: '#00b894', bgColor: '#e5f9f4' };
      case 'dispatched': return { label: 'DISPATCHED', color: '#ffa500', bgColor: '#fff3e0' };
      case 'on_emergency': return { label: 'On Emergency', color: '#ff0000', bgColor: '#ffe5e5' };
      case 'on_scene': return { label: 'ON SCENE', color: '#4318ff', bgColor: '#e8e5ff' };
      case 'offline': return { label: 'Offline', color: '#666', bgColor: '#f5f5f5' };
      default: return { label: status || 'Unknown', color: '#666', bgColor: '#f5f5f5' };
    }
  };

  const handleStatusToggle = async (unit) => {
    try {
      if (unit.status === 'available') {
        await updateUnitStatus(unit.id, 'offline');
        showToast(`${unit.name} set to offline`, 'info');
      } else if (unit.status === 'offline') {
        await updateUnitStatus(unit.id, 'available');
        showToast(`${unit.name} is now available`, 'success');
      } else if (unit.status === 'dispatched' || unit.status === 'on_scene' || unit.status === 'on_emergency') {
        await updateUnitStatus(unit.id, 'available', null);
        showToast(`${unit.name} is now available`, 'success');
      }
    } catch (error) {
      showToast('Failed to update: ' + error.message, 'error');
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading units..." />;
  }

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">🚓 Units Management</h1>
          <p className="page-subtitle">Monitor and coordinate all police units in the field</p>
        </div>
        <button className="button button-primary" onClick={() => setShowAddModal(true)}>
          + Add New Unit
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '25px' }}>
        {stats.map((stat, index) => (
          <div key={index} className="card" style={{ textAlign: 'center' }}>
            <div style={{ width: '100%', height: '4px', background: stat.color, borderRadius: '2px', marginBottom: '15px' }} />
            <div style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '5px' }}>{stat.count}</div>
            <div style={{ fontSize: '13px', color: '#666' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontWeight: 'bold', marginBottom: '15px' }}>Active Units</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {filters.map((filter, index) => (
            <button
              key={index}
              onClick={() => setActiveFilter(filter)}
              style={{
                padding: '8px 18px',
                borderRadius: '20px',
                border: 'none',
                background: activeFilter === filter ? '#4318ff' : '#fff',
                color: activeFilter === filter ? '#fff' : '#666',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {filteredUnits.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>🚓</div>
          <p>No units found. Click &quot;+ Add New Unit&quot; to create one.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {filteredUnits.map((unit) => {
            const statusInfo = getStatusDisplay(unit.status);
            return (
              <div key={unit.id} className="card" style={{ background: statusInfo.bgColor }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                  <span className="badge" style={{ background: '#4318ff' }}>
                    {unit.name?.split(' ').pop()?.charAt(0) || 'U'}
                  </span>
                  <span className="badge" style={{ background: statusInfo.color, fontSize: '10px' }}>
                    {statusInfo.label}
                  </span>
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>{unit.name}</h3>
                <div style={{ marginBottom: '8px', fontSize: '12px', color: '#333' }}>
                  👮 {unit.officerName || 'Unassigned'}
                </div>
                <div style={{ marginBottom: '8px', fontSize: '12px', color: '#333' }}>
                  📍 {unit.station || 'N/A'}
                </div>
                {unit.officerPhone && (
                  <div style={{ marginBottom: '15px', fontSize: '12px', color: '#333' }}>
                    📱 {unit.officerPhone}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {unit.status === 'on_emergency' || unit.status === 'dispatched' || unit.status === 'on_scene' ? (
                    <button
                      className="button"
                      style={{ flex: 1, padding: '8px', fontSize: '12px', background: '#10b981', color: '#fff' }}
                      onClick={() => handleStatusToggle(unit)}
                    >
                      ✓ Set Available
                    </button>
                  ) : (
                    <button
                      className="button"
                      style={{
                        flex: 1,
                        padding: '8px',
                        fontSize: '12px',
                        background: unit.status === 'offline' ? '#4318ff' : '#f5f5f5',
                        color: unit.status === 'offline' ? '#fff' : '#000',
                      }}
                      onClick={() => handleStatusToggle(unit)}
                    >
                      {unit.status === 'offline' ? '🔄 Set Online' : '⏸ Set Offline'}
                    </button>
                  )}
                  {unit.officerPhone && (
                    <button
                      className="button"
                      style={{ flex: 1, padding: '8px', fontSize: '12px', background: '#fff' }}
                      onClick={() => window.open('tel:' + unit.officerPhone)}
                    >
                      📞 Contact
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddUnitModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </>
  );
}

export default UnitsPage;
