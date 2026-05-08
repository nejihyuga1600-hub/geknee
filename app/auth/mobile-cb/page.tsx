'use client';

import type { CSSProperties } from 'react';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';

const containerStyle: CSSProperties = {
  position: 'fixed', inset: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#f5f1e8', color: '#111',
  fontFamily: '-apple-system, system-ui, sans-serif',
  padding: 24,
};

const spinnerStyle: CSSProperties = {
  width: 20, height: 20, display: 'inline-block', verticalAlign: 'middle',
  border: '2px solid rgba(0,0,0,.15)', borderTopColor: '#111',
  borderRadius: '50%', marginRight: 8,
  animation: 'gk-spin .8s linear infinite',
};

const buttonStyle: CSSProperties = {
  display: 'inline-block', background: '#111', color: '#fff',
  padding: '12px 20px', borderRadius: 999, textDecoration: 'none',
  fontWeight: 500, fontSize: 15,
};

export default function MobileCallbackPage() {
  return (
    <Suspense fallback={<MobileCallbackFallback />}>
      <MobileCallbackInner />
    </Suspense>
  );
}

function MobileCallbackFallback() {
  return (
    <div style={containerStyle}>
      <div style={{ maxWidth: 360, textAlign: 'center' }}>
        <span aria-hidden style={spinnerStyle} />
        <span style={{ fontSize: 15, fontWeight: 500 }}>Signing you in…</span>
        <style>{`@keyframes gk-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

function MobileCallbackInner() {
  const params = useSearchParams();
  const token = params.get('t');
  const [error, setError] = useState<string | null>(token ? null : 'Missing handoff token. Please sign in again.');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const result = await signIn('native-handoff', {
        token,
        redirect: false,
        callbackUrl: '/',
      });
      if (cancelled) return;
      if (result?.error || !result?.ok) {
        setError('Sign-in expired. Please try again.');
        return;
      }
      window.location.replace('/');
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div style={containerStyle}>
      <div style={{ maxWidth: 360, textAlign: 'center' }}>
        {error ? (
          <>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>
              Couldn&apos;t finish sign-in
            </h1>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: '#555', margin: '0 0 20px' }}>
              {error}
            </p>
            <Link href="/?signin=1" style={buttonStyle}>
              Try again
            </Link>
          </>
        ) : (
          <>
            <span aria-hidden style={spinnerStyle} />
            <span style={{ fontSize: 15, fontWeight: 500 }}>Signing you in…</span>
            <style>{`@keyframes gk-spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}
      </div>
    </div>
  );
}
