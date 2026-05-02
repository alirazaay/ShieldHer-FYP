import React from 'react';
import { motion } from 'framer-motion';

function LoadingSpinner({ fullScreen = false, message = 'Loading...' }) {
  const inner = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: fullScreen ? 0 : 48 }}>
      <motion.div
        style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)' }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
      />
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        style={{ marginTop: 18, color: 'var(--color-text-muted)', fontSize: 14, fontWeight: 500 }}
      >
        {message}
      </motion.p>
    </div>
  );

  if (fullScreen) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.95)', zIndex: 9999 }}>
        {inner}
      </div>
    );
  }

  return inner;
}

export default LoadingSpinner;
