'use client';

import { useEffect, useRef, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

const GOOGLE_LOGO = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

const APPLE_LOGO = (
  <svg width="17" height="20" viewBox="0 0 17 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.769 10.617c-.02-2.048 1.674-3.033 1.75-3.082-0.954-1.394-2.437-1.585-2.964-1.607-1.262-.129-2.466.744-3.104.744-.638 0-1.626-.726-2.675-.706-1.376.02-2.646.8-3.355 2.03-1.431 2.48-.366 6.155 1.03 8.168.683.986 1.495 2.09 2.562 2.051 1.031-.041 1.42-.663 2.668-.663 1.249 0 1.6.663 2.69.641 1.108-.02 1.803-.998 2.476-1.989.786-1.143 1.107-2.256 1.124-2.314-.024-.01-2.154-.828-2.202-3.273zm-2.054-6.012c.565-.689.947-1.644.843-2.605-.815.034-1.804.547-2.388 1.228-.525.606-.986 1.581-.863 2.513.91.07 1.842-.461 2.408-1.136z"/>
  </svg>
);

type AuthMode = 'signin' | 'signup';

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const { data: session } = useSession();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [loading, setLoading]   = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Auto-close when user signs in
  useEffect(() => {
    if (session && open) onClose();
  }, [session, open, onClose]);

  // Reset form on open/close
  useEffect(() => {
    if (!open) {
      setError('');
      setSuccess('');
      setLoading(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleOAuth(provider: 'google' | 'apple') {
    setError('');
    setLoading(true);
    try {
      await signIn(provider, { callbackUrl: '/' });
    } catch {
      setError('OAuth sign-in failed. Please try again.');
      setLoading(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);

    if (mode === 'signup') {
      // Create account first
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined, email, password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? 'Registration failed.');
        setLoading(false);
        return;
      }
      setSuccess('Account created! Signing in\u2026');
    }

    // Sign in with credentials
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(mode === 'signup' ? 'Account created but sign-in failed. Please sign in.' : 'Incorrect email or password.');
      setLoading(false);
    }
    // If success, session updates → useEffect closes the modal
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 10, color: '#fff', fontSize: 14,
    padding: '11px 14px', outline: 'none',
    transition: 'border-color 0.15s',
  };
  const oauthBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', padding: '11px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, fontWeight: 500,
    cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
    opacity: loading ? 0.6 : 1,
  };

  return (
    <div
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 420,
        background: 'rgba(6,8,22,0.97)',
        border: '1px solid rgba(129,140,248,0.2)',
        borderRadius: 20,
        boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(129,140,248,0.08)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 24px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ color: '#38bdf8', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px' }}>
              GeKnee
            </p>
            <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>
              {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 500 }}>ESC to close</span>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)', border: 'none',
                width: 32, height: 32, borderRadius: '50%',
                color: 'rgba(255,255,255,0.6)', fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {String.fromCodePoint(0x00D7)}
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Google */}
          <button style={oauthBtnStyle} disabled={loading} onClick={() => handleOAuth('google')}>
            {GOOGLE_LOGO}
            Continue with Google
          </button>

          {/* Apple — only shown when Apple OAuth is configured */}
          {process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === 'true' && (
            <button style={{ ...oauthBtnStyle, background: 'rgba(255,255,255,0.08)' }} disabled={loading} onClick={() => handleOAuth('apple')}>
              {APPLE_LOGO}
              Continue with Apple
            </button>
          )}

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>or continue with email</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mode === 'signup' && (
              <input
                type="text"
                placeholder="Your name (optional)"
                value={name}
                onChange={e => setName(e.target.value)}
                style={inputStyle}
                autoComplete="name"
              />
            )}
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inputStyle}
              required
              autoComplete="email"
            />
            <input
              type="password"
              placeholder={mode === 'signup' ? 'Password (min. 8 characters)' : 'Password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={inputStyle}
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />

            {success && (
              <p style={{
                color: '#34d399', fontSize: 13, margin: 0,
                background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)',
                borderRadius: 8, padding: '8px 12px',
              }}>
                {success}
              </p>
            )}

            {error && (
              <p style={{
                color: '#f87171', fontSize: 13, margin: 0,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 8, padding: '8px 12px',
              }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
                background: loading ? 'rgba(56,189,248,0.4)' : 'linear-gradient(135deg, #38bdf8, #818cf8)',
                color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 14, height: 14,
                    border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                    borderRadius: '50%', animation: 'authSpin 0.7s linear infinite',
                  }} />
                  {mode === 'signup' ? 'Creating account…' : 'Signing in…'}
                </>
              ) : (
                mode === 'signup' ? 'Create account' : 'Sign in'
              )}
            </button>
          </form>

          {/* Mode toggle */}
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', margin: '4px 0 0' }}>
            {mode === 'signin' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  onClick={() => { setMode('signup'); setError(''); }}
                  style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 13, cursor: 'pointer', padding: 0, fontWeight: 600 }}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => { setMode('signin'); setError(''); }}
                  style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 13, cursor: 'pointer', padding: 0, fontWeight: 600 }}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>

    </div>
  );
}
