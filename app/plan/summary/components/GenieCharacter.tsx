'use client';

// Geknee help-bot mascot beside the chat panel. Replaced the pure-CSS
// turban character with the approved crayon-mascot image. Kept the
// speaking-state sparkle ring so the bot still feels alive while it's
// generating a reply.

export function GenieCharacter({ speaking }: { speaking: boolean }) {
  const STAR = String.fromCodePoint(0x2736);
  const W = 96;
  const H = 96;
  return (
    <div style={{ position: 'relative', width: W, height: H, pointerEvents: 'none' }}>
      <img
        src="/brand/geknee-mascot.jpg"
        alt="geknee mascot"
        width={W}
        height={H}
        style={{
          width: W, height: H,
          objectFit: 'contain',
          display: 'block',
          animation: speaking ? 'genieFloat 2s ease-in-out infinite' : 'none',
        }}
      />
      {speaking && (
        <>
          <span style={{ position: 'absolute', top: -2, right: -4, color: '#38bdf8', fontSize: 12, animation: 'genieSpark 1.1s ease-in-out infinite' }}>{STAR}</span>
          <span style={{ position: 'absolute', top: 36, left: -8, color: '#a78bfa', fontSize: 10, animation: 'genieSpark 0.9s ease-in-out infinite 0.4s' }}>{STAR}</span>
          <span style={{ position: 'absolute', bottom: 6, right: -10, color: '#fbbf24', fontSize: 14, animation: 'genieSpark 1.3s ease-in-out infinite 0.2s' }}>{STAR}</span>
        </>
      )}
    </div>
  );
}
