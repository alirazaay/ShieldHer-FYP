import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './SignupPage.css';

function SignupPage() {
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    email: '',
    password: '',
    confirmPassword: '',
    location: '',
    rank: '',
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { signup } = useAuth();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevState) => ({
      ...prevState,
      [name]: value,
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prevState) => ({
        ...prevState,
        [name]: '',
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.contact.trim()) {
      newErrors.contact = 'Contact number is required';
    } else if (!/^\d{10}$/.test(formData.contact.replace(/\D/g, ''))) {
      newErrors.contact = 'Contact number must be 10 digits';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.location.trim()) {
      newErrors.location = 'Location is required';
    }

    if (!formData.rank) {
      newErrors.rank = 'Rank is required';
    }

    return newErrors;
  };

  const handleSignup = async (e) => {
    e.preventDefault();

    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      await signup(formData.email, formData.password, {
        name: formData.name,
        contact: formData.contact,
        location: formData.location,
        rank: formData.rank,
      });
      navigate('/dashboard');
    } catch (error) {
      setErrors({ submit: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-title">Create Account</div>
      <div className="signup-content">
        <div className="signup-left">
          <div className="signup-shield">🛡️</div>
          <h2 className="signup-heading">POLICE COMMAND & CONTROL</h2>
          <p className="signup-subheading">
            Join our secure network.<br />
            Protecting Our Communities.<br />
            Secure Their Future
          </p>
        </div>
        <div className="signup-right">
          <div className="signup-logo">🛡️</div>
          <h1 className="signup-app-name">ShieldHer</h1>
          <p className="signup-app-subtitle">Police Portal - Sign Up</p>
          
          <form onSubmit={handleSignup} className="signup-form">
            {errors.submit && (
              <div className="signup-error-message">{errors.submit}</div>
            )}

            {/* Name Field */}
            <div className="signup-form-group">
              <label className="signup-label">Full Name</label>
              <input
                type="text"
                name="name"
                className={`signup-input ${errors.name ? 'error' : ''}`}
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter your full name"
              />
              {errors.name && <span className="signup-error">{errors.name}</span>}
            </div>

            {/* Contact Field */}
            <div className="signup-form-group">
              <label className="signup-label">Contact Number</label>
              <input
                type="tel"
                name="contact"
                className={`signup-input ${errors.contact ? 'error' : ''}`}
                value={formData.contact}
                onChange={handleChange}
                placeholder="Enter 10-digit contact number"
              />
              {errors.contact && <span className="signup-error">{errors.contact}</span>}
            </div>

            {/* Email Field */}
            <div className="signup-form-group">
              <label className="signup-label">Email Address</label>
              <input
                type="email"
                name="email"
                className={`signup-input ${errors.email ? 'error' : ''}`}
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter your email"
              />
              {errors.email && <span className="signup-error">{errors.email}</span>}
            </div>

            {/* Password Field */}
            <div className="signup-form-group">
              <label className="signup-label">Password</label>
              <input
                type="password"
                name="password"
                className={`signup-input ${errors.password ? 'error' : ''}`}
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter password (min 6 characters)"
              />
              {errors.password && <span className="signup-error">{errors.password}</span>}
            </div>

            {/* Confirm Password Field */}
            <div className="signup-form-group">
              <label className="signup-label">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                className={`signup-input ${errors.confirmPassword ? 'error' : ''}`}
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter your password"
              />
              {errors.confirmPassword && (
                <span className="signup-error">{errors.confirmPassword}</span>
              )}
            </div>

            {/* Location Field */}
            <div className="signup-form-group">
              <label className="signup-label">Location / Police Station</label>
              <input
                type="text"
                name="location"
                className={`signup-input ${errors.location ? 'error' : ''}`}
                value={formData.location}
                onChange={handleChange}
                placeholder="Enter your police station location"
              />
              {errors.location && <span className="signup-error">{errors.location}</span>}
            </div>

            {/* Rank Field */}
            <div className="signup-form-group">
              <label className="signup-label">Rank</label>
              <select
                name="rank"
                className={`signup-input signup-select ${errors.rank ? 'error' : ''}`}
                value={formData.rank}
                onChange={handleChange}
              >
                <option value="">Select your rank</option>
                <option value="constable">Constable</option>
                <option value="head-constable">Head Constable</option>
                <option value="assistant-sub-inspector">Assistant Sub Inspector</option>
                <option value="sub-inspector">Sub Inspector</option>
                <option value="inspector">Inspector</option>
                <option value="deputy-superintendent">Deputy Superintendent</option>
                <option value="superintendent">Superintendent</option>
                <option value="commissioner">Commissioner</option>
              </select>
              {errors.rank && <span className="signup-error">{errors.rank}</span>}
            </div>

            <button 
              type="submit" 
              className="signup-button"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>

            <p className="signup-login-link">
              Already have an account? <a href="/login">Login here</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default SignupPage;
