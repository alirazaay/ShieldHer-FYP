import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Mail, Lock, User, Phone, MapPin, Briefcase, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css'; /* reuse auth styles */

function SignupPage() {
  const navigate = useNavigate();
  const { signup, authError, clearError } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', contact: '', location: '', rank: 'constable' });
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleChange = (e) => { setForm((p) => ({ ...p, [e.target.name]: e.target.value })); };

  const handleSubmit = async (e) => {
    e.preventDefault(); clearError(); setLocalError('');
    if (form.password !== form.confirm) { setLocalError('Passwords do not match'); return; }
    if (form.password.length < 6) { setLocalError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await signup(form.email, form.password, { name: form.name, contact: form.contact, location: form.location, rank: form.rank });
      navigate('/dashboard');
    } catch { /* authError set by context */ }
    finally { setLoading(false); }
  };

  const fields = [
    { name: 'name', icon: User, placeholder: 'Full Name', type: 'text', required: true },
    { name: 'email', icon: Mail, placeholder: 'Email Address', type: 'email', required: true },
    { name: 'password', icon: Lock, placeholder: 'Password', type: 'password', required: true },
    { name: 'confirm', icon: Lock, placeholder: 'Confirm Password', type: 'password', required: true },
    { name: 'contact', icon: Phone, placeholder: 'Contact Number', type: 'tel' },
    { name: 'location', icon: MapPin, placeholder: 'Station / Location', type: 'text' },
  ];

  const error = localError || authError;

  return (
    <div className="auth-page">
      <div className="auth-bg-pattern" />
      <motion.div className="auth-card" style={{ maxWidth: 460 }}
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}>
        <motion.div className="auth-logo"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}>
          <Shield size={32} />
        </motion.div>
        <h1 className="auth-title">Create Account</h1>
        <p className="auth-subtitle">Register as a ShieldHer Police Officer</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {fields.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div key={f.name} className="auth-field"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
                <Icon size={18} className="auth-field-icon" />
                <input type={f.type} name={f.name} placeholder={f.placeholder} value={form[f.name]} onChange={handleChange} required={f.required} />
              </motion.div>
            );
          })}
          <motion.div className="auth-field"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <Briefcase size={18} className="auth-field-icon" />
            <select name="rank" value={form.rank} onChange={handleChange}
              style={{ width: '100%', padding: '14px 16px 14px 48px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, fontFamily: 'Inter, sans-serif', appearance: 'none' }}>
              <option value="constable">Constable</option>
              <option value="head-constable">Head Constable</option>
              <option value="asi">ASI</option>
              <option value="si">Sub Inspector</option>
              <option value="inspector">Inspector</option>
              <option value="dsp">DSP</option>
              <option value="sp">SP</option>
            </select>
          </motion.div>
          <motion.button type="submit" className="auth-btn" disabled={loading}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            {loading ? 'Creating Account...' : <><span>Create Account</span><ArrowRight size={18} /></>}
          </motion.button>
        </form>
        <p className="auth-footer">Already have an account? <Link to="/login" className="auth-link-bold">Sign In</Link></p>
      </motion.div>
    </div>
  );
}

export default SignupPage;
