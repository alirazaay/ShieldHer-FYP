import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

let toastListener = null;

export function showToast(message, type = 'success', duration = 3500) {
  if (toastListener) toastListener({ message, type, duration, id: Date.now() });
}

const ICONS = { success: CheckCircle, error: XCircle, warning: AlertTriangle, info: Info };
const COLORS = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#4318FF' };

function Toast() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((t) => {
    setToasts((p) => [...p, t]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== t.id)), t.duration);
  }, []);

  useEffect(() => { toastListener = addToast; return () => { toastListener = null; }; }, [addToast]);

  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          const color = COLORS[t.type] || '#333';
          return (
            <motion.div key={t.id}
              initial={{ opacity: 0, x: 80, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
              style={{ pointerEvents: 'auto', background: 'white', borderRadius: 'var(--radius-md)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'var(--shadow-lg)', borderLeft: `4px solid ${color}`, cursor: 'pointer', minWidth: 260, position: 'relative', overflow: 'hidden' }}>
              <Icon size={18} style={{ color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{t.message}</span>
              {/* Progress bar */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: t.duration / 1000, ease: 'linear' }}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: color, transformOrigin: 'left', opacity: 0.3 }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default Toast;
