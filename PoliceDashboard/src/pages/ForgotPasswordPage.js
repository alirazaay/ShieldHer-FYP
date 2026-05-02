import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Mail, ArrowLeft, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css'; /* reuse auth styles */

function ForgotPasswordPage() {
  const { resetPassword, authError, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); clearError(); setLoading(true);
    try { await resetPassword(email); setSent(true); }
    catch { /* authError set by context */ }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-pattern" />
      <motion.div className="auth-card"
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}>
        <motion.div className="auth-logo"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}>
          <Shield size={32} />
        </motion.div>
        <h1 className="auth-title">Reset Password</h1>
        <p className="auth-subtitle">Enter your email to receive a reset link</p>

        {authError && <div className="auth-error">{authError}</div>}

        {sent ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ textAlign: 'center', padding: 24, background: 'rgba(22,163,74,0.1)', borderRadius: 12, border: '1px solid rgba(22,163,74,0.2)' }}>
            <Send size={32} style={{ color: '#22c55e', marginBottom: 12 }} />
            <p style={{ color: '#86efac', fontSize: 14, fontWeight: 500 }}>Password reset email sent!</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 6 }}>Check your inbox for instructions</p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <Mail size={18} className="auth-field-icon" />
              <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <motion.button type="submit" className="auth-btn" disabled={loading}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              {loading ? 'Sending...' : <><span>Send Reset Link</span><Send size={18} /></>}
            </motion.button>
          </form>
        )}

        <p className="auth-footer">
          <Link to="/login" className="auth-link-bold" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={14} /> Back to Sign In
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default ForgotPasswordPage;
