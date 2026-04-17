import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login, user } = useAuth();

  // If already logged in, redirect to dashboard
  if (user) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-title">Sign In</div>
      <div className="login-content">
        <div className="login-left">
          <div className="login-shield">🛡️</div>
          <h2 className="login-heading">POLICE COMMAND & CONTROL</h2>
          <p className="login-subheading">
            Protecting Our Communities.<br />
            Secure Their Future
          </p>
        </div>
        <div className="login-right">
          <div className="login-logo">🛡️</div>
          <h1 className="login-app-name">ShieldHer</h1>
          <p className="login-app-subtitle">Police Portal</p>
          <form onSubmit={handleLogin} className="login-form">
            {error && (
              <div style={{
                background: '#ffe5e5',
                color: '#ff0000',
                padding: '10px 15px',
                borderRadius: '8px',
                fontSize: '13px',
                marginBottom: '15px',
                fontWeight: '500',
              }}>
                {error}
              </div>
            )}
            <label className="login-label">Email</label>
            <input
              type="email"
              className="login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={loading}
            />
            <label className="login-label">Password</label>
            <input
              type="password"
              className="login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
            />
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Signing in...' : 'Login'}
            </button>
            <p className="login-forgot-password-link">
              <a href="/forgot-password">Forgot Password?</a>
            </p>
            <p className="login-signup-link">
              Don&apos;t have an account? <a href="/signup">Sign up here</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
