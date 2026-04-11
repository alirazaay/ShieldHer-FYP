import React from 'react';

function LoadingSpinner({ fullScreen = false, message = 'Loading...' }) {
  if (fullScreen) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.95)',
        zIndex: 9999,
      }}>
        <div className="spinner" />
        <p style={{ marginTop: '16px', color: '#666', fontSize: '14px', fontWeight: '500' }}>
          {message}
        </p>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
    }}>
      <div className="spinner" />
      <p style={{ marginTop: '16px', color: '#666', fontSize: '14px', fontWeight: '500' }}>
        {message}
      </p>
    </div>
  );
}

export default LoadingSpinner;
