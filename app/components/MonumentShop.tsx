'use client';
import { useState, useEffect, useCallback } from 'react';

// ─── Monument + Mission Data ──────────────────────────────────────────────────

export type Rarity = 'common' | 'rare' | 'legendary';
export type Skin   = { id: string; name: string; reward: string; color: string };

export type Monument = {
  id: string;
  name: string;
  location: string;
  cityKeys: string[];   // substrings matched against saved trip locations (lowercase)
  emoji: string;
  rarity: Rarity;
  fact: string;
  missions: { id: string; label: string; skin: Skin }[];
};

const SKIN_GOLD:    Skin = { id: 'gold',      name: 'Gold',      reward: 'Golden skin', color: '#f59e0b' };
const SKIN_NIGHT:   Skin = { id: 'night',     name: 'Night',     reward: 'Night sky skin', color: '#6366f1' };
const SKIN_CRYSTAL: Skin = { id: 'crystal',   name: 'Crystal',   reward: 'Crystal skin', color: '#22d3ee' };
const SKIN_LEGEND:  Skin = { id: 'legendary', name: 'Legendary', reward: 'Legendary glow skin', color: '#ec4899' };

export const MONUMENTS: Monument[] = [
  {
    id: 'eiffelTower', name: 'Eiffel Tower', location: 'Paris, France',
    cityKeys: ['paris'], emoji: '🗼', rarity: 'rare',
    fact: 'Its iron expands in summer heat — the tower grows up to 15 cm taller on a hot day.',
    missions: [
      { id: 'eiffelTower_night',  label: 'Visit the tower after dark when it sparkles', skin: SKIN_NIGHT },
      { id: 'eiffelTower_picnic', label: 'Have a picnic on the Champ de Mars below',    skin: SKIN_GOLD },
      { id: 'eiffelTower_top',    label: 'Reach the summit observation deck',            skin: SKIN_CRYSTAL },
    ],
  },
  {
    id: 'colosseum', name: 'The Colosseum', location: 'Rome, Italy',
    cityKeys: ['rome', 'roma'], emoji: '🏛️', rarity: 'legendary',
    fact: '80 numbered arches let 50,000 spectators find seats and exit in minutes.',
    missions: [
      { id: 'colosseum_gladiator', label: 'Try on a gladiator costume outside the gates', skin: SKIN_LEGEND },
      { id: 'colosseum_night',     label: 'See the Colosseum illuminated at night',       skin: SKIN_NIGHT },
      { id: 'colosseum_forum',     label: 'Walk through the Roman Forum next door',       skin: SKIN_GOLD },
    ],
  },
  {
    id: 'tajMahal', name: 'Taj Mahal', location: 'Agra, India',
    cityKeys: ['agra', 'india'], emoji: '🕌', rarity: 'legendary',
    fact: 'Emperor Shah Jahan hired 20,000 workers for 22 years to build this perfect marble mausoleum.',
    missions: [
      { id: 'tajMahal_sunrise',  label: 'Photograph the Taj at sunrise from the reflecting pool', skin: SKIN_GOLD },
      { id: 'tajMahal_shoes',    label: 'Remove your shoes and walk barefoot on the plinth',       skin: SKIN_CRYSTAL },
      { id: 'tajMahal_moonlit',  label: 'Visit on a full moon night tour',                         skin: SKIN_LEGEND },
    ],
  },
  {
    id: 'greatWall', name: 'Great Wall of China', location: 'Beijing, China',
    cityKeys: ['beijing', 'china', 'badaling'], emoji: '🏯', rarity: 'legendary',
    fact: 'At 13,170 miles long it could circle the Earth more than half a time.',
    missions: [
      { id: 'greatWall_hike',   label: 'Hike an unrestored section of the wall',          skin: SKIN_LEGEND },
      { id: 'greatWall_photo',  label: 'Capture the wall disappearing into the mountains', skin: SKIN_NIGHT },
      { id: 'greatWall_banner', label: 'Reach a watchtower banner viewpoint',              skin: SKIN_GOLD },
    ],
  },
  {
    id: 'statueLiberty', name: 'Statue of Liberty', location: 'New York, USA',
    cityKeys: ['new york', 'nyc'], emoji: '🗽', rarity: 'rare',
    fact: "Lady Liberty's index finger is 2.4 m long — roughly the height of an adult standing upright.",
    missions: [
      { id: 'statueLiberty_crown', label: 'Climb all the way up to Lady Liberty\'s crown', skin: SKIN_LEGEND },
      { id: 'statueLiberty_ferry', label: 'Take the Staten Island Ferry for a free view',  skin: SKIN_CRYSTAL },
      { id: 'statueLiberty_night', label: 'Photograph Lady Liberty illuminated at dusk',    skin: SKIN_NIGHT },
    ],
  },
  {
    id: 'sagradaFamilia', name: 'Sagrada Família', location: 'Barcelona, Spain',
    cityKeys: ['barcelona', 'spain'], emoji: '⛪', rarity: 'rare',
    fact: 'Construction began in 1882 and is still ongoing — the world\'s most ambitious unfinished building.',
    missions: [
      { id: 'sagrada_tower',   label: 'Climb one of the Nativity facade towers', skin: SKIN_GOLD },
      { id: 'sagrada_light',   label: 'Stand inside during the magical morning light show', skin: SKIN_CRYSTAL },
      { id: 'sagrada_sketch',  label: 'Sketch or paint the facade from the park opposite',  skin: SKIN_NIGHT },
    ],
  },
  {
    id: 'machuPicchu', name: 'Machu Picchu', location: 'Cusco, Peru',
    cityKeys: ['cusco', 'peru', 'machu picchu'], emoji: '🏔️', rarity: 'legendary',
    fact: 'Perched at 2,430 m in the clouds, this Inca citadel was unknown to the outside world until 1911.',
    missions: [
      { id: 'machu_gate',    label: 'Reach the Sun Gate (Inti Punku) by hiking the Inca Trail', skin: SKIN_LEGEND },
      { id: 'machu_llama',   label: 'Get photobombed by one of the resident llamas',            skin: SKIN_GOLD },
      { id: 'machu_sunrise', label: 'Watch the sunrise illuminate the ruins from Waynapicchu',  skin: SKIN_CRYSTAL },
    ],
  },
  {
    id: 'christRedeem', name: 'Christ the Redeemer', location: 'Rio de Janeiro, Brazil',
    cityKeys: ['rio', 'rio de janeiro', 'brazil'], emoji: '✝️', rarity: 'rare',
    fact: "Its outstretched arms span 28 metres — wide enough to cast a shadow over a full-size swimming pool.",
    missions: [
      { id: 'christ_train',  label: 'Ride the cogwheel train up Corcovado through the rainforest', skin: SKIN_GOLD },
      { id: 'christ_arms',   label: 'Strike the famous arms-out pose with the statue behind you',  skin: SKIN_CRYSTAL },
      { id: 'christ_cloud',  label: 'Visit when the clouds roll in and the statue disappears',     skin: SKIN_NIGHT },
    ],
  },
  {
    id: 'angkorWat', name: 'Angkor Wat', location: 'Siem Reap, Cambodia',
    cityKeys: ['siem reap', 'cambodia', 'angkor'], emoji: '🛕', rarity: 'legendary',
    fact: 'The largest religious monument on Earth — its moat alone could swallow 100 Olympic swimming pools.',
    missions: [
      { id: 'angkor_sunrise', label: 'Watch the sunrise reflect the towers in the moat', skin: SKIN_GOLD },
      { id: 'angkor_monk',    label: 'Receive a blessing from a resident monk',          skin: SKIN_LEGEND },
      { id: 'angkor_bike',    label: 'Explore the entire complex by bicycle',             skin: SKIN_CRYSTAL },
    ],
  },
  {
    id: 'pyramidGiza', name: 'Great Pyramid of Giza', location: 'Cairo, Egypt',
    cityKeys: ['cairo', 'egypt', 'giza'], emoji: '🔺', rarity: 'legendary',
    fact: 'Built from 2.3 million stone blocks, it was the world\'s tallest structure for 3,800 years.',
    missions: [
      { id: 'pyramid_camel',  label: 'Ride a camel around the Giza plateau',              skin: SKIN_GOLD },
      { id: 'pyramid_sphinx', label: 'Photograph the Sphinx with a pyramid perfectly aligned behind it', skin: SKIN_CRYSTAL },
      { id: 'pyramid_inside', label: 'Descend into the Grand Gallery inside the pyramid', skin: SKIN_LEGEND },
    ],
  },
  {
    id: 'goldenGate', name: 'Golden Gate Bridge', location: 'San Francisco, USA',
    cityKeys: ['san francisco', 'sf'], emoji: '🌉', rarity: 'common',
    fact: 'Its suspension cables contain 80,000 miles of steel wire — enough to wrap the Earth three times.',
    missions: [
      { id: 'golden_walk',   label: 'Walk or cycle the full length of the bridge', skin: SKIN_GOLD },
      { id: 'golden_fog',    label: 'Photograph the bridge shrouded in morning fog', skin: SKIN_NIGHT },
      { id: 'golden_kayak',  label: 'Paddle a kayak under the bridge from below',   skin: SKIN_CRYSTAL },
    ],
  },
  {
    id: 'bigBen', name: 'Big Ben', location: 'London, UK',
    cityKeys: ['london', 'england', 'uk'], emoji: '🕰️', rarity: 'common',
    fact: 'Big Ben is actually the bell, not the tower — the tower is officially the Elizabeth Tower.',
    missions: [
      { id: 'bigben_chime',  label: 'Stand outside when the famous chimes ring on the hour',  skin: SKIN_GOLD },
      { id: 'bigben_bridge', label: 'Photograph Big Ben from Westminster Bridge at blue hour', skin: SKIN_NIGHT },
      { id: 'bigben_tour',   label: 'Join an official Houses of Parliament guided tour',       skin: SKIN_CRYSTAL },
    ],
  },
  {
    id: 'acropolis', name: 'Acropolis of Athens', location: 'Athens, Greece',
    cityKeys: ['athens', 'greece'], emoji: '🏛️', rarity: 'rare',
    fact: 'The Parthenon\'s columns lean inward slightly — a deliberate optical illusion so they look straight.',
    missions: [
      { id: 'acropolis_parthenon', label: 'Watch the sunset paint the Parthenon golden from Filopappou Hill', skin: SKIN_GOLD },
      { id: 'acropolis_museum',   label: 'Visit the Acropolis Museum and see the original carvings',         skin: SKIN_CRYSTAL },
      { id: 'acropolis_full',     label: 'Identify all five structures on the Acropolis hill',               skin: SKIN_LEGEND },
    ],
  },
  {
    id: 'sydneyOpera', name: 'Sydney Opera House', location: 'Sydney, Australia',
    cityKeys: ['sydney', 'australia'], emoji: '🎭', rarity: 'rare',
    fact: 'Its 1,056,000 roof tiles were made in Sweden — and they self-clean in the rain.',
    missions: [
      { id: 'sydney_show',    label: 'Attend a live performance inside the Opera House', skin: SKIN_LEGEND },
      { id: 'sydney_ferry',   label: 'Photograph it from the harbour ferry at golden hour', skin: SKIN_GOLD },
      { id: 'sydney_roof',    label: 'Complete the BridgeClimb and see it from the Harbour Bridge', skin: SKIN_CRYSTAL },
    ],
  },
  {
    id: 'tokyoSkytree', name: 'Tokyo Skytree', location: 'Tokyo, Japan',
    cityKeys: ['tokyo', 'japan'], emoji: '📡', rarity: 'rare',
    fact: 'At exactly 634 m it\'s the world\'s tallest tower — the height spells the old name of the region in Japanese.',
    missions: [
      { id: 'skytree_top',     label: 'Reach the Tembo Galleria at 451 m for panoramic views', skin: SKIN_CRYSTAL },
      { id: 'skytree_night',   label: 'Photograph the tower reflected in the Sumida River at night', skin: SKIN_NIGHT },
      { id: 'skytree_hanami',  label: 'Visit during cherry blossom season with the tower in the background', skin: SKIN_GOLD },
    ],
  },
  {
    id: 'colmarAlsace', name: 'Neuschwanstein Castle', location: 'Bavaria, Germany',
    cityKeys: ['germany', 'munich', 'bavaria', 'fussen'], emoji: '🏰', rarity: 'rare',
    fact: 'Walt Disney based Sleeping Beauty\'s castle on this fairytale palace — it was never finished.',
    missions: [
      { id: 'neuschwanstein_bridge', label: 'Cross the Marienbrücke bridge for the iconic castle view', skin: SKIN_GOLD },
      { id: 'neuschwanstein_snow',   label: 'Visit the castle in winter snow',                          skin: SKIN_CRYSTAL },
      { id: 'neuschwanstein_hike',   label: 'Hike up the mountain trail behind the castle',             skin: SKIN_NIGHT },
    ],
  },
  {
    id: 'iguazuFalls', name: 'Iguazu Falls', location: 'Argentina / Brazil',
    cityKeys: ['argentina', 'brazil', 'iguazu', 'iguacu', 'foz'], emoji: '💧', rarity: 'legendary',
    fact: 'Nearly 3 km wide — Eleanor Roosevelt reportedly gasped "Poor Niagara!" on first sight.',
    missions: [
      { id: 'iguazu_boat',  label: 'Take the speedboat ride directly into the spray zone', skin: SKIN_LEGEND },
      { id: 'iguazu_devil', label: 'Walk to the edge of the Devil\'s Throat viewpoint',    skin: SKIN_GOLD },
      { id: 'iguazu_both',  label: 'See the falls from both the Argentine AND Brazilian sides', skin: SKIN_CRYSTAL },
    ],
  },
  {
    id: 'victoriaFalls', name: 'Victoria Falls', location: 'Zimbabwe / Zambia',
    cityKeys: ['zimbabwe', 'zambia', 'victoria falls', 'livingstone'], emoji: '🌊', rarity: 'legendary',
    fact: 'At 1.7 km wide and 108 m tall, its mist cloud is visible from over 40 km away.',
    missions: [
      { id: 'victoria_swim',   label: 'Swim in Devil\'s Pool at the very edge of the falls (dry season)', skin: SKIN_LEGEND },
      { id: 'victoria_bridge', label: 'Bungee jump from the Victoria Falls Bridge',                       skin: SKIN_GOLD },
      { id: 'victoria_rain',   label: 'Stand in the spray — get completely soaked',                       skin: SKIN_CRYSTAL },
    ],
  },
  {
    id: 'stonehenge', name: 'Stonehenge', location: 'Wiltshire, England',
    cityKeys: ['england', 'uk', 'london', 'wiltshire', 'salisbury'], emoji: '🪨', rarity: 'rare',
    fact: 'The 25-tonne bluestones were dragged 200 miles from Wales around 2500 BC — how remains a mystery.',
    missions: [
      { id: 'stone_solstice', label: 'Attend a summer or winter solstice sunrise ceremony', skin: SKIN_LEGEND },
      { id: 'stone_inner',    label: 'Book a special access inner circle tour',             skin: SKIN_GOLD },
      { id: 'stone_crop',     label: 'Explore the surrounding prehistoric landscape and burial mounds', skin: SKIN_CRYSTAL },
    ],
  },
  {
    id: 'mtEverest', name: 'Mount Everest Base Camp', location: 'Nepal / Tibet',
    cityKeys: ['nepal', 'kathmandu', 'tibet', 'everest'], emoji: '🏔️', rarity: 'legendary',
    fact: 'The summit drifts about 40 mm north-east every year as the Indian plate pushes into Asia.',
    missions: [
      { id: 'everest_basecamp', label: 'Trek to Everest Base Camp (5,364 m)',               skin: SKIN_LEGEND },
      { id: 'everest_flight',   label: 'Take a mountain flight and see Everest from the air', skin: SKIN_GOLD },
      { id: 'everest_namche',   label: 'Reach the Namche Bazaar viewpoint at 3,440 m',      skin: SKIN_CRYSTAL },
    ],
  },
];

const RARITY_COLOR: Record<Rarity, string> = {
  common: '#34d399',
  rare: '#818cf8',
  legendary: '#f59e0b',
};
const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  legendary: 'Legendary',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type CollectedItem = { monumentId: string; skin: string };
type MissionItem   = { missionId: string };

interface Props {
  open: boolean;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MonumentShop({ open, onClose }: Props) {
  const [tab, setTab]         = useState<'collection' | 'missions'>('collection');
  const [collected, setCollected] = useState<CollectedItem[]>([]);
  const [missions,  setMissions]  = useState<MissionItem[]>([]);
  const [tripLocs,  setTripLocs]  = useState<string[]>([]);
  const [selected,  setSelected]  = useState<Monument | null>(null); // for missions view
  const [loading,   setLoading]   = useState(false);
  const [msg,       setMsg]       = useState('');
  const [filter,    setFilter]    = useState<'all' | 'unlocked' | 'locked'>('all');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/monuments');
      if (!res.ok) return;
      const data = await res.json() as { collected: CollectedItem[]; missions: MissionItem[]; tripLocations: string[] };
      setCollected(data.collected);
      setMissions(data.missions);
      setTripLocs(data.tripLocations);
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const isCollected = (id: string) => collected.some(c => c.monumentId === id && c.skin === 'default');
  const hasSkin     = (id: string, skin: string) => collected.some(c => c.monumentId === id && c.skin === skin);
  const missionDone = (mid: string) => missions.some(m => m.missionId === mid);
  const canUnlock   = (m: Monument) => !isCollected(m.id) && m.cityKeys.some(k => tripLocs.some(t => t.includes(k)));

  async function unlock(monument: Monument) {
    setLoading(true); setMsg('');
    const res = await fetch('/api/monuments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlock', monumentId: monument.id }),
    });
    const data = await res.json();
    if (res.ok) { setMsg(`${monument.name} added to your collection!`); await load(); }
    else setMsg(data.error ?? 'Error');
    setLoading(false);
  }

  async function completeMission(monument: Monument, mission: Monument['missions'][number]) {
    setLoading(true); setMsg('');
    const res = await fetch('/api/monuments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mission', monumentId: monument.id, missionId: mission.id, skin: mission.skin.id }),
    });
    const data = await res.json();
    if (res.ok) { setMsg(`Mission complete! ${mission.skin.reward} unlocked!`); await load(); }
    else setMsg(data.error ?? 'Error');
    setLoading(false);
  }

  const displayed = MONUMENTS.filter(m => {
    if (filter === 'unlocked') return isCollected(m.id);
    if (filter === 'locked')   return !isCollected(m.id);
    return true;
  });

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'linear-gradient(135deg,#0a0f1e,#0f172a,#1a0a2e)',
        border: '1px solid rgba(139,92,246,0.3)',
        borderRadius: 24, width: '92%', maxWidth: 560,
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(139,92,246,0.12)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#e0e7ff', letterSpacing: '-0.02em' }}>
                {String.fromCodePoint(0x1F3DB)} Monument Collection
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {collected.filter(c => c.skin === 'default').length} / {MONUMENTS.length} monuments unlocked
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 22, cursor: 'pointer', padding: 4 }}>
              {String.fromCodePoint(0x00D7)}
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: 'linear-gradient(90deg,#7c3aed,#a855f7,#ec4899)',
              width: `${(collected.filter(c => c.skin === 'default').length / MONUMENTS.length) * 100}%`,
              transition: 'width 0.6s ease',
            }} />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 0 }}>
            {(['collection', 'missions'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setSelected(null); }} style={{
                flex: 1, padding: '8px 0', borderRadius: '10px 10px 0 0',
                border: 'none',
                background: tab === t ? 'rgba(139,92,246,0.15)' : 'transparent',
                borderBottom: tab === t ? '2px solid #a855f7' : '2px solid transparent',
                color: tab === t ? '#c4b5fd' : 'rgba(255,255,255,0.35)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                textTransform: 'capitalize',
              }}>
                {t === 'collection' ? `${String.fromCodePoint(0x1F3C6)} Collection` : `${String.fromCodePoint(0x1F3AF)} Missions`}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>

          {/* Feedback message */}
          {msg && (
            <div style={{
              background: msg.includes('!') ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
              border: `1px solid ${msg.includes('!') ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
              borderRadius: 10, padding: '8px 14px', marginBottom: 12,
              fontSize: 13, color: msg.includes('!') ? '#6ee7b7' : '#fca5a5', textAlign: 'center',
            }}>
              {msg}
            </div>
          )}

          {/* ── COLLECTION TAB ─────────────────────────────────────────────── */}
          {tab === 'collection' && (
            <>
              {/* Filter pills */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {(['all', 'unlocked', 'locked'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding: '4px 12px', borderRadius: 99, border: '1px solid',
                    borderColor: filter === f ? '#a855f7' : 'rgba(255,255,255,0.12)',
                    background: filter === f ? 'rgba(168,85,247,0.15)' : 'transparent',
                    color: filter === f ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
                    fontSize: 12, cursor: 'pointer', textTransform: 'capitalize',
                  }}>
                    {f}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {displayed.map(m => {
                  const unlocked = isCollected(m.id);
                  const eligible = canUnlock(m);
                  return (
                    <div key={m.id} style={{
                      background: unlocked
                        ? 'linear-gradient(135deg,rgba(139,92,246,0.12),rgba(236,72,153,0.08))'
                        : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${unlocked ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: 14, padding: '14px 12px', cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: unlocked ? '0 4px 20px rgba(139,92,246,0.12)' : 'none',
                    }} onClick={() => { if (tab === 'collection' && unlocked) { setSelected(m); setTab('missions'); } }}>
                      {/* Emoji / silhouette */}
                      <div style={{
                        fontSize: 36, textAlign: 'center', marginBottom: 8,
                        filter: unlocked ? 'none' : 'brightness(0) drop-shadow(0 0 8px rgba(139,92,246,0.5))',
                        userSelect: 'none',
                      }}>
                        {m.emoji}
                      </div>

                      {/* Rarity badge */}
                      <div style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                        background: `${RARITY_COLOR[m.rarity]}20`,
                        border: `1px solid ${RARITY_COLOR[m.rarity]}50`,
                        color: RARITY_COLOR[m.rarity], fontSize: 9, fontWeight: 700,
                        letterSpacing: '0.05em', marginBottom: 6,
                      }}>
                        {RARITY_LABEL[m.rarity].toUpperCase()}
                      </div>

                      {/* Name */}
                      <div style={{
                        fontSize: 12, fontWeight: 700,
                        color: unlocked ? '#e0e7ff' : 'transparent',
                        textShadow: unlocked ? 'none' : '0 0 12px rgba(139,92,246,0.7)',
                        filter: unlocked ? 'none' : 'blur(4px)',
                        userSelect: 'none',
                        lineHeight: 1.3, marginBottom: 3,
                      }}>
                        {unlocked ? m.name : m.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
                        {unlocked ? m.location : '??? Unknown Location'}
                      </div>

                      {/* Skins strip */}
                      {unlocked && (
                        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                          {m.missions.map(ms => (
                            <div key={ms.id} title={ms.skin.name} style={{
                              width: 14, height: 14, borderRadius: '50%',
                              background: hasSkin(m.id, ms.skin.id) ? ms.skin.color : 'rgba(255,255,255,0.1)',
                              border: `1px solid ${hasSkin(m.id, ms.skin.id) ? ms.skin.color : 'rgba(255,255,255,0.15)'}`,
                            }} />
                          ))}
                        </div>
                      )}

                      {/* Action button */}
                      {!unlocked && eligible && (
                        <button
                          onClick={e => { e.stopPropagation(); unlock(m); }}
                          disabled={loading}
                          style={{
                            width: '100%', padding: '6px 0', borderRadius: 8, border: 'none',
                            background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                            color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          }}>
                          {loading ? '...' : `${String.fromCodePoint(0x1F513)} Collect`}
                        </button>
                      )}
                      {!unlocked && !eligible && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
                          {String.fromCodePoint(0x1F512)} Visit to unlock
                        </div>
                      )}
                      {unlocked && (
                        <button
                          onClick={e => { e.stopPropagation(); setSelected(m); setTab('missions'); }}
                          style={{
                            width: '100%', padding: '5px 0', borderRadius: 8,
                            border: '1px solid rgba(139,92,246,0.4)', background: 'transparent',
                            color: '#a78bfa', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          }}>
                          {String.fromCodePoint(0x1F3AF)} View Missions
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── MISSIONS TAB ───────────────────────────────────────────────── */}
          {tab === 'missions' && (
            <>
              {!selected ? (
                <>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 14, lineHeight: 1.6 }}>
                    Select a collected monument to see its exclusive skin missions.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {MONUMENTS.filter(m => isCollected(m.id)).map(m => (
                      <button key={m.id} onClick={() => setSelected(m)} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                        borderRadius: 12, padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
                      }}>
                        <span style={{ fontSize: 24 }}>{m.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#e0e7ff' }}>{m.name}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{m.location}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {m.missions.map(ms => (
                            <div key={ms.id} style={{
                              width: 10, height: 10, borderRadius: '50%',
                              background: missionDone(ms.id) ? ms.skin.color : 'rgba(255,255,255,0.1)',
                            }} />
                          ))}
                        </div>
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>{String.fromCodePoint(0x276F)}</span>
                      </button>
                    ))}
                    {MONUMENTS.filter(m => isCollected(m.id)).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
                        No monuments collected yet.<br />Confirm a trip location to start collecting!
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Back button */}
                  <button onClick={() => setSelected(null)} style={{
                    background: 'none', border: 'none', color: '#a78bfa',
                    fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0, fontWeight: 600,
                  }}>
                    {String.fromCodePoint(0x2190)} All monuments
                  </button>

                  {/* Monument header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                    borderRadius: 14, padding: '14px 16px', marginBottom: 16,
                  }}>
                    <span style={{ fontSize: 40 }}>{selected.emoji}</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#e0e7ff' }}>{selected.name}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{selected.location}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4, lineHeight: 1.5 }}>
                        {selected.fact}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10, letterSpacing: '0.05em' }}>
                    EXCLUSIVE SKIN MISSIONS
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selected.missions.map(ms => {
                      const done = missionDone(ms.id);
                      return (
                        <div key={ms.id} style={{
                          background: done ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${done ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: 12, padding: '14px 16px',
                          display: 'flex', alignItems: 'flex-start', gap: 12,
                        }}>
                          {/* Skin color dot */}
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                            background: done ? ms.skin.color : 'rgba(255,255,255,0.1)',
                            border: `2px solid ${done ? ms.skin.color : 'rgba(255,255,255,0.15)'}`,
                            boxShadow: done ? `0 0 8px ${ms.skin.color}60` : 'none',
                          }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: 6 }}>
                              {ms.label}
                            </div>
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '2px 8px', borderRadius: 99,
                              background: `${ms.skin.color}18`,
                              border: `1px solid ${ms.skin.color}40`,
                              fontSize: 10, fontWeight: 700, color: ms.skin.color,
                            }}>
                              {String.fromCodePoint(0x2728)} Reward: {ms.skin.name} Skin
                            </div>
                          </div>
                          {done ? (
                            <div style={{ color: '#34d399', fontSize: 18, flexShrink: 0 }}>{String.fromCodePoint(0x2713)}</div>
                          ) : (
                            <button
                              onClick={() => completeMission(selected, ms)}
                              disabled={loading}
                              style={{
                                padding: '6px 12px', borderRadius: 8, border: 'none',
                                background: `linear-gradient(135deg,${ms.skin.color}cc,${ms.skin.color})`,
                                color: '#000', fontSize: 11, fontWeight: 800,
                                cursor: loading ? 'wait' : 'pointer', flexShrink: 0,
                              }}>
                              {loading ? '...' : 'Claim'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
