/**
 * ToastContext — in-app notification system to replace all alert() calls.
 * Provides showToast(message, type) function used across all 4 Phase 2 screens.
 * Toasts auto-dismiss after 4 seconds.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle size={18} />,
    error: <XCircle size={18} />,
    warning: <AlertTriangle size={18} />,
    info: <Info size={18} />,
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          zIndex: 9999,
          maxWidth: '420px',
          width: '100%',
        }}
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            role="alert"
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.875rem 1rem',
              borderRadius: '0.5rem',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              animation: 'slideInRight 0.25s ease',
              background:
                toast.type === 'success' ? 'var(--success, #166534)' :
                toast.type === 'error'   ? 'var(--error-bg, #7f1d1d)' :
                toast.type === 'warning' ? 'var(--warning-bg, #713f12)' :
                'var(--card-bg, #1e293b)',
              color: '#f1f5f9',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span style={{ flexShrink: 0, marginTop: '0.1rem' }}>{icons[toast.type]}</span>
            <p style={{ margin: 0, flex: 1, fontSize: '0.9rem', lineHeight: 1.5 }}>{toast.message}</p>
            <button
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
                flexShrink: 0,
                opacity: 0.7,
                padding: '0.1rem',
              }}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
