import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, User, MapPin, CheckCircle } from 'lucide-react';
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
    const unsub = subscribeToPoliceUnits((all) => setUnits(all.filter((u) => u.status === 'available')));
    return () => unsub();
  }, [isOpen]);

  const handleDispatch = async () => {
    if (!selectedUnitId) return;
    setLoading(true);
    try {
      await assignUnitToAlert(selectedUnitId, alertId, policeAlertId, user?.uid);
      showToast('Unit dispatched!', 'success');
      onClose();
    } catch (e) { showToast('Failed: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="modal-overlay" onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
            <h2 className="modal-title"><Radio size={20} /> Dispatch Unit</h2>
            <p className="modal-message">Select an available unit to dispatch to this emergency</p>

            {units.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>No available units</div>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto', margin: '8px 0 16px' }}>
                {units.map((unit, i) => (
                  <motion.div key={unit.id} onClick={() => setSelectedUnitId(unit.id)}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                    whileHover={{ scale: 1.01 }}
                    style={{
                      padding: '14px 16px', borderRadius: 'var(--radius-md)', marginBottom: 8, cursor: 'pointer', transition: 'all 0.15s',
                      border: selectedUnitId === unit.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: selectedUnitId === unit.id ? 'var(--color-primary-light)' : 'var(--color-card)',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{unit.name}</span>
                      {selectedUnitId === unit.id && <CheckCircle size={18} style={{ color: 'var(--color-primary)' }} />}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, display: 'flex', gap: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><User size={12} /> {unit.officerName}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {unit.station || 'N/A'}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={onClose}>Cancel</button>
              <motion.button className="btn-logout" onClick={handleDispatch} disabled={!selectedUnitId || loading}
                style={{ background: 'var(--color-primary)', opacity: !selectedUnitId || loading ? 0.5 : 1 }}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                {loading ? 'Dispatching...' : 'Dispatch Now'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default UnitSelectorModal;
