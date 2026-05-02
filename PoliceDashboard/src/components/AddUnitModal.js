import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, User, Phone, MapPin } from 'lucide-react';
import { createPoliceUnit } from '../services/firestoreService';
import { showToast } from './Toast';

function AddUnitModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({ name: '', officerName: '', officerPhone: '', station: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => { const { name, value } = e.target; setFormData((p) => ({ ...p, [name]: value })); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.officerName) { showToast('Unit name and officer name required', 'warning'); return; }
    setLoading(true);
    try {
      await createPoliceUnit(formData);
      showToast('Unit created!', 'success');
      setFormData({ name: '', officerName: '', officerPhone: '', station: '' });
      onClose();
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  };

  const fields = [
    { name: 'name', label: 'Unit Name *', icon: Plus, placeholder: 'e.g. Unit Alpha' },
    { name: 'officerName', label: 'Officer Name *', icon: User, placeholder: 'e.g. Officer Khan' },
    { name: 'officerPhone', label: 'Officer Phone', icon: Phone, placeholder: '+92 XXX XXXXXXX', type: 'tel' },
    { name: 'station', label: 'Station / Location', icon: MapPin, placeholder: 'e.g. Central HQ' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="modal-overlay" onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
            <h2 className="modal-title"><Plus size={20} /> Add New Unit</h2>
            <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
              {fields.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div key={f.name} style={{ marginBottom: 14 }}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
                      <Icon size={14} /> {f.label}
                    </label>
                    <input className="input" type={f.type || 'text'} name={f.name} value={formData[f.name]} onChange={handleChange} placeholder={f.placeholder} style={{ marginBottom: 0 }} />
                  </motion.div>
                );
              })}
              <div className="modal-buttons">
                <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                <motion.button type="submit" className="btn-logout" disabled={loading}
                  style={{ background: 'var(--color-primary)', opacity: loading ? 0.6 : 1 }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  {loading ? 'Creating...' : 'Create Unit'}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AddUnitModal;
