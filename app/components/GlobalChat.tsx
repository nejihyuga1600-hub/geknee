'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { flyToGlobe, zoomCamera } from '@/lib/globeAnim';
import { GenieAvatar } from './GenieCharacters';
import { useSelectedGenie } from './GenieSelector';

const GenieSelector = dynamic(() => import('./GenieSelector'), { ssr: false });

interface ChatMessage { role: 'user' | 'assistant'; content: string; }

// ─── Page context hook ────────────────────────────────────────────────────────

function usePageContext() {
  const pathname   = usePathname();
  const params     = useSearchParams();

  const location      = params.get('location')      ?? '';
  const purpose       = params.get('purpose')       ?? '';
  const style         = params.get('style')         ?? '';
  const budget        = params.get('budget')        ?? '';
  const interests     = params.get('interests')     ?? '';
  const nights        = params.get('nights')        ?? '';
  const startDate     = params.get('startDate')     ?? '';
  const endDate       = params.get('endDate')       ?? '';
  const travelingFrom = params.get('travelingFrom') ?? '';

  const page = pathname === '/plan/style'   ? 'style'
             : pathname === '/plan/dates'   ? 'dates'
             : pathname === '/plan/summary' ? 'summary'
             : pathname === '/plan/book'    ? 'book'
             : 'globe';

  const placeholders: Record<string, string> = {
    globe:   'Ask me where to go next...',
    style:   'Ask me about travel styles or preferences...',
    dates:   'Ask me about the best time to visit...',
    summary: 'Ask me about your itinerary...',
    book:    'Ask me about flights, hotels, or activities...',
  };

  const pageDesc =
    page === 'globe'   ? 'The user is on the globe destination discovery page, browsing the interactive 3D globe to choose a travel destination.'
    : page === 'style' ? `The user is on the travel preferences page, setting up a trip to ${location || 'their destination'}. They are selecting: travel purpose, style (${style || 'not yet chosen'}), budget (${budget || 'not yet set'}), interests (${interests || 'none yet'}), departure city, and arrival airport.`
    : page === 'dates' ? `The user is selecting travel dates for ${location || 'their destination'}. They are choosing departure and return dates and setting up multi-city stops if any.`
    : page === 'summary' ? `The user is viewing their AI-generated itinerary for ${location} — ${nights} nights, ${startDate} to ${endDate}. Purpose: ${purpose}. Style: ${style}. Budget: ${budget}.`
    : `The user is on the booking page for ${location} (${nights} nights, ${startDate}–${endDate}). They are booking flights from ${travelingFrom || 'their origin'}, hotels, and activities.`;

  return { page, pageDesc, placeholder: placeholders[page], location, purpose, style, budget, nights, startDate, endDate, travelingFrom };
}

// ─── Inner component (uses hooks that need Suspense) ─────────────────────────

function GlobalChatInner() {
  const pathname = usePathname();
  const ctx      = usePageContext();

  // Don't render on summary page — it has its own inline chat
  if (pathname === '/plan/summary') return null;

  return <GlobalChatUI ctx={ctx} />;
}

// ─── Main UI ─────────────────────────────────────────────────────────────────

function GlobalChatUI({ ctx }: { ctx: ReturnType<typeof usePageContext> }) {
  const router = useRouter();

  const { genieId } = useSelectedGenie();
  const [open, setOpen]               = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);

  // Destination input (globe page only)
  const [destInput,     setDestInput]     = useState('');
  const [destLoading,   setDestLoading]   = useState(false);
  const [destError,     setDestError]     = useState('');
  const [destFlying,    setDestFlying]    = useState(''); // city name while animating
  const [confirming,    setConfirming]    = useState(''); // city name waiting for confirmation
  const [confirmLoc,    setConfirmLoc]    = useState(''); // encoded location for push
  const destRef = useRef<HTMLInputElement>(null);

  // Inspiration image/video upload
  const [imageFile,    setImageFile]    = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isVideo,      setIsVideo]      = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const endRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (open && ctx.page !== 'globe') inputRef.current?.focus(); }, [open, ctx.page]);
  useEffect(() => { if (open && ctx.page === 'globe') destRef.current?.focus(); }, [open, ctx.page]);

  // Listen for globe / landmark clicks from the 3D canvas
  useEffect(() => {
    if (ctx.page !== 'globe') return;
    const handler = (e: Event) => {
      const loc = (e as CustomEvent<{ location: string }>).detail.location;
      setOpen(true);
      setDestError('');
      if (loc) {
        setConfirming(loc);
        setConfirmLoc(encodeURIComponent(loc));
        setDestInput('');
      } else {
        setConfirming('');
        setConfirmLoc('');
        setDestInput('');
        setTimeout(() => destRef.current?.focus(), 80);
      }
    };
    window.addEventListener('geknee:globeselect', handler);
    return () => window.removeEventListener('geknee:globeselect', handler);
  }, [ctx.page]);

  const handleDest = useCallback(async () => {
    const city = destInput.trim();
    if (!city || destLoading) return;
    setDestError('');
    setDestLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'GeKnee-travel-app' } },
      );
      const data = await res.json() as Array<{ lat: string; lon: string; display_name: string }>;
      if (!data.length) { setDestError('City not found — try adding the country (e.g. "Lyon, France").'); setDestLoading(false); return; }
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      setDestFlying(city);
      // Phase 1: rotate globe to face (lat, lon)
      flyToGlobe(lat, lon, () => {
        // Phase 2: zoom camera in close enough to show city labels
        zoomCamera(13, () => {
          setDestFlying('');
          setDestLoading(false);
          setConfirming(city);
          setConfirmLoc(encodeURIComponent(city));
          setOpen(true);
          setDestInput('');
          setTimeout(() => destRef.current?.focus(), 80);
        });
      });
    } catch {
      setDestError('Could not geocode — check your connection.');
      setDestLoading(false);
    }
  }, [destInput, destLoading]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const video = file.type.startsWith('video/');
    setIsVideo(video);

    if (video) {
      // Extract first frame from video for preview + Vision API
      const videoEl = document.createElement('video');
      const objUrl  = URL.createObjectURL(file);
      videoEl.src          = objUrl;
      videoEl.currentTime  = 1;
      videoEl.muted        = true;
      videoEl.playsInline  = true;
      videoEl.onloadeddata = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = videoEl.videoWidth  || 640;
        canvas.height = videoEl.videoHeight || 360;
        canvas.getContext('2d')?.drawImage(videoEl, 0, 0);
        URL.revokeObjectURL(objUrl);
        canvas.toBlob(blob => {
          if (!blob) return;
          const frameFile = new File([blob], 'frame.jpg', { type: 'image/jpeg' });
          setImageFile(frameFile);
          setImagePreview(canvas.toDataURL('image/jpeg', 0.8));
        }, 'image/jpeg', 0.8);
      };
      videoEl.onerror = () => URL.revokeObjectURL(objUrl);
    } else {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  }, []);

  const clearImage = useCallback(() => {
    if (imagePreview && !imagePreview.startsWith('data:')) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview('');
    setIsVideo(false);
  }, [imagePreview]);

  const sendGenie = useCallback(async () => {
    if ((!input.trim() && !imageFile) || streaming) return;

    // ── Image inspiration flow ──
    if (imageFile) {
      const caption = input.trim() || 'What travel destinations or experiences does this inspire?';
      const userMsg: ChatMessage = { role: 'user', content: `${String.fromCodePoint(0x1F4F8)} ${caption}` };
      setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }]);
      setInput('');
      clearImage();
      setStreaming(true);
      try {
        const form = new FormData();
        form.append('image', imageFile);
        form.append('prompt', caption);
        const res = await fetch('/api/inspiration', { method: 'POST', body: form });
        if (!res.body) throw new Error('no body');
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: acc }]);
        }
      } catch {
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: 'Could not analyze the image. Please try again.' }]);
      } finally {
        setStreaming(false);
      }
      return;
    }

    // ── Regular text chat flow ──
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const next = [...messages, userMsg];
    setMessages([...next, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    try {
      const itinerary = typeof window !== 'undefined'
        ? (sessionStorage.getItem('geknee_itinerary') ?? '') : '';
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          itinerary,
          pageContext: ctx.pageDesc,
          tripInfo: {
            location: ctx.location,
            nights:   ctx.nights,
            purpose:  ctx.purpose,
            style:    ctx.style,
            budget:   ctx.budget,
          },
        }),
      });
      if (!res.body) throw new Error('no body');
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: acc }]);
      }
    } catch {
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: 'My magic fizzled! Please try again.' }]);
    } finally {
      setStreaming(false);
    }
  }, [input, imageFile, streaming, messages, ctx, clearImage]);

  return (
    <>
      {/* Genie selector modal */}
      {selectorOpen && <GenieSelector onClose={() => setSelectorOpen(false)} />}

      {/* Floating toggle button */}
      <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9000 }}>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            style={{
              width: 68, height: 68, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'radial-gradient(circle at 40% 40%, #1e3a7a, #0d1a40)',
              boxShadow: '0 4px 24px rgba(59,130,246,0.5), 0 0 0 2px rgba(245,197,24,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 6, overflow: 'hidden',
              animation: 'geniePulse 2.5s ease-in-out infinite',
            }}
            title="Open GeKnee AI Genie"
          >
            <img src="/Geknee.png" alt="GeKnee Genie" style={{ width: 62, height: 62, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(167,139,250,0.7))' }} />
          </button>
        )}

        {/* Chat panel */}
        {open && (
          <div style={{
            position: 'absolute', bottom: 68, right: 0, width: 340, maxHeight: '65vh',
            background: 'rgba(6,8,22,0.97)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(129,140,248,0.3)', borderRadius: 20,
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(167,139,250,0.08)',
            animation: 'chatSlideUp 0.22s ease-out', overflow: 'hidden',
            zIndex: 9001,
          }}>
            {/* Header */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(129,140,248,0.15)', background: 'rgba(109,40,217,0.12)', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setSelectorOpen(true)}
                  title="Change your Genie"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, lineHeight: 0 }}
                >
                  <GenieAvatar id={genieId} size={34} />
                </button>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>
                {String.fromCodePoint(0x00D7)}
              </button>
            </div>

            {/* ── Destination input (globe page only) ── */}
            {ctx.page === 'globe' && (
              <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {destFlying ? (
                  /* ── Animating to location ── */
                  <div style={{ textAlign: 'center', color: '#a78bfa', fontSize: 13, fontWeight: 600, padding: '6px 0' }}>
                    {String.fromCodePoint(0x1F30D)} Flying to {destFlying}...
                  </div>
                ) : confirming ? (
                  /* ── Confirmation step ── */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.04em', textAlign: 'center' }}>
                      READY TO PLAN YOUR TRIP?
                    </div>
                    <div style={{ textAlign: 'center', color: '#e2e8f0', fontSize: 15, fontWeight: 700 }}>
                      {confirming}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => router.push(`/plan/style?location=${confirmLoc}`)}
                        style={{
                          flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                          background: 'linear-gradient(135deg,#06b6d4,#6366f1)', color: '#fff',
                          fontSize: 13, fontWeight: 700,
                        }}
                      >
                        Yes, let&apos;s go! {String.fromCodePoint(0x27A4)}
                      </button>
                      <button
                        onClick={() => { setConfirming(''); setConfirmLoc(''); setDestInput(''); setDestError(''); zoomCamera(26); }}
                        style={{
                          padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
                          cursor: 'pointer', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.65)',
                          fontSize: 12,
                        }}
                      >
                        Change
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Default destination input ── */
                  <>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 7, fontWeight: 600, letterSpacing: '0.04em' }}>
                      WHERE DO YOU WANT TO TRAVEL?
                    </div>
                    <div style={{ display: 'flex', gap: 7 }}>
                      <input
                        ref={destRef}
                        value={destInput}
                        onChange={e => { setDestInput(e.target.value); setDestError(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') handleDest(); }}
                        placeholder="City or country..."
                        disabled={destLoading}
                        style={{
                          flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(129,140,248,0.3)',
                          borderRadius: 10, color: '#fff', fontSize: 13, padding: '9px 12px', outline: 'none',
                        }}
                      />
                      <button
                        onClick={handleDest}
                        disabled={destLoading || !destInput.trim()}
                        style={{
                          width: 38, height: 38, borderRadius: 10, border: 'none', flexShrink: 0,
                          background: destInput.trim() && !destLoading ? 'linear-gradient(135deg,#06b6d4,#6366f1)' : 'rgba(255,255,255,0.08)',
                          color: '#fff', fontSize: 15, cursor: destInput.trim() && !destLoading ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {destLoading ? (
                          <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                        ) : String.fromCodePoint(0x27A4)}
                      </button>
                    </div>
                    {destError && <div style={{ fontSize: 11, color: '#f87171', marginTop: 5 }}>{destError}</div>}
                  </>
                )}
              </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 && (() => {
                const examples: Record<string, string[]> = {
                  globe:   ['Best places for beaches', 'Hidden gems in Asia', 'Where to go with kids?'],
                  style:   ['What travel style suits a foodie?', 'Difference between budget and backpacker?', 'Best style for solo travel?'],
                  dates:   ['Best month to visit Tokyo', 'When is cherry blossom season in Japan?', 'Avoid monsoon in Southeast Asia?'],
                  summary: ['Swap Day 2 dinner for something local', 'What should I pack?', 'Is this itinerary too packed?'],
                  book:    ['Best hotels near the city center', 'Tips for finding cheap flights', 'Should I book activities in advance?'],
                };
                const tips = examples[ctx.page] ?? examples.globe;
                return (
                  <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6, padding: '0 2px' }}>
                    <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 10, textAlign: 'center', fontWeight: 700, letterSpacing: '0.08em', margin: '0 0 4px' }}>
                      TRY ASKING
                    </p>
                    {tips.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => setInput(ex)}
                        style={{
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
                          borderRadius: 8, color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: '7px 11px',
                          cursor: 'pointer', textAlign: 'left', lineHeight: 1.4, transition: 'background 0.15s',
                        }}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                );
              })()}
              {messages.map((msg, i) => (
                <div key={i} style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%', padding: '9px 13px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg,rgba(56,189,248,0.2),rgba(129,140,248,0.2))'
                    : 'rgba(255,255,255,0.07)',
                  border: msg.role === 'user'
                    ? '1px solid rgba(56,189,248,0.3)'
                    : '1px solid rgba(255,255,255,0.08)',
                  color: '#e2e8f0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                  {i === messages.length - 1 && msg.role === 'assistant' && streaming && (
                    <span style={{ display: 'inline-block', width: 2, height: 12, background: '#a78bfa', marginLeft: 2, animation: 'blink 0.9s step-end infinite', verticalAlign: 'text-bottom' }} />
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>

            {/* Image preview */}
            {imagePreview && (
              <div style={{ padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={imagePreview} alt="inspiration preview" style={{ height: 52, width: 72, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(129,140,248,0.4)' }} />
                  {isVideo && (
                    <div style={{ position: 'absolute', top: 3, left: 3, background: 'rgba(0,0,0,0.65)', borderRadius: 4, fontSize: 9, color: '#fff', padding: '1px 4px', fontWeight: 700, letterSpacing: '0.04em' }}>
                      VIDEO
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                  {String.fromCodePoint(0x2728)} {isVideo ? 'Video frame captured' : 'Image ready'} — add a caption or send now
                </div>
                <button onClick={clearImage} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
                  {String.fromCodePoint(0x00D7)}
                </button>
              </div>
            )}

            {/* Input */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleFileSelect} />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Add inspiration image"
                style={{
                  width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
                  background: imageFile ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.06)',
                  color: imageFile ? '#a78bfa' : 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >{String.fromCodePoint(0x1F4F7)}</button>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGenie(); } }}
                placeholder={imageFile ? 'Add a caption (optional)...' : ctx.placeholder}
                disabled={streaming}
                style={{ flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff', fontSize: 13, padding: '9px 12px', outline: 'none' }}
              />
              <button
                onClick={sendGenie}
                disabled={streaming || (!input.trim() && !imageFile)}
                style={{
                  width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
                  background: (input.trim() || imageFile) && !streaming ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'rgba(255,255,255,0.08)',
                  color: '#fff', fontSize: 15, cursor: (input.trim() || imageFile) && !streaming ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >{String.fromCodePoint(0x27A4)}</button>
            </div>
          </div>
        )}

        {/* Close button when open */}
        {open && (
          <button
            onClick={() => setOpen(false)}
            style={{
              width: 68, height: 68, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'radial-gradient(circle at 40% 40%, #1e3a7a, #0d1a40)',
              boxShadow: '0 4px 24px rgba(59,130,246,0.5), 0 0 0 2px rgba(245,197,24,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 6, overflow: 'hidden', position: 'relative',
            }}
          >
            <img src="/Geknee.png" alt="GeKnee Genie" style={{ width: 62, height: 62, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(167,139,250,0.7)) brightness(0.7)' }} />
            <span style={{ position: 'absolute', fontSize: 18, color: '#fff', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{String.fromCodePoint(0x00D7)}</span>
          </button>
        )}
      </div>
    </>
  );
}

// ─── Export with Suspense boundary ───────────────────────────────────────────

export default function GlobalChat() {
  return (
    <Suspense fallback={null}>
      <GlobalChatInner />
    </Suspense>
  );
}
