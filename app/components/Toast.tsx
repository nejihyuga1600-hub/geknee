'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; type: ToastType; exiting?: boolean }

const ToastCtx = createContext<(message: string, type?: ToastType) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const show = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    const t1 = setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      const t2 = setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); timers.current.delete(t2); }, 300);
      timers.current.add(t2);
      timers.current.delete(t1);
    }, 3500);
    timers.current.add(t1);
  }, []);

  const colors: Record<ToastType, string> = {
    success: '#059669',
    error: '#dc2626',
    info: '#6366f1',
  };

  const icons: Record<ToastType, number> = {
    success: 0x2714,
    error: 0x2718,
    info: 0x2139,
  };

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 18px', borderRadius: 12,
              background: 'rgba(6,8,22,0.95)', backdropFilter: 'blur(12px)',
              border: `1px solid ${colors[t.type]}40`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 12px ${colors[t.type]}30`,
              color: '#fff', fontSize: 13, fontWeight: 500,
              animation: t.exiting ? 'toastSlideOut 0.3s ease-in forwards' : 'toastSlideIn 0.3s ease-out',
              maxWidth: 360,
            }}
          >
            <span style={{ color: colors[t.type], fontSize: 16, flexShrink: 0 }}>{String.fromCodePoint(icons[t.type])}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
