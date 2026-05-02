import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Mail, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

function LoginPage() {
  const navigate = useNavigate();
  const { login, authError, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); clearError(); setLoading(true);
    try { await login(email, password); navigate('/dashboard'); }
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
        <h1 className="auth-title">Welcome Back</h1>
        <p className="auth-subtitle">Sign in to ShieldHer Police Portal</p>

        {authError && <div className="auth-error">{authError}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <Mail size={18} className="auth-field-icon" />
            <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="auth-field">
            <Lock size={18} className="auth-field-icon" />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div style={{ textAlign: 'right', marginBottom: 16 }}>
            <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
          </div>
          <motion.button type="submit" className="auth-btn" disabled={loading}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            {loading ? 'Signing in...' : <><span>Sign In</span><ArrowRight size={18} /></>}
          </motion.button>
        </form>
        <p className="auth-footer">Don't have an account? <Link to="/signup" className="auth-link-bold">Sign Up</Link></p>
      </motion.div>
    </div>
  );
}

export default LoginPage;
