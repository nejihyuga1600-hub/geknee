'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

const DEV_EMAILS = new Set(['nghiaphan081301@gmail.com']);

// ─── Shared types ─────────────────────────────────────────────────────────────

export type Rarity = 'common' | 'rare' | 'legendary';
type Skin = { id: string; name: string; color: string };
type Mission = { id: string; label: string; skin: Skin };

type CollectibleBase = {
  id: string;
  name: string;
  location: string;
  cityKeys: string[];   // matched (lowercase contains) against saved trip locations
  emoji: string;
  rarity: Rarity;
  fact: string;
  missions: Mission[];
};

// ─── Skins ────────────────────────────────────────────────────────────────────

const S = {
  gold:    { id: 'gold',      name: 'Gold',      color: '#f59e0b' },
  night:   { id: 'night',     name: 'Night',     color: '#6366f1' },
  crystal: { id: 'crystal',   name: 'Crystal',   color: '#22d3ee' },
  legend:  { id: 'legendary', name: 'Legendary', color: '#ec4899' },
  emerald: { id: 'emerald',   name: 'Emerald',   color: '#10b981' },
  amber:   { id: 'amber',     name: 'Amber',     color: '#f97316' },
};

// ─── Monument data ────────────────────────────────────────────────────────────

const MONUMENTS: CollectibleBase[] = [
  {
    id: 'eiffelTower', name: 'Eiffel Tower', location: 'Paris, France',
    cityKeys: ['paris'], emoji: '🗼', rarity: 'rare',
    fact: 'Its iron expands in summer heat — the tower grows up to 15 cm taller on a hot day.',
    missions: [
      { id: 'eiffel_night',  label: 'Visit after dark when the tower sparkles for 5 minutes every hour', skin: S.night },
      { id: 'eiffel_picnic', label: 'Have a picnic on the Champ de Mars lawn below the tower',          skin: S.gold },
      { id: 'eiffel_top',    label: 'Reach the summit observation deck at 276 m',                       skin: S.crystal },
    ],
  },
  {
    id: 'colosseum', name: 'The Colosseum', location: 'Rome, Italy',
    cityKeys: ['rome', 'roma'], emoji: '🏛️', rarity: 'legendary',
    fact: '80 numbered arches let 50,000 spectators find seats and exit in minutes.',
    missions: [
      { id: 'colos_gladiator', label: 'Try on a gladiator costume outside the gates',    skin: S.legend },
      { id: 'colos_night',     label: 'See the Colosseum illuminated at night',           skin: S.night },
      { id: 'colos_forum',     label: 'Walk through the adjacent Roman Forum & Palatine', skin: S.gold },
    ],
  },
  {
    id: 'tajMahal', name: 'Taj Mahal', location: 'Agra, India',
    cityKeys: ['agra', 'india'], emoji: '🕌', rarity: 'legendary',
    fact: 'Shah Jahan hired 20,000 workers for 22 years to build this perfect marble mausoleum.',
    missions: [
      { id: 'taj_sunrise',  label: 'Photograph the Taj at sunrise from the reflecting pool', skin: S.gold },
      { id: 'taj_barefoot', label: 'Remove your shoes and walk barefoot on the white marble plinth', skin: S.crystal },
      { id: 'taj_moon',     label: 'Attend a full moon night viewing tour',                 skin: S.legend },
    ],
  },
  {
    id: 'greatWall', name: 'Great Wall of China', location: 'Beijing, China',
    cityKeys: ['beijing', 'china', 'badaling'], emoji: '🏯', rarity: 'legendary',
    fact: 'At 13,170 miles long it could circle the Earth more than half a time.',
    missions: [
      { id: 'wall_hike',   label: 'Hike an unrestored section of the wall at Jiankou',      skin: S.legend },
      { id: 'wall_photo',  label: 'Capture the wall disappearing into misty mountains',      skin: S.night },
      { id: 'wall_tower',  label: 'Reach a watchtower and sign your name in the visitor book', skin: S.gold },
    ],
  },
  {
    id: 'statueLiberty', name: 'Statue of Liberty', location: 'New York, USA',
    cityKeys: ['new york', 'nyc'], emoji: '🗽', rarity: 'rare',
    fact: "Lady Liberty's index finger is 2.4 m long — the height of an adult standing upright.",
    missions: [
      { id: 'liberty_crown', label: "Climb all the way up to Lady Liberty's crown",       skin: S.legend },
      { id: 'liberty_ferry', label: 'Take the Staten Island Ferry for the free iconic view', skin: S.crystal },
      { id: 'liberty_night', label: 'Photograph her illuminated at dusk from the water',   skin: S.night },
    ],
  },
  {
    id: 'sagradaFamilia', name: 'Sagrada Família', location: 'Barcelona, Spain',
    cityKeys: ['barcelona', 'spain'], emoji: '⛪', rarity: 'rare',
    fact: "Construction began in 1882 and still isn't done — the world's most ambitious unfinished building.",
    missions: [
      { id: 'sagrada_tower',  label: 'Climb one of the Nativity facade towers',              skin: S.gold },
      { id: 'sagrada_light',  label: 'Stand inside during the magical morning light show',   skin: S.crystal },
      { id: 'sagrada_sketch', label: 'Sketch or paint the facade from the park opposite',    skin: S.night },
    ],
  },
  {
    id: 'machuPicchu', name: 'Machu Picchu', location: 'Cusco, Peru',
    cityKeys: ['cusco', 'peru', 'machu picchu'], emoji: '🏔️', rarity: 'legendary',
    fact: 'Perched at 2,430 m in the clouds, this Inca citadel was unknown to the outside world until 1911.',
    missions: [
      { id: 'machu_gate',    label: 'Hike to the Sun Gate (Inti Punku) via the Inca Trail',  skin: S.legend },
      { id: 'machu_llama',   label: 'Get photobombed by one of the resident llamas',          skin: S.gold },
      { id: 'machu_sunrise', label: 'Watch sunrise illuminate the ruins from Waynapicchu',    skin: S.crystal },
    ],
  },
  {
    id: 'christRedeem', name: 'Christ the Redeemer', location: 'Rio de Janeiro, Brazil',
    cityKeys: ['rio', 'rio de janeiro', 'brazil'], emoji: '✝️', rarity: 'rare',
    fact: 'Its outstretched arms span 28 metres — wide enough to shadow a full-size swimming pool.',
    missions: [
      { id: 'christ_train', label: 'Ride the cogwheel train up Corcovado through the rainforest', skin: S.gold },
      { id: 'christ_arms',  label: "Strike the famous arms-out pose with the statue behind you",  skin: S.crystal },
      { id: 'christ_cloud', label: 'Visit when clouds roll in and the statue disappears into mist', skin: S.night },
    ],
  },
  {
    id: 'angkorWat', name: 'Angkor Wat', location: 'Siem Reap, Cambodia',
    cityKeys: ['siem reap', 'cambodia', 'angkor'], emoji: '🛕', rarity: 'legendary',
    fact: "The largest religious monument on Earth — its moat alone could swallow 100 Olympic pools.",
    missions: [
      { id: 'angkor_sunrise', label: 'Watch the sunrise reflect the towers in the still moat', skin: S.gold },
      { id: 'angkor_monk',    label: 'Receive a blessing from a resident monk',                skin: S.legend },
      { id: 'angkor_bike',    label: 'Explore the entire temple complex by bicycle',            skin: S.crystal },
    ],
  },
  {
    id: 'pyramidGiza', name: 'Great Pyramid of Giza', location: 'Cairo, Egypt',
    cityKeys: ['cairo', 'egypt', 'giza'], emoji: '🔺', rarity: 'legendary',
    fact: "Built from 2.3 million stone blocks, it was the world's tallest structure for 3,800 years.",
    missions: [
      { id: 'pyramid_camel',  label: 'Ride a camel around the Giza plateau',                skin: S.gold },
      { id: 'pyramid_sphinx', label: 'Photograph the Sphinx with a pyramid aligned behind it', skin: S.crystal },
      { id: 'pyramid_inside', label: 'Descend into the Grand Gallery inside the pyramid',    skin: S.legend },
    ],
  },
  {
    id: 'goldenGate', name: 'Golden Gate Bridge', location: 'San Francisco, USA',
    cityKeys: ['san francisco', 'sf'], emoji: '🌉', rarity: 'common',
    fact: 'Its suspension cables contain 80,000 miles of wire — enough to wrap the Earth three times.',
    missions: [
      { id: 'golden_walk',  label: 'Walk or cycle the full length of the bridge',           skin: S.gold },
      { id: 'golden_fog',   label: 'Photograph it shrouded in famous morning fog',           skin: S.night },
      { id: 'golden_kayak', label: 'Paddle a kayak directly under the bridge',              skin: S.crystal },
    ],
  },
  {
    id: 'bigBen', name: 'Big Ben', location: 'London, UK',
    cityKeys: ['london', 'england', 'uk'], emoji: '🕰️', rarity: 'common',
    fact: 'Big Ben is the bell — the tower is officially the Elizabeth Tower since 2012.',
    missions: [
      { id: 'bigben_chime',  label: 'Stand outside when the famous chimes ring on the hour',   skin: S.gold },
      { id: 'bigben_bridge', label: 'Photograph Big Ben from Westminster Bridge at blue hour',  skin: S.night },
      { id: 'bigben_tour',   label: 'Join an official Houses of Parliament guided tour',        skin: S.crystal },
    ],
  },
  {
    id: 'acropolis', name: 'Acropolis of Athens', location: 'Athens, Greece',
    cityKeys: ['athens', 'greece'], emoji: '🏛️', rarity: 'rare',
    fact: "The Parthenon's columns lean inward slightly — a deliberate optical illusion so they look straight.",
    missions: [
      { id: 'acropolis_sunset', label: 'Watch sunset paint the Parthenon golden from Filopappou Hill', skin: S.gold },
      { id: 'acropolis_museum', label: 'Visit the Acropolis Museum and see the original carvings',     skin: S.crystal },
      { id: 'acropolis_five',   label: 'Identify all five structures on the Acropolis hill',           skin: S.legend },
    ],
  },
  {
    id: 'sydneyOpera', name: 'Sydney Opera House', location: 'Sydney, Australia',
    cityKeys: ['sydney', 'australia'], emoji: '🎭', rarity: 'rare',
    fact: 'Its 1,056,000 roof tiles were made in Sweden — and they self-clean in the rain.',
    missions: [
      { id: 'sydney_show',   label: 'Attend a live performance inside the Opera House',          skin: S.legend },
      { id: 'sydney_ferry',  label: 'Photograph it from the harbour ferry at golden hour',       skin: S.gold },
      { id: 'sydney_bridge', label: 'Climb the Harbour Bridge for an aerial view of the Opera House', skin: S.crystal },
    ],
  },
  {
    id: 'neuschwanstein', name: 'Neuschwanstein Castle', location: 'Bavaria, Germany',
    cityKeys: ['germany', 'munich', 'bavaria', 'fussen'], emoji: '🏰', rarity: 'rare',
    fact: "Walt Disney based Sleeping Beauty's castle on this fairytale palace — it was never finished.",
    missions: [
      { id: 'neu_bridge', label: 'Cross Marienbrücke bridge for the iconic castle view',  skin: S.gold },
      { id: 'neu_snow',   label: 'Visit in winter and see the castle blanketed in snow',  skin: S.crystal },
      { id: 'neu_hike',   label: 'Hike up the mountain trail behind the castle',          skin: S.night },
    ],
  },
  {
    id: 'stonehenge', name: 'Stonehenge', location: 'Wiltshire, England',
    cityKeys: ['england', 'uk', 'london', 'wiltshire', 'salisbury'], emoji: '🪨', rarity: 'rare',
    fact: 'The 25-tonne bluestones were dragged 200 miles from Wales around 2500 BC.',
    missions: [
      { id: 'stone_solstice', label: 'Attend a summer or winter solstice sunrise ceremony',      skin: S.legend },
      { id: 'stone_inner',    label: 'Book a special access inner-circle tour',                   skin: S.gold },
      { id: 'stone_land',     label: 'Explore the surrounding prehistoric burial mounds on foot', skin: S.crystal },
    ],
  },
  {
    id: 'iguazuFalls', name: 'Iguazu Falls', location: 'Argentina / Brazil',
    cityKeys: ['argentina', 'brazil', 'iguazu', 'iguacu', 'foz do iguacu'], emoji: '💧', rarity: 'legendary',
    fact: 'Nearly 3 km wide — Eleanor Roosevelt reportedly gasped "Poor Niagara!" on first sight.',
    missions: [
      { id: 'iguazu_boat',  label: 'Take the speedboat ride directly into the spray zone', skin: S.legend },
      { id: 'iguazu_devil', label: "Walk to the edge of the Devil's Throat viewpoint",    skin: S.gold },
      { id: 'iguazu_both',  label: 'See the falls from both the Argentine AND Brazilian sides', skin: S.crystal },
    ],
  },
  {
    id: 'tokyoSkytree', name: 'Tokyo Skytree', location: 'Tokyo, Japan',
    cityKeys: ['tokyo', 'japan'], emoji: '📡', rarity: 'rare',
    fact: "At exactly 634 m it's the world's tallest tower — the height spells the region's old name in Japanese.",
    missions: [
      { id: 'sky_top',     label: 'Reach the Tembo Galleria at 451 m for panoramic views',       skin: S.crystal },
      { id: 'sky_night',   label: 'Photograph the tower reflected in the Sumida River at night',  skin: S.night },
      { id: 'sky_hanami',  label: 'Visit during cherry blossom season with the tower in the shot', skin: S.gold },
    ],
  },
  {
    id: 'machuPicchu2', name: 'Grand Canyon', location: 'Arizona, USA',
    cityKeys: ['arizona', 'phoenix', 'las vegas', 'flagstaff', 'grand canyon'], emoji: '🏜️', rarity: 'rare',
    fact: 'Up to 29 km wide and 1.8 km deep — its rock layers tell 2 billion years of Earth history.',
    missions: [
      { id: 'canyon_rim',   label: 'Stand at the South Rim at sunrise and watch the canyon glow',  skin: S.gold },
      { id: 'canyon_hike',  label: 'Hike the Bright Angel Trail all the way to the Colorado River', skin: S.legend },
      { id: 'canyon_raft',  label: 'Raft a section of the Colorado River through the canyon',       skin: S.emerald },
    ],
  },
  {
    id: 'victoriaFalls', name: 'Victoria Falls', location: 'Zimbabwe / Zambia',
    cityKeys: ['zimbabwe', 'zambia', 'victoria falls', 'livingstone'], emoji: '🌊', rarity: 'legendary',
    fact: 'At 1.7 km wide and 108 m tall, its mist cloud is visible from over 40 km away.',
    missions: [
      { id: 'vic_pool',   label: "Swim in Devil's Pool at the very edge (dry season only)", skin: S.legend },
      { id: 'vic_bungee', label: 'Bungee jump off the Victoria Falls Bridge over the gorge', skin: S.amber },
      { id: 'vic_soak',   label: 'Stand in the spray — get completely and utterly soaked',   skin: S.crystal },
    ],
  },
];

// ─── Animal data ──────────────────────────────────────────────────────────────

const ANIMALS: CollectibleBase[] = [
  {
    id: 'blueWhale', name: 'Blue Whale', location: 'Pacific & Atlantic Oceans',
    cityKeys: ['sydney', 'cape town', 'reykjavik', 'oslo', 'new york', 'los angeles', 'san francisco', 'seattle', 'portland'],
    emoji: '🐋', rarity: 'legendary',
    fact: 'The largest animal ever to have lived on Earth — its heart alone is the size of a small car.',
    missions: [
      { id: 'bwhale_boat',    label: 'Join a whale watching boat tour and spot one surfacing',       skin: S.legend },
      { id: 'bwhale_breach',  label: 'Witness a whale breaching (full body out of the water)',       skin: S.crystal },
      { id: 'bwhale_song',    label: 'Listen to whale song underwater with a hydrophone experience', skin: S.night },
    ],
  },
  {
    id: 'humpback', name: 'Humpback Whale', location: 'Tropical & Sub-polar Oceans',
    cityKeys: ['honolulu', 'hawaii', 'nova scotia', 'iceland', 'alaska', 'anchorage', 'darwin', 'cairns'],
    emoji: '🐳', rarity: 'rare',
    fact: 'Humpbacks compose complex songs that evolve over time — males sing for hours to attract mates.',
    missions: [
      { id: 'hump_sing',   label: 'Be on the water during active singing season',           skin: S.gold },
      { id: 'hump_fin',    label: 'Watch a humpback slap the water with its tail flukes',   skin: S.crystal },
      { id: 'hump_bubble', label: 'Observe a bubble-net feeding group from a boat',         skin: S.legend },
    ],
  },
  {
    id: 'orca', name: 'Orca', location: 'Pacific Northwest & Norway',
    cityKeys: ['seattle', 'vancouver', 'oslo', 'bergen', 'tromsø', 'victoria bc', 'new zealand', 'christchurch'],
    emoji: '🐬', rarity: 'rare',
    fact: 'Orcas are the apex predator of every ocean — they hunt great white sharks for their livers.',
    missions: [
      { id: 'orca_pod',    label: 'Watch a full pod of orcas hunting together in the wild', skin: S.night },
      { id: 'orca_breach', label: 'See an orca completely clear the water in a breach',     skin: S.legend },
      { id: 'orca_kayak',  label: 'Kayak within sight of a resident orca pod',              skin: S.crystal },
    ],
  },
  {
    id: 'dolphin', name: 'Wild Dolphins', location: 'Mediterranean & Caribbean',
    cityKeys: ['athens', 'barcelona', 'rome', 'marseille', 'nice', 'cancun', 'miami', 'nassau', 'san juan'],
    emoji: '🐬', rarity: 'common',
    fact: 'Dolphins sleep with one eye open and one brain hemisphere at a time — always half awake.',
    missions: [
      { id: 'dolphin_bow',  label: 'Watch dolphins ride the bow wave of a boat at speed',  skin: S.gold },
      { id: 'dolphin_swim', label: 'Swim with wild dolphins in open water',                skin: S.crystal },
      { id: 'dolphin_spin', label: 'Spot a spinner dolphin doing aerial twirls',           skin: S.emerald },
    ],
  },
  {
    id: 'africanLion', name: 'African Lion', location: 'East Africa',
    cityKeys: ['nairobi', 'kenya', 'tanzania', 'safari', 'serengeti', 'masai mara', 'johannesburg', 'south africa'],
    emoji: '🦁', rarity: 'legendary',
    fact: 'A lion\'s roar can be heard 8 km away — they roar to mark territory and reunite the pride.',
    missions: [
      { id: 'lion_dawn',  label: 'Witness a pride hunt at first light on a dawn game drive', skin: S.gold },
      { id: 'lion_pride', label: 'Find a pride of 10+ lions resting in the shade',           skin: S.legend },
      { id: 'lion_cub',   label: 'Spot a mother with cubs — the rarest sighting on safari',  skin: S.amber },
    ],
  },
  {
    id: 'elephant', name: 'African Elephant', location: 'Sub-Saharan Africa',
    cityKeys: ['kenya', 'nairobi', 'tanzania', 'botswana', 'zimbabwe', 'zambia', 'south africa', 'namibia', 'chiang mai', 'thailand'],
    emoji: '🐘', rarity: 'rare',
    fact: 'Elephants are one of the few animals that recognize themselves in a mirror — and mourn their dead.',
    missions: [
      { id: 'eleph_herd',  label: 'Watch a herd of 20+ elephants crossing a river',         skin: S.crystal },
      { id: 'eleph_mud',   label: 'Observe a family group bathing and mud-wallowing',        skin: S.gold },
      { id: 'eleph_walk',  label: 'Walk alongside an elephant in an ethical sanctuary',      skin: S.emerald },
    ],
  },
  {
    id: 'polarBear', name: 'Polar Bear', location: 'Arctic Circle',
    cityKeys: ['iceland', 'reykjavik', 'norway', 'oslo', 'svalbard', 'canada', 'alaska', 'anchorage', 'churchill'],
    emoji: '🐻‍❄️', rarity: 'legendary',
    fact: 'Polar bears are the largest land predator — they can swim 100 km without rest in Arctic waters.',
    missions: [
      { id: 'polar_tundra', label: 'Spot a polar bear on the Arctic tundra from a tundra buggy', skin: S.legend },
      { id: 'polar_swim',   label: 'See a polar bear swimming in open Arctic water',              skin: S.crystal },
      { id: 'polar_cubs',   label: 'Find a mother polar bear emerging from a snow den with cubs', skin: S.night },
    ],
  },
  {
    id: 'penguin', name: 'Emperor Penguin', location: 'Antarctica & South America',
    cityKeys: ['argentina', 'buenos aires', 'chile', 'santiago', 'ushuaia', 'south africa', 'new zealand', 'christchurch'],
    emoji: '🐧', rarity: 'rare',
    fact: 'Emperor penguins dive deeper than 500 m and hold their breath for over 20 minutes.',
    missions: [
      { id: 'peng_colony',  label: 'Stand inside a penguin colony of 10,000+ birds',          skin: S.crystal },
      { id: 'peng_march',   label: 'Watch the famous penguin march to and from the sea',       skin: S.gold },
      { id: 'peng_chick',   label: 'Spot a fluffy penguin chick peeking out from a parent',   skin: S.legend },
    ],
  },
  {
    id: 'kangaroo', name: 'Red Kangaroo', location: 'Australian Outback',
    cityKeys: ['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'australia', 'canberra', 'alice springs'],
    emoji: '🦘', rarity: 'common',
    fact: 'A red kangaroo can leap 9 m in a single bound and reach 56 km/h — the world\'s fastest marsupial.',
    missions: [
      { id: 'kang_mob',    label: 'Find a mob of 50+ kangaroos grazing in the outback at dusk', skin: S.gold },
      { id: 'kang_joey',   label: 'Spot a joey poking its head out of the pouch',               skin: S.emerald },
      { id: 'kang_boxing', label: 'Watch two male kangaroos box each other',                    skin: S.legend },
    ],
  },
  {
    id: 'giraffe', name: 'Giraffe', location: 'East Africa',
    cityKeys: ['kenya', 'nairobi', 'tanzania', 'safari', 'serengeti', 'uganda', 'south africa'],
    emoji: '🦒', rarity: 'common',
    fact: "A giraffe's heart weighs 11 kg and pumps blood 2 m uphill to reach its brain.",
    missions: [
      { id: 'giraffe_tower', label: 'Find a tower of 5+ giraffes feeding together in acacia trees', skin: S.gold },
      { id: 'giraffe_baby',  label: 'See a newborn giraffe taking its first wobbly steps',          skin: S.amber },
      { id: 'giraffe_feed',  label: 'Hand-feed a giraffe at a responsible wildlife sanctuary',      skin: S.crystal },
    ],
  },
  {
    id: 'giantPanda', name: 'Giant Panda', location: 'Sichuan, China',
    cityKeys: ['chengdu', 'china', 'beijing', 'sichuan'], emoji: '🐼', rarity: 'legendary',
    fact: 'Giant pandas eat 12–38 kg of bamboo a day — they spend 14 hours a day just eating.',
    missions: [
      { id: 'panda_center', label: 'Visit the Chengdu Research Base of Giant Panda Breeding',    skin: S.gold },
      { id: 'panda_bamboo', label: 'Watch a panda sit and methodically eat bamboo for 10+ mins', skin: S.crystal },
      { id: 'panda_cub',    label: 'See a panda cub — one of the rarest sights in the wild',    skin: S.legend },
    ],
  },
  {
    id: 'snowLeopard', name: 'Snow Leopard', location: 'Himalayas',
    cityKeys: ['nepal', 'kathmandu', 'tibet', 'india', 'ladakh', 'spiti', 'mongolia', 'ulaanbaatar'],
    emoji: '🐆', rarity: 'legendary',
    fact: "Called the 'ghost of the mountains' — fewer than 7,000 remain in the wild and sightings are ultra-rare.",
    missions: [
      { id: 'snow_track',  label: 'Find fresh snow leopard paw prints in the Himalayas',         skin: S.crystal },
      { id: 'snow_spot',   label: 'Spot a snow leopard in the wild — an incredibly rare feat',   skin: S.legend },
      { id: 'snow_patrol', label: 'Join a conservation patrol tracking snow leopards by radio',   skin: S.night },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RARITY_COLOR: Record<Rarity, string> = {
  common: '#34d399', rare: '#818cf8', legendary: '#f59e0b',
};

type CollectedItem = { monumentId: string; skin: string };
type MissionItem   = { missionId: string };

// ─── Sub-component: Detail view for a single collectible ──────────────────────

function DetailView({
  item, collected, missions, tripLocs, loading, isDev,
  onUnlock, onMission, onBack,
}: {
  item: CollectibleBase;
  collected: CollectedItem[];
  missions: MissionItem[];
  tripLocs: string[];
  loading: boolean;
  isDev: boolean;
  onUnlock: (item: CollectibleBase) => void;
  onMission: (item: CollectibleBase, mission: Mission) => void;
  onBack: () => void;
}) {
  const unlocked   = collected.some(c => c.monumentId === item.id && c.skin === 'default');
  const hasSkin    = (sk: string) => collected.some(c => c.monumentId === item.id && c.skin === sk);
  const missionDone = (mid: string) => missions.some(m => m.missionId === mid);
  const canUnlock  = !unlocked && (isDev || item.cityKeys.some(k => tripLocs.some(t => t.includes(k))));

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', color: '#a78bfa',
        fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0, fontWeight: 600,
      }}>
        {String.fromCodePoint(0x2190)} Back
      </button>

      {/* Hero card */}
      <div style={{
        background: unlocked
          ? 'linear-gradient(135deg,rgba(139,92,246,0.15),rgba(236,72,153,0.08))'
          : 'rgba(255,255,255,0.03)',
        border: `1px solid ${unlocked ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 16, padding: '18px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          fontSize: 52,
          filter: unlocked ? 'none' : 'brightness(0) drop-shadow(0 0 10px rgba(139,92,246,0.6))',
        }}>
          {item.emoji}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 18, fontWeight: 800, color: '#e0e7ff',
            filter: unlocked ? 'none' : 'blur(5px)',
            userSelect: unlocked ? 'auto' : 'none',
          }}>
            {item.name}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            {unlocked ? item.location : '??? Unknown Location'}
          </div>
          {unlocked && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6, lineHeight: 1.6 }}>
              {item.fact}
            </div>
          )}
          {/* Rarity */}
          <div style={{
            display: 'inline-block', marginTop: 8, padding: '2px 10px', borderRadius: 99,
            background: `${RARITY_COLOR[item.rarity]}18`,
            border: `1px solid ${RARITY_COLOR[item.rarity]}40`,
            color: RARITY_COLOR[item.rarity], fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
          }}>
            {item.rarity.toUpperCase()}
          </div>
        </div>
        {/* Unlock / status */}
        <div>
          {unlocked ? (
            <div style={{ color: '#a78bfa', fontSize: 22 }}>{String.fromCodePoint(0x2713)}</div>
          ) : canUnlock ? (
            <button onClick={() => onUnlock(item)} disabled={loading} style={{
              padding: '8px 14px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
              color: '#fff', fontSize: 12, fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
            }}>
              {loading ? '...' : `${String.fromCodePoint(0x1F513)} Collect`}
            </button>
          ) : (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
              {String.fromCodePoint(0x1F512)}<br />Visit<br />to unlock
            </div>
          )}
        </div>
      </div>

      {/* Missions */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.07em', marginBottom: 10 }}>
        {String.fromCodePoint(0x1F3AF)} EXCLUSIVE SKIN MISSIONS
      </div>

      {!unlocked && (
        <div style={{
          textAlign: 'center', padding: '20px 0',
          fontSize: 12, color: 'rgba(255,255,255,0.2)',
        }}>
          {String.fromCodePoint(0x1F512)} Collect this item to reveal its missions
        </div>
      )}

      {unlocked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {item.missions.map(ms => {
            const done = missionDone(ms.id);
            const skinEarned = hasSkin(ms.skin.id);
            return (
              <div key={ms.id} style={{
                background: done ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${done ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 12, padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: skinEarned ? ms.skin.color : 'rgba(255,255,255,0.08)',
                  border: `2px solid ${skinEarned ? ms.skin.color : 'rgba(255,255,255,0.12)'}`,
                  boxShadow: skinEarned ? `0 0 10px ${ms.skin.color}50` : 'none',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                    {ms.label}
                  </div>
                  <div style={{
                    marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 99,
                    background: `${ms.skin.color}15`,
                    border: `1px solid ${ms.skin.color}35`,
                    color: ms.skin.color, fontSize: 10, fontWeight: 700,
                  }}>
                    {String.fromCodePoint(0x2728)} {ms.skin.name} Skin
                  </div>
                </div>
                {done ? (
                  <div style={{ color: '#34d399', fontSize: 20, flexShrink: 0 }}>{String.fromCodePoint(0x2713)}</div>
                ) : (
                  <button onClick={() => onMission(item, ms)} disabled={loading} style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none', flexShrink: 0,
                    background: `${ms.skin.color}`,
                    color: '#000', fontSize: 11, fontWeight: 800,
                    cursor: loading ? 'wait' : 'pointer',
                  }}>
                    {loading ? '...' : 'Claim'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { open: boolean; onClose: () => void }

export default function MonumentShop({ open, onClose }: Props) {
  const { data: session } = useSession();
  const isDev = DEV_EMAILS.has(session?.user?.email?.toLowerCase() ?? '');
  const [tab,       setTab]       = useState<'monuments' | 'animals'>('monuments');
  const [collected, setCollected] = useState<CollectedItem[]>([]);
  const [missions,  setMissions]  = useState<MissionItem[]>([]);
  const [tripLocs,  setTripLocs]  = useState<string[]>([]);
  const [selected,  setSelected]  = useState<CollectibleBase | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [msg,       setMsg]       = useState('');
  const [filter,    setFilter]    = useState<'all' | 'unlocked' | 'locked'>('all');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/monuments');
      if (!res.ok) return;
      const data = await res.json() as { collected: CollectedItem[]; missions: MissionItem[]; tripLocations: string[] };
      setCollected(data.collected); setMissions(data.missions); setTripLocs(data.tripLocations);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { if (open) { load(); setSelected(null); setMsg(''); } }, [open, load]);

  // Reset selected when switching tabs
  const switchTab = (t: typeof tab) => { setTab(t); setSelected(null); setMsg(''); };

  const isCollected = (id: string) => collected.some(c => c.monumentId === id && c.skin === 'default');
  const canUnlock   = (item: CollectibleBase) =>
    !isCollected(item.id) && (isDev || item.cityKeys.some(k => tripLocs.some(t => t.includes(k))));

  async function unlock(item: CollectibleBase) {
    setLoading(true); setMsg('');
    const res = await fetch('/api/monuments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlock', monumentId: item.id }),
    });
    const data = await res.json();
    if (res.ok) { setMsg(`${item.name} added to your collection!`); await load(); }
    else setMsg(data.error ?? 'Error');
    setLoading(false);
  }

  async function completeMission(item: CollectibleBase, ms: Mission) {
    setLoading(true); setMsg('');
    const res = await fetch('/api/monuments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mission', monumentId: item.id, missionId: ms.id, skin: ms.skin.id }),
    });
    const data = await res.json();
    if (res.ok) { setMsg(`${ms.skin.name} skin unlocked!`); await load(); }
    else setMsg(data.error ?? 'Error');
    setLoading(false);
  }

  const list    = tab === 'monuments' ? MONUMENTS : ANIMALS;
  const total   = collected.filter(c => c.skin === 'default').length;
  const allTotal = MONUMENTS.length + ANIMALS.length;

  const displayed = list.filter(m => {
    if (filter === 'unlocked') return isCollected(m.id);
    if (filter === 'locked')   return !isCollected(m.id);
    return true;
  });

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000, animation: 'modalFadeIn 0.25s ease-out',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'linear-gradient(135deg,#0a0f1e,#0f172a,#1a0a2e)',
        border: '1px solid rgba(139,92,246,0.3)',
        borderRadius: 24, width: '92%', maxWidth: 560, animation: 'modalSlideUp 0.3s ease-out',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(139,92,246,0.1)',
        overflow: 'hidden',
      }}>
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#e0e7ff', letterSpacing: '-0.02em' }}>
                {String.fromCodePoint(0x1F3DB)} Explorer Collection
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                {total} / {allTotal} collected
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 22, cursor: 'pointer', padding: 4 }}>
              {String.fromCodePoint(0x00D7)}
            </button>
          </div>

          {/* Progress */}
          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: 'linear-gradient(90deg,#7c3aed,#a855f7,#ec4899)',
              width: `${(total / allTotal) * 100}%`,
              transition: 'width 0.6s ease',
            }} />
          </div>

          {/* Tabs: Monuments | Animals */}
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: 'monuments', label: `${String.fromCodePoint(0x1F3DB)} Monuments` },
              { key: 'animals',   label: `${String.fromCodePoint(0x1F43E)} Animals` },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => switchTab(key)} style={{
                flex: 1, padding: '8px 0', borderRadius: '10px 10px 0 0', border: 'none',
                background: tab === key ? 'rgba(139,92,246,0.15)' : 'transparent',
                borderBottom: tab === key ? '2px solid #a855f7' : '2px solid transparent',
                color: tab === key ? '#c4b5fd' : 'rgba(255,255,255,0.3)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>

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

          {/* Detail view */}
          {selected ? (
            <DetailView
              item={selected} collected={collected} missions={missions} tripLocs={tripLocs}
              loading={loading} isDev={isDev}
              onUnlock={async (it) => { await unlock(it); }}
              onMission={async (it, ms) => { await completeMission(it, ms); }}
              onBack={() => { setSelected(null); setMsg(''); }}
            />
          ) : (
            <>
              {/* Filter pills */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {(['all', 'unlocked', 'locked'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding: '4px 12px', borderRadius: 99, border: '1px solid',
                    borderColor: filter === f ? '#a855f7' : 'rgba(255,255,255,0.1)',
                    background: filter === f ? 'rgba(168,85,247,0.15)' : 'transparent',
                    color: filter === f ? '#c4b5fd' : 'rgba(255,255,255,0.35)',
                    fontSize: 12, cursor: 'pointer', textTransform: 'capitalize',
                  }}>
                    {f}
                  </button>
                ))}
              </div>

              {/* Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {displayed.map(item => {
                  const unlocked = isCollected(item.id);
                  const eligible = canUnlock(item);
                  const skinsEarned = item.missions.filter(ms => collected.some(c => c.monumentId === item.id && c.skin === ms.skin.id)).length;
                  return (
                    <div key={item.id}
                      onClick={() => setSelected(item)}
                      style={{
                        background: unlocked
                          ? 'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(236,72,153,0.06))'
                          : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${unlocked ? 'rgba(139,92,246,0.3)' : eligible ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)'}`,
                        borderRadius: 14, padding: '14px 12px', cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: unlocked ? '0 4px 20px rgba(139,92,246,0.1)' : 'none',
                      }}>

                      {/* Emoji / silhouette */}
                      <div style={{
                        fontSize: 36, textAlign: 'center', marginBottom: 8,
                        filter: unlocked ? 'none' : 'brightness(0) drop-shadow(0 0 8px rgba(139,92,246,0.45))',
                        userSelect: 'none',
                      }}>
                        {item.emoji}
                      </div>

                      {/* Rarity badge */}
                      <div style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 99, marginBottom: 5,
                        background: `${RARITY_COLOR[item.rarity]}18`,
                        border: `1px solid ${RARITY_COLOR[item.rarity]}45`,
                        color: RARITY_COLOR[item.rarity], fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                      }}>
                        {item.rarity.toUpperCase()}
                      </div>

                      {/* Name */}
                      <div style={{
                        fontSize: 12, fontWeight: 700, color: '#e0e7ff',
                        filter: unlocked ? 'none' : 'blur(4px)',
                        userSelect: unlocked ? 'auto' : 'none',
                        lineHeight: 1.3, marginBottom: 2,
                      }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
                        {unlocked ? item.location : '??? Unknown'}
                      </div>

                      {/* Skin dots */}
                      {unlocked && (
                        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                          {item.missions.map(ms => (
                            <div key={ms.id} title={`${ms.skin.name} skin`} style={{
                              width: 12, height: 12, borderRadius: '50%',
                              background: collected.some(c => c.monumentId === item.id && c.skin === ms.skin.id)
                                ? ms.skin.color : 'rgba(255,255,255,0.1)',
                              border: `1px solid rgba(255,255,255,0.12)`,
                            }} />
                          ))}
                          {skinsEarned > 0 && (
                            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginLeft: 2, alignSelf: 'center' }}>
                              {skinsEarned}/{item.missions.length}
                            </span>
                          )}
                        </div>
                      )}

                      {/* CTA */}
                      {!unlocked && eligible && (
                        <div style={{
                          width: '100%', padding: '5px 0', borderRadius: 8,
                          background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.35)',
                          color: '#c4b5fd', fontSize: 10, fontWeight: 700, textAlign: 'center',
                        }}>
                          {String.fromCodePoint(0x1F513)} Ready to collect
                        </div>
                      )}
                      {!unlocked && !eligible && (
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', textAlign: 'center' }}>
                          {String.fromCodePoint(0x1F512)} Visit to unlock
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {displayed.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
                  Nothing here yet — start collecting!
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
