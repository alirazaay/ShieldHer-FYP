import React, { useState, useEffect } from 'react';
import { subscribeToPoliceUnits, assignUnitToAlert } from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { showToast } from './Toast';

function UnitSelectorModal({ isOpen, onClose, alertId, policeAlertId }) {
  const { user } = useAuth();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = subscribeToPoliceUnits((allUnits) => {
      // Only show available units
      setUnits(allUnits.filter((u) => u.status === 'available'));
    });
    return () => unsubscribe();
  }, [isOpen]);

  const handleDispatch = async () => {
    if (!selectedUnitId) return;
    setLoading(true);
    try {
      await assignUnitToAlert(selectedUnitId, alertId, policeAlertId, user?.uid);
      showToast('Unit dispatched successfully!', 'success');
      onClose();
    } catch (error) {
      showToast('Failed to dispatch unit: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <h2 className="modal-title">🚓 Dispatch Unit</h2>
        <p className="modal-message">Select an available unit to dispatch</p>

        {units.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
            No available units at the moment
          </div>
        ) : (
          <div style={{ maxHeight: '300px', overflowY: 'auto', margin: '15px 0' }}>
            {units.map((unit) => (
              <div
                key={unit.id}
                onClick={() => setSelectedUnitId(unit.id)}
                style={{
                  padding: '12px 15px',
                  borderRadius: '8px',
                  border: selectedUnitId === unit.id ? '2px solid #4318ff' : '1px solid #eee',
                  background: selectedUnitId === unit.id ? '#f0edff' : '#fff',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontWeight: '600', marginBottom: '4px' }}>{unit.name}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  👮 {unit.officerName} &nbsp;|&nbsp; 📍 {unit.station || 'N/A'}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modal-buttons">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="btn-logout"
            onClick={handleDispatch}
            disabled={!selectedUnitId || loading}
            style={{
              background: '#4318ff',
              opacity: !selectedUnitId || loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Dispatching...' : '🚨 Dispatch Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default UnitSelectorModal;
