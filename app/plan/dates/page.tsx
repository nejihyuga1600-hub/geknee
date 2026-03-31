'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function nightsBetween(a: string, b: string) {
  if (!a || !b) return null;
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
  return diff > 0 ? Math.round(diff) : null;
}

const INPUT: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 12,
  color: '#fff',
  fontSize: 16,
  padding: '12px 16px',
  width: '100%',
  outline: 'none',
  colorScheme: 'dark',
  boxSizing: 'border-box',
};

function DatesForm() {
  const params = useSearchParams();
  const router = useRouter();

  const location       = params.get('location')    ?? '';
  const purpose        = params.get('purpose')     ?? '';
  const style          = params.get('style')       ?? '';
  const budget         = params.get('budget')      ?? '';
  const interests      = params.get('interests')   ?? '';
  const constraints    = params.get('constraints') ?? '';
  const extraCitiesRaw = params.get('extraCities') ?? '';

  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [fromCity, setFromCity]   = useState(params.get('travelingFrom') ?? '');

  const [cities, setCities] = useState<string[]>(() =>
    extraCitiesRaw
      ? extraCitiesRaw.split(',').filter(Boolean).map(c => c.trim())
      : []
  );
  const [cityInput, setCityInput] = useState('');
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'done' | 'denied'>('idle');

  // Auto-fill origin city from browser geolocation on first load (only if field is empty)
  useEffect(() => {
    if (fromCity || !navigator.geolocation) return;
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { longitude, latitude } = pos.coords;
          const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${key}`
          );
          const data = await res.json() as { status: string; results?: Array<{ address_components: Array<{ long_name: string; types: string[] }>; formatted_address: string }> };
          const comps = data.results?.[0]?.address_components;
          const city = comps?.find(c => c.types.includes('locality'))?.long_name
            ?? data.results?.[0]?.formatted_address?.split(',')[0]?.trim();
          if (city) {
            setFromCity(city);
            setGeoStatus('done');
          } else {
            setGeoStatus('idle');
          }
        } catch {
          setGeoStatus('idle');
        }
      },
      () => setGeoStatus('denied'),
      { timeout: 8000 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalNights = nightsBetween(startDate, endDate);
  const allValid    = !!totalNights;

  function addCity() {
    const t = cityInput.trim();
    if (t && !cities.includes(t)) setCities(c => [...c, t]);
    setCityInput('');
  }

  function removeCity(name: string) {
    setCities(c => c.filter(x => x !== name));
  }

  function handleNext() {
    if (!allValid) return;
    const q = new URLSearchParams({
      location, purpose, style, budget, interests, constraints,
      startDate, endDate, nights: String(totalNights),
    });
    if (fromCity.trim()) q.set('travelingFrom', fromCity.trim());
    if (cities.length > 0) {
      q.set('stops', JSON.stringify(cities.map(city => ({ city }))));
    }
    router.push(`/plan/summary?${q.toString()}`);
  }

  return (
    <main style={{
      minHeight: '100vh', background: '#060816',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 16px',
      fontFamily: "'Segoe UI',system-ui,sans-serif",
    }}>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 40% 45%, rgba(30,70,200,0.4) 0%, rgba(6,8,22,0.96) 58%, #030510 100%)',
      }} />

      <div style={{
        position: 'relative', zIndex: 10,
        background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.13)',
        borderRadius: 24, padding: '40px 36px',
        maxWidth: 560, width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Progress */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Step 3 of 4</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>75%</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 999 }}>
            <div style={{ height: '100%', width: '75%', borderRadius: 999, background: 'linear-gradient(90deg,#38bdf8,#818cf8)' }} />
          </div>
        </div>

        <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 700, marginBottom: 6 }}>When are you going?</h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginBottom: 28 }}>
          {cities.length > 0
            ? 'Set your overall trip dates — GeKnee will plan the optimal schedule between cities.'
            : location
              ? <>Heading to: <span style={{ color: '#38bdf8' }}>{location}</span></>
              : 'Set your travel dates.'}
        </p>

        {/* Where are you traveling from? */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>
            Where are you traveling from?
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder={geoStatus === 'loading' ? 'Detecting your location...' : 'e.g. New York, London, Sydney...'}
              value={fromCity}
              onChange={e => setFromCity(e.target.value)}
              style={{ ...INPUT, fontSize: 15, paddingRight: geoStatus === 'loading' ? 42 : 16 }}
            />
            {geoStatus === 'loading' && (
              <span style={{
                position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                width: 16, height: 16, borderRadius: '50%',
                border: '2px solid rgba(56,189,248,0.3)',
                borderTopColor: '#38bdf8',
                animation: 'spin 0.8s linear infinite',
                display: 'inline-block',
              }} />
            )}
          </div>
          <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
        </div>

        {/* Departure / Return dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>Departure</label>
            <input type="date" min={today} value={startDate}
              onChange={e => setStartDate(e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block', marginBottom: 6 }}>Return</label>
            <input type="date" min={startDate || today} value={endDate}
              onChange={e => setEndDate(e.target.value)} style={INPUT} />
          </div>
        </div>

        {totalNights !== null && (
          <p style={{ color: '#38bdf8', fontSize: 13, textAlign: 'center', margin: '0 0 24px' }}>
            {totalNights} night{totalNights !== 1 ? 's' : ''} total
            {cities.length > 0
              ? ' \u2014 GeKnee will split time between cities'
              : location ? ` in ${location}` : ''}
          </p>
        )}

        {/* Extra city chips */}
        {cities.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#818cf8', fontSize: 14 }}>{String.fromCodePoint(0x2728)}</span>
              AI will schedule optimal time at each stop
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cities.map(city => (
                <div key={city} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)',
                  borderRadius: 999, padding: '5px 10px 5px 13px',
                  color: '#fbbf24', fontSize: 13, fontWeight: 600,
                }}>
                  {city}
                  <button
                    onClick={() => removeCity(city)}
                    style={{ background: 'none', border: 'none', color: 'rgba(251,191,36,0.55)', fontSize: 15, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add a stop input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          <input
            placeholder={cities.length > 0 ? 'Add another stop...' : '+ Add a stop to your trip...'}
            value={cityInput}
            onChange={e => setCityInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCity()}
            style={{ ...INPUT, fontSize: 14 }}
          />
          {cityInput.trim() && (
            <button
              onClick={addCity}
              style={{
                padding: '12px 16px', borderRadius: 12, border: 'none', flexShrink: 0,
                background: 'rgba(56,189,248,0.7)', color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Add
            </button>
          )}
        </div>

        {/* Nav */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => router.back()}
            style={{
              flex: 1, padding: '15px 0', borderRadius: 14,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.7)', fontSize: 15, cursor: 'pointer',
            }}
          >
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!allValid}
            style={{
              flex: 2, padding: '15px 0', borderRadius: 14, border: 'none',
              background: allValid ? 'linear-gradient(135deg,#38bdf8,#818cf8)' : 'rgba(255,255,255,0.1)',
              color: allValid ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 15, fontWeight: 600, cursor: allValid ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
            }}
          >
            See my trip plan {String.fromCodePoint(0x2192)}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function DatesPage() {
  return (
    <Suspense>
      <DatesForm />
    </Suspense>
  );
}
