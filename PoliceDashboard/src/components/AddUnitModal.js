import React, { useState } from 'react';
import { createPoliceUnit } from '../services/firestoreService';
import { showToast } from './Toast';

function AddUnitModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    officerName: '',
    officerPhone: '',
    station: '',
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.officerName) {
      showToast('Unit name and officer name are required', 'warning');
      return;
    }
    setLoading(true);
    try {
      await createPoliceUnit(formData);
      showToast('Unit created successfully!', 'success');
      setFormData({ name: '', officerName: '', officerPhone: '', station: '' });
      onClose();
    } catch (error) {
      showToast('Failed to create unit: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '460px' }}
      >
        <h2 className="modal-title">+ Add New Unit</h2>
        <form onSubmit={handleSubmit} style={{ marginTop: '15px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label
              style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}
            >
              Unit Name *
            </label>
            <input
              className="input"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Unit Alpha"
              style={{ marginBottom: 0 }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label
              style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}
            >
              Officer Name *
            </label>
            <input
              className="input"
              type="text"
              name="officerName"
              value={formData.officerName}
              onChange={handleChange}
              placeholder="e.g. Officer Raza Khan"
              style={{ marginBottom: 0 }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label
              style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}
            >
              Officer Phone
            </label>
            <input
              className="input"
              type="tel"
              name="officerPhone"
              value={formData.officerPhone}
              onChange={handleChange}
              placeholder="+92 XXX XXXXXXX"
              style={{ marginBottom: 0 }}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}
            >
              Station / Location
            </label>
            <input
              className="input"
              type="text"
              name="station"
              value={formData.station}
              onChange={handleChange}
              placeholder="e.g. Central HQ, Islamabad"
              style={{ marginBottom: 0 }}
            />
          </div>
          <div className="modal-buttons">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-logout"
              disabled={loading}
              style={{ background: '#4318ff', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Creating...' : '+ Create Unit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddUnitModal;
