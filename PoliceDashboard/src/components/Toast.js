import React, { useState, useEffect, useCallback } from 'react';

// Singleton toast queue
let toastListener = null;

export function showToast(message, type = 'success', duration = 3000) {
  if (toastListener) {
    toastListener({ message, type, duration, id: Date.now() });
  }
}

function Toast() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, toast.duration);
  }, []);

  useEffect(() => {
    toastListener = addToast;
    return () => { toastListener = null; };
  }, [addToast]);

  const getToastStyle = (type) => {
    const base = {
      padding: '12px 20px',
      borderRadius: '8px',
      color: 'white',
      fontWeight: '600',
      fontSize: '14px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      animation: 'slideIn 0.3s ease-out',
      cursor: 'pointer',
    };
    switch (type) {
      case 'success':
        return { ...base, background: '#10b981' };
      case 'error':
        return { ...base, background: '#ff4444' };
      case 'warning':
        return { ...base, background: '#ffa500' };
      case 'info':
        return { ...base, background: '#4318ff' };
      default:
        return { ...base, background: '#333' };
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'warning': return '⚠';
      case 'info': return 'ℹ';
      default: return '';
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={getToastStyle(toast.type)}
          onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
        >
          <span>{getIcon(toast.type)}</span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

export default Toast;
