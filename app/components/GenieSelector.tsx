'use client';
import { useState, useEffect } from 'react';
import { GENIES, GenieAvatar } from './GenieCharacters';
import { Sparkle } from '@/lib/icons';

const STORAGE_KEY = 'geknee_genie_id';

export function useSelectedGenie() {
  const [genieId, setGenieId] = useState<string>('lumina');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setGenieId(saved);
  }, []);

  const select = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setGenieId(id);
  };

  return { genieId, select };
}

export default function GenieSelector({ onClose }: { onClose: () => void }) {
  const { genieId, select } = useSelectedGenie();
  const [hovered, setHovered] = useState<string | null>(null);
  const [chosen, setChosen] = useState(genieId);

  const confirm = () => { select(chosen); onClose(); };

  return (
    <>
      <style>{`
        @keyframes floatGenie { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes spinSlow { to { transform: rotate(360deg); } }
        @keyframes starPop { 0%{opacity:0;transform:scale(0)} 60%{opacity:1;transform:scale(1.2)} 100%{opacity:1;transform:scale(1)} }
        @keyframes cosmicBg { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
      `}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9998,
        WebkitBackdropFilter: 'blur(6px)', backdropFilter: 'blur(6px)',
      }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999, width: 'min(680px, 95vw)',
        background: 'linear-gradient(135deg, #0f0c29, #1a0533, #0d1b4b)',
        backgroundSize: '400% 400%',
        animation: 'cosmicBg 8s ease infinite',
        border: '1px solid rgba(167,139,250,0.3)',
        borderRadius: 28, padding: '32px 28px',
        boxShadow: '0 0 80px rgba(124,58,237,0.4), 0 40px 80px rgba(0,0,0,0.8)',
        overflow: 'hidden',
      }}>
        {/* Stars bg decoration */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {[...Array(30)].map((_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: Math.random() > 0.7 ? 3 : 2,
              height: Math.random() > 0.7 ? 3 : 2,
              borderRadius: '50%',
              background: '#fff',
              opacity: Math.random() * 0.6 + 0.1,
            }} />
          ))}
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 28, position: 'relative' }}>
          <div style={{ fontSize: 11, color: 'rgba(167,139,250,0.7)', letterSpacing: '0.15em', fontWeight: 700, marginBottom: 8 }}>
            CHOOSE YOUR GUIDE
          </div>
          <h2 style={{ color: '#fff', fontSize: 26, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
            Your Space Genie Awaits
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: '8px 0 0' }}>
            Pick the cosmic companion for your travels
          </p>
        </div>

        {/* Genie grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
          {GENIES.map(g => {
            const isChosen  = chosen === g.id;
            const isHovered = hovered === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setChosen(g.id)}
                onMouseEnter={() => setHovered(g.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: isChosen
                    ? `radial-gradient(ellipse at top, ${g.colors.primary}33, rgba(0,0,0,0.5))`
                    : 'rgba(255,255,255,0.04)',
                  border: `2px solid ${isChosen ? g.colors.primary : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 20, padding: '20px 12px 16px',
                  cursor: 'pointer', transition: 'all 0.22s ease',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  boxShadow: isChosen ? `0 0 30px ${g.colors.glow}` : 'none',
                  transform: isChosen || isHovered ? 'translateY(-4px) scale(1.03)' : 'none',
                  position: 'relative', overflow: 'hidden',
                }}
              >
                {/* Chosen checkmark */}
                {isChosen && (
                  <div style={{
                    position: 'absolute', top: 10, right: 10,
                    width: 20, height: 20, borderRadius: '50%',
                    background: g.colors.primary,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#fff', fontWeight: 800,
                    animation: 'starPop 0.3s ease-out',
                  }}>✓</div>
                )}

                {/* Genie avatar with float animation */}
                <div style={{
                  animation: isChosen ? 'floatGenie 3s ease-in-out infinite' : 'none',
                  filter: isChosen ? `drop-shadow(0 0 12px ${g.colors.glow})` : 'none',
                  transition: 'filter 0.3s',
                }}>
                  <GenieAvatar id={g.id} size={72} />
                </div>

                {/* Name & title */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    color: isChosen ? g.colors.accent : '#e2e8f0',
                    fontWeight: 800, fontSize: 15, lineHeight: 1.2,
                    transition: 'color 0.2s',
                  }}>{g.name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 3 }}>
                    {g.title}
                  </div>
                </div>

                {/* Glow ring when chosen */}
                {isChosen && (
                  <div style={{
                    position: 'absolute', inset: -1,
                    borderRadius: 20,
                    background: `radial-gradient(ellipse at 50% 0%, ${g.colors.primary}20, transparent 60%)`,
                    pointerEvents: 'none',
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected preview bar */}
        {(() => {
          const g = GENIES.find(x => x.id === chosen)!;
          return (
            <div style={{
              background: `linear-gradient(90deg, ${g.colors.primary}22, transparent)`,
              border: `1px solid ${g.colors.primary}44`,
              borderRadius: 14, padding: '12px 18px',
              display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20,
            }}>
              <div style={{ filter: `drop-shadow(0 0 8px ${g.colors.glow})`, animation: 'floatGenie 3s ease-in-out infinite' }}>
                <GenieAvatar id={chosen} size={44} />
              </div>
              <div>
                <div style={{ color: g.colors.accent, fontWeight: 700, fontSize: 14 }}>{g.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                  Ready to guide your cosmic journey!
                </div>
              </div>
            </div>
          );
        })()}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px 0', borderRadius: 12,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.6)', fontSize: 14, cursor: 'pointer', fontWeight: 600,
          }}>Cancel</button>
          <button onClick={confirm} style={{
            flex: 2, padding: '12px 0', borderRadius: 12, border: 'none',
            background: `linear-gradient(135deg, ${GENIES.find(g => g.id === chosen)!.colors.primary}, #4f46e5)`,
            color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 700,
            boxShadow: `0 4px 20px ${GENIES.find(g => g.id === chosen)!.colors.glow}`,
          }}>
            Choose {GENIES.find(g => g.id === chosen)!.name} <Sparkle size={12} style={{ verticalAlign: '-2px', marginLeft: 4 }} />
          </button>
        </div>
      </div>
    </>
  );
}
