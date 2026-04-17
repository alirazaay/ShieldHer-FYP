import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './ForgotPasswordPage.css';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-password-container">
      <div className="forgot-password-title">Reset Password</div>
      <div className="forgot-password-content">
        <div className="forgot-password-left">
          <div className="forgot-password-shield">🛡️</div>
          <h2 className="forgot-password-heading">POLICE COMMAND & CONTROL</h2>
          <p className="forgot-password-subheading">
            Protecting Our Communities.
            <br />
            Secure Their Future
          </p>
        </div>
        <div className="forgot-password-right">
          <div className="forgot-password-logo">🛡️</div>
          <h1 className="forgot-password-app-name">ShieldHer</h1>
          <p className="forgot-password-app-subtitle">Police Portal</p>

          {success ? (
            <div className="forgot-password-form">
              <div
                style={{
                  textAlign: 'center',
                  padding: '20px 0',
                }}
              >
                <div style={{ fontSize: '48px', marginBottom: '15px' }}>✉️</div>
                <h3 className="forgot-password-step-title">Check Your Email</h3>
                <p
                  style={{
                    color: '#666',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    marginBottom: '20px',
                  }}
                >
                  We&apos;ve sent a password reset link to <strong>{email}</strong>. Please check
                  your inbox and follow the instructions.
                </p>
                <button className="forgot-password-button" onClick={() => navigate('/login')}>
                  Back to Login
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="forgot-password-form">
              <h3 className="forgot-password-step-title">Enter Your Email</h3>
              <p style={{ color: '#666', fontSize: '13px', marginBottom: '15px' }}>
                We&apos;ll send you a link to reset your password.
              </p>
              <label className="forgot-password-label">Email Address</label>
              <input
                type="email"
                className="forgot-password-input"
                placeholder="Enter your registered email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
              {error && <p className="forgot-password-error">{error}</p>}
              <button type="submit" className="forgot-password-button" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button
                type="button"
                className="forgot-password-back-button"
                onClick={() => navigate('/login')}
              >
                Back to Login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
