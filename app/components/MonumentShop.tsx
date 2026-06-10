'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { track } from '@/lib/analytics';
import { _setPendingUnlock } from '@/app/plan/location/globe/pendingUnlock';
import { INFO } from '@/app/plan/location/globe/info';
import { MONUMENT_LATLON } from '@/app/plan/location/globe/skins';
import { getRarity, getQuests, type SkinTier } from '@/app/plan/location/globe/quests';
import { ShimmerButton } from './animations/ShimmerButton';
import { MagicCard } from './animations/MagicCard';
import { UnlockCeremony } from './animations/UnlockCeremony';
import { currentIssueYear } from '@/lib/issue-year';
import { Unlock, Lock, Sparkle, Camera } from '@/lib/icons';

const DEV_EMAILS = new Set(['nghiaphan081301@gmail.com']);

// ─── Shared types ─────────────────────────────────────────────────────────────

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
type Skin = { id: string; name: string; color: string; rarity?: string };
type Mission = { id: string; label: string; skin: Skin; verify?: 'photo' };

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
  // Common
  stone:        { id: 'stone',        name: 'Stone',        color: '#9ca3af', rarity: 'common' },
  bronze:       { id: 'bronze',       name: 'Bronze',       color: '#cd7f32', rarity: 'common' },
  // Rare
  silver:       { id: 'silver',       name: 'Silver',       color: '#c0c0c0', rarity: 'rare' },
  sapphire:     { id: 'sapphire',     name: 'Sapphire',     color: '#2563eb', rarity: 'rare' },
  jade:         { id: 'jade',         name: 'Jade',         color: '#059669', rarity: 'rare' },
  // Rare
  gold:         { id: 'gold',         name: 'Gold',         color: '#f59e0b', rarity: 'rare' },
  rose_gold:    { id: 'rose_gold',    name: 'Rose Gold',    color: '#f472b6', rarity: 'rare' },
  carbon_fiber: { id: 'carbon_fiber', name: 'Carbon Fiber', color: '#374151', rarity: 'rare' },
  // Epic
  diamond:      { id: 'diamond',      name: 'Diamond',      color: '#67e8f9', rarity: 'epic' },
  damascus:     { id: 'damascus',     name: 'Damascus',     color: '#64748b', rarity: 'epic' },
  obsidian:     { id: 'obsidian',     name: 'Obsidian',     color: '#1e1b4b', rarity: 'epic' },
  neon:         { id: 'neon',         name: 'Neon',         color: '#06b6d4', rarity: 'epic' },
  // Legendary
  holographic:  { id: 'holographic',  name: 'Holographic',  color: '#a78bfa', rarity: 'legendary' },
  radiant:      { id: 'radiant',      name: 'Radiant',      color: '#fbbf24', rarity: 'legendary' },
  aurora:       { id: 'aurora',       name: 'Aurora',       color: '#34d399', rarity: 'legendary' },
  lava:         { id: 'lava',         name: 'Lava',         color: '#ef4444', rarity: 'legendary' },
  // Legendary (aurora + celestial)
  celestial:    { id: 'celestial',    name: 'Celestial',    color: '#818cf8', rarity: 'legendary' },
  rainbow:      { id: 'rainbow',      name: 'Rainbow',      color: '#f97316', rarity: 'mythic' },
  void:         { id: 'void',         name: 'Void',         color: '#6b21a8', rarity: 'mythic' },
  sakura:       { id: 'sakura',       name: 'Sakura',       color: '#fda4af', rarity: 'mythic' },
};

// ─── Monument data ────────────────────────────────────────────────────────────

const MONUMENTS: CollectibleBase[] = [
  {
    id: 'eiffelTower', name: 'Eiffel Tower', location: 'Paris, France',
    cityKeys: ['paris'], emoji: '🗼', rarity: 'rare',
    fact: 'Its iron expands in summer heat — the tower grows up to 15 cm taller on a hot day.',
    missions: [
      { id: 'eiffel_picnic', label: 'Have a picnic on the Champ de Mars lawn below the tower',          skin: S.gold, verify: 'photo' },
      { id: 'eiffel_night',  label: 'Visit after dark when the tower sparkles for 5 minutes every hour', skin: S.diamond, verify: 'photo' },
      { id: 'eiffel_top',    label: 'Reach the summit observation deck at 276 m',                       skin: S.celestial },
    ],
  },
  {
    id: 'colosseum', name: 'The Colosseum', location: 'Rome, Italy',
    cityKeys: ['rome', 'roma'], emoji: '🏛️', rarity: 'legendary',
    fact: '80 numbered arches let 50,000 spectators find seats and exit in minutes.',
    missions: [
      { id: 'colos_forum',     label: 'Walk through the adjacent Roman Forum & Palatine', skin: S.bronze },
      { id: 'colos_night',     label: 'See the Colosseum illuminated at night',           skin: S.obsidian },
      { id: 'colos_gladiator', label: 'Try on a gladiator costume outside the gates',    skin: S.holographic, verify: 'photo' },
    ],
  },
  {
    id: 'tajMahal', name: 'Taj Mahal', location: 'Agra, India',
    cityKeys: ['agra', 'india'], emoji: '🕌', rarity: 'legendary',
    fact: 'Shah Jahan hired 20,000 workers for 22 years to build this perfect marble mausoleum.',
    missions: [
      { id: 'taj_sunrise',  label: 'Photograph the Taj at sunrise from the reflecting pool', skin: S.rose_gold, verify: 'photo' },
      { id: 'taj_barefoot', label: 'Remove your shoes and walk barefoot on the white marble plinth', skin: S.diamond },
      { id: 'taj_moon',     label: 'Attend a full moon night viewing tour',                 skin: S.celestial },
    ],
  },
  {
    id: 'greatWall', name: 'Great Wall of China', location: 'Beijing, China',
    cityKeys: ['beijing', 'china', 'badaling'], emoji: '🏯', rarity: 'legendary',
    fact: 'At 13,170 miles long it could circle the Earth more than half a time.',
    missions: [
      { id: 'wall_tower',  label: 'Reach a watchtower and sign your name in the visitor book', skin: S.stone },
      { id: 'wall_photo',  label: 'Capture the wall disappearing into misty mountains',      skin: S.obsidian, verify: 'photo' },
      { id: 'wall_hike',   label: 'Hike an unrestored section of the wall at Jiankou',      skin: S.aurora },
    ],
  },
  {
    id: 'statueLiberty', name: 'Statue of Liberty', location: 'New York, USA',
    cityKeys: ['new york', 'nyc'], emoji: '🗽', rarity: 'rare',
    fact: "Lady Liberty's index finger is 2.4 m long — the height of an adult standing upright.",
    missions: [
      { id: 'liberty_ferry', label: 'Take the Staten Island Ferry for the free iconic view', skin: S.silver },
      { id: 'liberty_night', label: 'Photograph her illuminated at dusk from the water',   skin: S.neon, verify: 'photo' },
      { id: 'liberty_crown', label: "Climb all the way up to Lady Liberty's crown",       skin: S.lava },
    ],
  },
  {
    id: 'sagradaFamilia', name: 'Sagrada Família', location: 'Barcelona, Spain',
    cityKeys: ['barcelona', 'spain'], emoji: '⛪', rarity: 'rare',
    fact: "Construction began in 1882 and still isn't done — the world's most ambitious unfinished building.",
    missions: [
      { id: 'sagrada_tower',  label: 'Climb one of the Nativity facade towers',              skin: S.sapphire },
      { id: 'sagrada_light',  label: 'Stand inside during the magical morning light show',   skin: S.holographic, verify: 'photo' },
      { id: 'sagrada_sketch', label: 'Sketch or paint the facade from the park opposite',    skin: S.sakura, verify: 'photo' },
    ],
  },
  {
    id: 'machuPicchu', name: 'Machu Picchu', location: 'Cusco, Peru',
    cityKeys: ['cusco', 'peru', 'machu picchu'], emoji: '🏔️', rarity: 'legendary',
    fact: 'Perched at 2,430 m in the clouds, this Inca citadel was unknown to the outside world until 1911.',
    missions: [
      { id: 'machu_llama',   label: 'Get photobombed by one of the resident llamas',          skin: S.jade, verify: 'photo' },
      { id: 'machu_sunrise', label: 'Watch sunrise illuminate the ruins from Waynapicchu',    skin: S.radiant },
      { id: 'machu_gate',    label: 'Hike to the Sun Gate (Inti Punku) via the Inca Trail',  skin: S.void },
    ],
  },
  {
    id: 'christRedeem', name: 'Christ the Redeemer', location: 'Rio de Janeiro, Brazil',
    cityKeys: ['rio', 'rio de janeiro', 'brazil'], emoji: '✝️', rarity: 'rare',
    fact: 'Its outstretched arms span 28 metres — wide enough to shadow a full-size swimming pool.',
    missions: [
      { id: 'christ_train', label: 'Ride the cogwheel train up Corcovado through the rainforest', skin: S.gold },
      { id: 'christ_arms',  label: "Strike the famous arms-out pose with the statue behind you",  skin: S.carbon_fiber, verify: 'photo' },
      { id: 'christ_cloud', label: 'Visit when clouds roll in and the statue disappears into mist', skin: S.aurora },
    ],
  },
  {
    id: 'angkorWat', name: 'Angkor Wat', location: 'Siem Reap, Cambodia',
    cityKeys: ['siem reap', 'cambodia', 'angkor'], emoji: '🛕', rarity: 'legendary',
    fact: "The largest religious monument on Earth — its moat alone could swallow 100 Olympic pools.",
    missions: [
      { id: 'angkor_sunrise', label: 'Watch the sunrise reflect the towers in the still moat', skin: S.rose_gold, verify: 'photo' },
      { id: 'angkor_bike',    label: 'Explore the entire temple complex by bicycle',            skin: S.obsidian },
      { id: 'angkor_monk',    label: 'Receive a blessing from a resident monk',                skin: S.celestial },
    ],
  },
  {
    id: 'pyramidGiza', name: 'Great Pyramid of Giza', location: 'Cairo, Egypt',
    cityKeys: ['cairo', 'egypt', 'giza'], emoji: '🔺', rarity: 'legendary',
    fact: "Built from 2.3 million stone blocks, it was the world's tallest structure for 3,800 years.",
    missions: [
      { id: 'pyramid_camel',  label: 'Ride a camel around the Giza plateau',                skin: S.gold, verify: 'photo' },
      { id: 'pyramid_sphinx', label: 'Photograph the Sphinx with a pyramid aligned behind it', skin: S.obsidian, verify: 'photo' },
      { id: 'pyramid_inside', label: 'Descend into the Grand Gallery inside the pyramid',    skin: S.rainbow },
    ],
  },
  {
    id: 'goldenGate', name: 'Golden Gate Bridge', location: 'San Francisco, USA',
    cityKeys: ['san francisco', 'sf'], emoji: '🌉', rarity: 'common',
    fact: 'Its suspension cables contain 80,000 miles of wire — enough to wrap the Earth three times.',
    missions: [
      { id: 'golden_walk',  label: 'Walk or cycle the full length of the bridge',           skin: S.bronze },
      { id: 'golden_fog',   label: 'Photograph it shrouded in famous morning fog',           skin: S.silver, verify: 'photo' },
      { id: 'golden_kayak', label: 'Paddle a kayak directly under the bridge',              skin: S.neon, verify: 'photo' },
    ],
  },
  {
    id: 'bigBen', name: 'Big Ben', location: 'London, UK',
    cityKeys: ['london', 'england', 'uk'], emoji: '🕰️', rarity: 'common',
    fact: 'Big Ben is the bell — the tower is officially the Elizabeth Tower since 2012.',
    missions: [
      { id: 'bigben_chime',  label: 'Stand outside when the famous chimes ring on the hour',   skin: S.stone },
      { id: 'bigben_bridge', label: 'Photograph Big Ben from Westminster Bridge at blue hour',  skin: S.sapphire, verify: 'photo' },
      { id: 'bigben_tour',   label: 'Join an official Houses of Parliament guided tour',        skin: S.carbon_fiber },
    ],
  },
  {
    id: 'acropolis', name: 'Acropolis of Athens', location: 'Athens, Greece',
    cityKeys: ['athens', 'greece'], emoji: '🏛️', rarity: 'rare',
    fact: "The Parthenon's columns lean inward slightly — a deliberate optical illusion so they look straight.",
    missions: [
      { id: 'acropolis_sunset', label: 'Watch sunset paint the Parthenon golden from Filopappou Hill', skin: S.gold },
      { id: 'acropolis_museum', label: 'Visit the Acropolis Museum and see the original carvings',     skin: S.diamond },
      { id: 'acropolis_five',   label: 'Identify all five structures on the Acropolis hill',           skin: S.radiant },
    ],
  },
  {
    id: 'sydneyOpera', name: 'Sydney Opera House', location: 'Sydney, Australia',
    cityKeys: ['sydney', 'australia'], emoji: '🎭', rarity: 'rare',
    fact: 'Its 1,056,000 roof tiles were made in Sweden — and they self-clean in the rain.',
    missions: [
      { id: 'sydney_ferry',  label: 'Photograph it from the harbour ferry at golden hour',       skin: S.silver, verify: 'photo' },
      { id: 'sydney_bridge', label: 'Climb the Harbour Bridge for an aerial view of the Opera House', skin: S.obsidian },
      { id: 'sydney_show',   label: 'Attend a live performance inside the Opera House',          skin: S.holographic },
    ],
  },
  {
    id: 'neuschwanstein', name: 'Neuschwanstein Castle', location: 'Bavaria, Germany',
    cityKeys: ['germany', 'munich', 'bavaria', 'fussen'], emoji: '🏰', rarity: 'rare',
    fact: "Walt Disney based Sleeping Beauty's castle on this fairytale palace — it was never finished.",
    missions: [
      { id: 'neu_bridge', label: 'Cross Marienbrücke bridge for the iconic castle view',  skin: S.jade },
      { id: 'neu_snow',   label: 'Visit in winter and see the castle blanketed in snow',  skin: S.diamond },
      { id: 'neu_hike',   label: 'Hike up the mountain trail behind the castle',          skin: S.aurora },
    ],
  },
  {
    id: 'stonehenge', name: 'Stonehenge', location: 'Wiltshire, England',
    cityKeys: ['england', 'uk', 'london', 'wiltshire', 'salisbury'], emoji: '🪨', rarity: 'rare',
    fact: 'The 25-tonne bluestones were dragged 200 miles from Wales around 2500 BC.',
    missions: [
      { id: 'stone_inner',    label: 'Book a special access inner-circle tour',                   skin: S.stone },
      { id: 'stone_land',     label: 'Explore the surrounding prehistoric burial mounds on foot', skin: S.obsidian },
      { id: 'stone_solstice', label: 'Attend a summer or winter solstice sunrise ceremony',      skin: S.lava },
    ],
  },
  {
    id: 'iguazuFalls', name: 'Iguazu Falls', location: 'Argentina / Brazil',
    cityKeys: ['argentina', 'brazil', 'iguazu', 'iguacu', 'foz do iguacu'], emoji: '💧', rarity: 'legendary',
    fact: 'Nearly 3 km wide — Eleanor Roosevelt reportedly gasped "Poor Niagara!" on first sight.',
    missions: [
      { id: 'iguazu_devil', label: "Walk to the edge of the Devil's Throat viewpoint",    skin: S.sapphire },
      { id: 'iguazu_both',  label: 'See the falls from both the Argentine AND Brazilian sides', skin: S.neon },
      { id: 'iguazu_boat',  label: 'Take the speedboat ride directly into the spray zone', skin: S.rainbow },
    ],
  },
  {
    id: 'tokyoSkytree', name: 'Tokyo Skytree', location: 'Tokyo, Japan',
    cityKeys: ['tokyo', 'japan'], emoji: '📡', rarity: 'rare',
    fact: "At exactly 634 m it's the world's tallest tower — the height spells the region's old name in Japanese.",
    missions: [
      { id: 'sky_hanami',  label: 'Visit during cherry blossom season with the tower in the shot', skin: S.sakura, verify: 'photo' },
      { id: 'sky_night',   label: 'Photograph the tower reflected in the Sumida River at night',  skin: S.neon, verify: 'photo' },
      { id: 'sky_top',     label: 'Reach the Tembo Galleria at 451 m for panoramic views',       skin: S.celestial },
    ],
  },
  {
    id: 'machuPicchu2', name: 'Grand Canyon', location: 'Arizona, USA',
    cityKeys: ['arizona', 'phoenix', 'las vegas', 'flagstaff', 'grand canyon'], emoji: '🏜️', rarity: 'rare',
    fact: 'Up to 29 km wide and 1.8 km deep — its rock layers tell 2 billion years of Earth history.',
    missions: [
      { id: 'canyon_rim',   label: 'Stand at the South Rim at sunrise and watch the canyon glow',  skin: S.bronze },
      { id: 'canyon_hike',  label: 'Hike the Bright Angel Trail all the way to the Colorado River', skin: S.carbon_fiber },
      { id: 'canyon_raft',  label: 'Raft a section of the Colorado River through the canyon',       skin: S.lava },
    ],
  },
  {
    id: 'victoriaFalls', name: 'Victoria Falls', location: 'Zimbabwe / Zambia',
    cityKeys: ['zimbabwe', 'zambia', 'victoria falls', 'livingstone'], emoji: '🌊', rarity: 'legendary',
    fact: 'At 1.7 km wide and 108 m tall, its mist cloud is visible from over 40 km away.',
    missions: [
      { id: 'vic_soak',   label: 'Stand in the spray — get completely and utterly soaked',   skin: S.jade },
      { id: 'vic_bungee', label: 'Bungee jump off the Victoria Falls Bridge over the gorge', skin: S.obsidian, verify: 'photo' },
      { id: 'vic_pool',   label: "Swim in Devil's Pool at the very edge (dry season only)", skin: S.void },
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
      { id: 'bwhale_boat',    label: 'Join a whale watching boat tour and spot one surfacing',       skin: S.sapphire },
      { id: 'bwhale_breach',  label: 'Witness a whale breaching (full body out of the water)',       skin: S.holographic },
      { id: 'bwhale_song',    label: 'Listen to whale song underwater with a hydrophone experience', skin: S.celestial },
    ],
  },
  {
    id: 'humpback', name: 'Humpback Whale', location: 'Tropical & Sub-polar Oceans',
    cityKeys: ['honolulu', 'hawaii', 'nova scotia', 'iceland', 'alaska', 'anchorage', 'darwin', 'cairns'],
    emoji: '🐳', rarity: 'rare',
    fact: 'Humpbacks compose complex songs that evolve over time — males sing for hours to attract mates.',
    missions: [
      { id: 'hump_sing',   label: 'Be on the water during active singing season',           skin: S.silver },
      { id: 'hump_fin',    label: 'Watch a humpback slap the water with its tail flukes',   skin: S.diamond },
      { id: 'hump_bubble', label: 'Observe a bubble-net feeding group from a boat',         skin: S.aurora },
    ],
  },
  {
    id: 'orca', name: 'Orca', location: 'Pacific Northwest & Norway',
    cityKeys: ['seattle', 'vancouver', 'oslo', 'bergen', 'tromsø', 'victoria bc', 'new zealand', 'christchurch'],
    emoji: '🐬', rarity: 'rare',
    fact: 'Orcas are the apex predator of every ocean — they hunt great white sharks for their livers.',
    missions: [
      { id: 'orca_pod',    label: 'Watch a full pod of orcas hunting together in the wild', skin: S.obsidian },
      { id: 'orca_breach', label: 'See an orca completely clear the water in a breach',     skin: S.lava },
      { id: 'orca_kayak',  label: 'Kayak within sight of a resident orca pod',              skin: S.void, verify: 'photo' },
    ],
  },
  {
    id: 'dolphin', name: 'Wild Dolphins', location: 'Mediterranean & Caribbean',
    cityKeys: ['athens', 'barcelona', 'rome', 'marseille', 'nice', 'cancun', 'miami', 'nassau', 'san juan'],
    emoji: '🐬', rarity: 'common',
    fact: 'Dolphins sleep with one eye open and one brain hemisphere at a time — always half awake.',
    missions: [
      { id: 'dolphin_bow',  label: 'Watch dolphins ride the bow wave of a boat at speed',  skin: S.stone },
      { id: 'dolphin_swim', label: 'Swim with wild dolphins in open water',                skin: S.gold, verify: 'photo' },
      { id: 'dolphin_spin', label: 'Spot a spinner dolphin doing aerial twirls',           skin: S.neon },
    ],
  },
  {
    id: 'africanLion', name: 'African Lion', location: 'East Africa',
    cityKeys: ['nairobi', 'kenya', 'tanzania', 'safari', 'serengeti', 'masai mara', 'johannesburg', 'south africa'],
    emoji: '🦁', rarity: 'legendary',
    fact: 'A lion\'s roar can be heard 8 km away — they roar to mark territory and reunite the pride.',
    missions: [
      { id: 'lion_dawn',  label: 'Witness a pride hunt at first light on a dawn game drive', skin: S.gold },
      { id: 'lion_pride', label: 'Find a pride of 10+ lions resting in the shade',           skin: S.radiant },
      { id: 'lion_cub',   label: 'Spot a mother with cubs — the rarest sighting on safari',  skin: S.rainbow },
    ],
  },
  {
    id: 'elephant', name: 'African Elephant', location: 'Sub-Saharan Africa',
    cityKeys: ['kenya', 'nairobi', 'tanzania', 'botswana', 'zimbabwe', 'zambia', 'south africa', 'namibia', 'chiang mai', 'thailand'],
    emoji: '🐘', rarity: 'rare',
    fact: 'Elephants are one of the few animals that recognize themselves in a mirror — and mourn their dead.',
    missions: [
      { id: 'eleph_mud',   label: 'Observe a family group bathing and mud-wallowing',        skin: S.bronze },
      { id: 'eleph_herd',  label: 'Watch a herd of 20+ elephants crossing a river',         skin: S.obsidian },
      { id: 'eleph_walk',  label: 'Walk alongside an elephant in an ethical sanctuary',      skin: S.holographic, verify: 'photo' },
    ],
  },
  {
    id: 'polarBear', name: 'Polar Bear', location: 'Arctic Circle',
    cityKeys: ['iceland', 'reykjavik', 'norway', 'oslo', 'svalbard', 'canada', 'alaska', 'anchorage', 'churchill'],
    emoji: '🐻‍❄️', rarity: 'legendary',
    fact: 'Polar bears are the largest land predator — they can swim 100 km without rest in Arctic waters.',
    missions: [
      { id: 'polar_swim',   label: 'See a polar bear swimming in open Arctic water',              skin: S.silver },
      { id: 'polar_tundra', label: 'Spot a polar bear on the Arctic tundra from a tundra buggy', skin: S.diamond },
      { id: 'polar_cubs',   label: 'Find a mother polar bear emerging from a snow den with cubs', skin: S.celestial },
    ],
  },
  {
    id: 'penguin', name: 'Emperor Penguin', location: 'Antarctica & South America',
    cityKeys: ['argentina', 'buenos aires', 'chile', 'santiago', 'ushuaia', 'south africa', 'new zealand', 'christchurch'],
    emoji: '🐧', rarity: 'rare',
    fact: 'Emperor penguins dive deeper than 500 m and hold their breath for over 20 minutes.',
    missions: [
      { id: 'peng_march',   label: 'Watch the famous penguin march to and from the sea',       skin: S.jade },
      { id: 'peng_colony',  label: 'Stand inside a penguin colony of 10,000+ birds',          skin: S.carbon_fiber },
      { id: 'peng_chick',   label: 'Spot a fluffy penguin chick peeking out from a parent',   skin: S.aurora },
    ],
  },
  {
    id: 'kangaroo', name: 'Red Kangaroo', location: 'Australian Outback',
    cityKeys: ['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'australia', 'canberra', 'alice springs'],
    emoji: '🦘', rarity: 'common',
    fact: 'A red kangaroo can leap 9 m in a single bound and reach 56 km/h — the world\'s fastest marsupial.',
    missions: [
      { id: 'kang_mob',    label: 'Find a mob of 50+ kangaroos grazing in the outback at dusk', skin: S.stone },
      { id: 'kang_joey',   label: 'Spot a joey poking its head out of the pouch',               skin: S.rose_gold },
      { id: 'kang_boxing', label: 'Watch two male kangaroos box each other',                    skin: S.radiant },
    ],
  },
  {
    id: 'giraffe', name: 'Giraffe', location: 'East Africa',
    cityKeys: ['kenya', 'nairobi', 'tanzania', 'safari', 'serengeti', 'uganda', 'south africa'],
    emoji: '🦒', rarity: 'common',
    fact: "A giraffe's heart weighs 11 kg and pumps blood 2 m uphill to reach its brain.",
    missions: [
      { id: 'giraffe_tower', label: 'Find a tower of 5+ giraffes feeding together in acacia trees', skin: S.bronze },
      { id: 'giraffe_baby',  label: 'See a newborn giraffe taking its first wobbly steps',          skin: S.gold },
      { id: 'giraffe_feed',  label: 'Hand-feed a giraffe at a responsible wildlife sanctuary',      skin: S.obsidian },
    ],
  },
  {
    id: 'giantPanda', name: 'Giant Panda', location: 'Sichuan, China',
    cityKeys: ['chengdu', 'china', 'beijing', 'sichuan'], emoji: '🐼', rarity: 'legendary',
    fact: 'Giant pandas eat 12–38 kg of bamboo a day — they spend 14 hours a day just eating.',
    missions: [
      { id: 'panda_center', label: 'Visit the Chengdu Research Base of Giant Panda Breeding',    skin: S.jade },
      { id: 'panda_bamboo', label: 'Watch a panda sit and methodically eat bamboo for 10+ mins', skin: S.obsidian },
      { id: 'panda_cub',    label: 'See a panda cub — one of the rarest sights in the wild',    skin: S.sakura },
    ],
  },
  {
    id: 'snowLeopard', name: 'Snow Leopard', location: 'Himalayas',
    cityKeys: ['nepal', 'kathmandu', 'tibet', 'india', 'ladakh', 'spiti', 'mongolia', 'ulaanbaatar'],
    emoji: '🐆', rarity: 'legendary',
    fact: "Called the 'ghost of the mountains' — fewer than 7,000 remain in the wild and sightings are ultra-rare.",
    missions: [
      { id: 'snow_track',  label: 'Find fresh snow leopard paw prints in the Himalayas',         skin: S.silver },
      { id: 'snow_patrol', label: 'Join a conservation patrol tracking snow leopards by radio',   skin: S.diamond },
      { id: 'snow_spot',   label: 'Spot a snow leopard in the wild — an incredibly rare feat',   skin: S.void },
    ],
  },
];

// ─── Auto-generated catalog from globe/info.ts ────────────────────────────────
// Curated MONUMENTS above are hand-crafted entries with rich, location-specific
// missions. info.ts has 369 landmarks total. This fills the gap so users
// collecting any landmark see it in their Collection. Both rarity AND missions
// are now derived from globe/quests.ts (algorithmic, ~5 quests/monument capped),
// not hardcoded common+single-visit. Curate by adding richer entries to
// MONUMENTS above; auto entries with the same id get filtered out.

// Map quest tier ids → the existing rich Skin map. Stone tier was retired.
const TIER_TO_SKIN: Record<SkinTier, Skin> = {
  bronze: S.bronze, silver: S.silver, gold: S.gold,
  diamond: S.diamond, aurora: S.aurora, celestial: S.celestial,
};

const AUTO_MONUMENTS: CollectibleBase[] = (() => {
  const curatedIds = new Set([...MONUMENTS, ...ANIMALS].map(m => m.id));
  const out: CollectibleBase[] = [];
  for (const [id, info] of Object.entries(INFO)) {
    if (curatedIds.has(id)) continue;
    const cityFromLoc = info.location.split(',')[0]?.trim().toLowerCase() ?? id.toLowerCase();
    const rarity = getRarity(id) ?? 'common';
    const quests = getQuests(id);
    const missions: Mission[] = quests.map(q => ({
      id: q.id,
      label: q.label,
      skin: TIER_TO_SKIN[q.tier],
      // photo + photo+time + photo+friends + receipt + local-cuisine +
      // altitude + hidden-geofence all need a captured image; geofence +
      // duration are passive checks. Quizzes/trivia were retired — the
      // quest engine no longer emits plaque-quiz verifications.
      ...(q.verify === 'geofence' || q.verify === 'duration' ? {} : { verify: 'photo' as const }),
    }));
    out.push({
      id, name: info.name, location: info.location,
      cityKeys: [cityFromLoc], emoji: '🏛️', rarity, fact: info.fact, missions,
    });
  }
  return out;
})();

const ALL_MONUMENTS: CollectibleBase[] = [...MONUMENTS, ...AUTO_MONUMENTS];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RARITY_COLOR: Record<Rarity, string> = {
  common: '#34d399', rare: '#818cf8', epic: '#f472b6', legendary: '#f59e0b',
};

type CollectedItem = { monumentId: string; skin: string; active?: boolean };
type MissionItem   = { missionId: string; photoUrl?: string | null };

// ─── Sub-component: Detail view for a single collectible ──────────────────────

function DetailView({
  item, collected, missions, tripLocs, loading, isDev,
  onUnlock, onMission, onBack, onEquipSkin,
}: {
  item: CollectibleBase;
  collected: CollectedItem[];
  missions: MissionItem[];
  tripLocs: string[];
  loading: boolean;
  isDev: boolean;
  onUnlock: (item: CollectibleBase, e: React.MouseEvent<HTMLElement>) => void;
  onMission: (item: CollectibleBase, mission: Mission) => void;
  onBack: () => void;
  onEquipSkin: (item: CollectibleBase, skinId: string) => void;
}) {
  // Any row counts as unlocked — matches the globe's `_collectedMonuments`
  // gate (LocationClient.tsx) which also accepts ANY skin row. Older
  // accounts can have mission-skin rows (e.g. {skin:'gold'}) without a
  // matching {skin:'default'} row from data drift in earlier code paths.
  // Requiring 'default' here made those monuments look LOCKED in the
  // collection while still rendering as UNLOCKED on the globe.
  const unlocked   = collected.some(c => c.monumentId === item.id);
  const hasSkin    = (sk: string) => collected.some(c => c.monumentId === item.id && c.skin === sk);
  const missionDone = (mid: string) => missions.some(m => m.missionId === mid);
  const missionPhoto = (mid: string) => missions.find(m => m.missionId === mid)?.photoUrl ?? null;
  const canUnlock  = !unlocked && (isDev || item.cityKeys.some(k => tripLocs.some(t => t.includes(k))));

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', color: '#a78bfa',
        fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0, fontWeight: 600,
      }}>
        {String.fromCodePoint(0x2190)} Back
      </button>

      {/* Compact title row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 18, paddingBottom: 14,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Title + rarity + unlocked tick now read as ONE scan instead
              of stacking onto two lines. Per skill §6 visual-hierarchy:
              metadata stays glued to the headline it describes. */}
          <div style={{
            fontSize: 20, fontWeight: 700, color: '#f2f2f8',
            fontFamily: 'var(--font-display, Georgia, serif)',
            letterSpacing: '-0.01em', lineHeight: 1.15,
            minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}>
            {item.name}
          </div>
          <span style={{
            padding: '2px 10px', borderRadius: 99,
            background: `${RARITY_COLOR[item.rarity]}18`,
            border: `1px solid ${RARITY_COLOR[item.rarity]}40`,
            color: RARITY_COLOR[item.rarity], fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}>
            {item.rarity.toUpperCase()}
          </span>
          {unlocked && (
            <span aria-label="Collected" title="Collected" style={{ color: '#a78bfa', fontSize: 14, lineHeight: 1 }}>
              {String.fromCodePoint(0x2713)}
            </span>
          )}
        </div>
        <div style={{ flexShrink: 0 }}>
          {!unlocked && canUnlock && (
            <ShimmerButton onClick={(e) => onUnlock(item, e)} disabled={loading}>
              {loading ? '...' : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Unlock size={14} /> Collect
                </span>
              )}
            </ShimmerButton>
          )}
          {!unlocked && !canUnlock && (
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 1.3,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <Lock size={12} /> <span>Visit<br />to unlock</span>
            </div>
          )}
        </div>
      </div>

      {/* Cohesion: "Plan a trip here" deep-link. When the user hasn't yet
          visited this monument, the natural next-action is to plan a trip
          to its city. Routes to /plan/location with ?location= prefilled
          so the globe opens centered on that destination. */}
      {!unlocked && item.location && (
        <Link
          href={`/plan/location?location=${encodeURIComponent(item.location)}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, marginBottom: 18,
            padding: '12px 14px', borderRadius: 12,
            background: 'rgba(125,211,252,0.08)',
            border: '1px solid rgba(125,211,252,0.28)',
            color: 'var(--brand-ink)', textDecoration: 'none',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-mono-display), monospace',
              fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'var(--brand-accent-2, #7dd3fc)',
              fontWeight: 700, marginBottom: 2,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Sparkle size={10} /> Want to go?
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--brand-ink-dim)', lineHeight: 1.4 }}>
              Plan a trip to <strong style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>{item.location}</strong>
            </div>
          </div>
          <span aria-hidden style={{ fontSize: 18, color: 'var(--brand-accent-2, #7dd3fc)' }}>→</span>
        </Link>
      )}

      {/* Missions divider — quieter than the previous heavy mono caps which
          were competing with the title. Skill §6: section headings should
          guide the eye, not shout for attention. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        margin: '0 0 12px',
        color: 'rgba(255,255,255,0.42)',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
      }}>
        <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} aria-hidden />
        <span>Skin Quests</span>
        <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} aria-hidden />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {item.missions.map(ms => {
            const done = missionDone(ms.id);
            const skinEarned = hasSkin(ms.skin.id);
            const proofPhoto = ms.verify === 'photo' && done ? missionPhoto(ms.id) : null;
            return (
              <div key={ms.id} style={{
                background: done ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${done ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 12, padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                    <Sparkle size={10} /> {ms.skin.name} Skin
                  </div>
                </div>
                {skinEarned ? (
                  // Skin owned → either "Equipped" badge or "Equip" CTA so
                  // the user can switch which skin is currently active on
                  // the globe (calls /api/monuments action:set_skin).
                  (() => {
                    const isActive = collected.some(c => c.monumentId === item.id && c.skin === ms.skin.id && c.active);
                    return isActive ? (
                      <div style={{
                        padding: '6px 12px', borderRadius: 8, flexShrink: 0,
                        background: 'rgba(52,211,153,0.18)',
                        border: '1px solid rgba(52,211,153,0.45)',
                        color: '#34d399', fontSize: 10, fontWeight: 800,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                      }}>Equipped</div>
                    ) : (
                      <button onClick={() => onEquipSkin(item, ms.skin.id)} disabled={loading} style={{
                        padding: '6px 12px', borderRadius: 8, border: `1px solid ${ms.skin.color}66`, flexShrink: 0,
                        background: `${ms.skin.color}22`,
                        color: ms.skin.color, fontSize: 11, fontWeight: 700,
                        cursor: loading ? 'wait' : 'pointer',
                      }}>Equip</button>
                    );
                  })()
                ) : done ? (
                  <div style={{ color: '#34d399', fontSize: 20, flexShrink: 0 }}>{String.fromCodePoint(0x2713)}</div>
                ) : (
                  <button onClick={() => onMission(item, ms)} disabled={loading} style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none', flexShrink: 0,
                    background: `${ms.skin.color}`,
                    color: '#000', fontSize: 11, fontWeight: 800,
                    cursor: loading ? 'wait' : 'pointer',
                  }}>
                    {loading ? '...' : ms.verify === 'photo' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Camera size={12} /> Claim
                      </span>
                    ) : 'Claim'}
                  </button>
                )}
              </div>
              {proofPhoto && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  marginLeft: 34,
                }}>
                  <div style={{
                    fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.4)', fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                    <Camera size={10} /> Your proof photo
                  </div>
                  <a
                    href={proofPhoto}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'block', borderRadius: 10, overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.08)',
                      maxWidth: 220, lineHeight: 0,
                    }}
                  >
                    <img
                      src={proofPhoto}
                      alt={`Proof for ${ms.label}`}
                      style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 180, objectFit: 'cover' }}
                    />
                  </a>
                </div>
              )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  /** Monument key to pre-select when the shop opens, e.g. from a globe tap.
   *  Matched against CollectibleBase.id in MONUMENTS / AUTO_MONUMENTS. */
  initialMk?: string | null;
}

export default function MonumentShop({ open, onClose, initialMk }: Props) {
  const { data: session } = useSession();
  const isDevClient = DEV_EMAILS.has(session?.user?.email?.toLowerCase() ?? '');
  const [tab,       setTab]       = useState<'monuments' | 'animals'>('monuments');
  const [collected, setCollected] = useState<CollectedItem[]>([]);
  const [missions,  setMissions]  = useState<MissionItem[]>([]);
  const [tripLocs,  setTripLocs]  = useState<string[]>([]);
  const [selected,  setSelected]  = useState<CollectibleBase | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [msg,       setMsg]       = useState('');
  // Remembers the most recent unlock so we can offer a share CTA. Cleared on
  // tab switch / error / close.
  const [lastUnlock, setLastUnlock] = useState<{ mk: string; name: string; skin: string } | null>(null);
  // Captures the DOM element of whichever button fired the last unlock, so
  // UnlockCeremony's bloom phase can radiate from the actual tap point.
  const unlockOriginRef = useRef<HTMLElement | null>(null);
  const [filter,    setFilter]    = useState<'all' | 'unlocked' | 'locked'>('all');
  const [rarityFilter, setRarityFilter] = useState<'all' | Rarity>('all');
  const [isDevServer, setIsDevServer] = useState(false);
  const isDev = isDevClient || isDevServer;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/monuments');
      if (!res.ok) return;
      const data = await res.json() as { collected: CollectedItem[]; missions: MissionItem[]; tripLocations: string[]; isDev?: boolean };
      setCollected(data.collected); setMissions(data.missions); setTripLocs(data.tripLocations); setIsDevServer(!!data.isDev);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { if (open) { load(); setSelected(null); setMsg(''); setLastUnlock(null); } }, [open, load]);

  // Pre-select a monument when the shop opens via globe tap. Lands the user
  // straight on the detail view (quests, proof photos, skin chooser) instead
  // of the general grid — even for locked monuments, where the detail shows
  // the rarity tier and the quests required to unlock. Also handles animal
  // taps by flipping to the Animals tab when the mk is found there.
  useEffect(() => {
    if (!open || !initialMk) return;
    const inMonuments = ALL_MONUMENTS.find(m => m.id === initialMk);
    const inAnimals = inMonuments ? null : ANIMALS.find(a => a.id === initialMk);
    const target = inMonuments ?? inAnimals;
    if (!target) return;
    setTab(inAnimals ? 'animals' : 'monuments');
    setSelected(target);
  }, [open, initialMk]);

  // Reset selected when switching tabs
  const switchTab = (t: typeof tab) => { setTab(t); setSelected(null); setMsg(''); setLastUnlock(null); };

  // Match the `unlocked` check above — any skin row counts as collected
  // so the filter ("Unlocked" tab) is consistent with what the cards show.
  const isCollected = (id: string) => collected.some(c => c.monumentId === id);
  const canUnlock   = (item: CollectibleBase) =>
    !isCollected(item.id) && (isDev || item.cityKeys.some(k => tripLocs.some(t => t.includes(k))));

  async function unlock(item: CollectibleBase) {
    setLoading(true); setMsg('');
    const res = await fetch('/api/monuments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unlock', monumentId: item.id }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`${item.name} added to your collection!`);
      setLastUnlock({ mk: item.id, name: item.name, skin: 'default' });
      // Only fire first_unlock when this was genuinely their first monument.
      if (collected.length === 0) track('first_unlock', { mk: item.id, via: 'unlock' });
      await load();
      window.dispatchEvent(new Event('geknee:monuments-updated'));
      // Spin the globe to the newly-unlocked monument so the user sees
      // the unlock land in its real location. Both globes (web Three.js
      // + Capacitor Mapbox) listen for this event — same channel as the
      // search box's "fly to destination" flow.
      const ll = MONUMENT_LATLON[item.id];
      if (ll) {
        // City-level zoom so the user sees the monument standing in
        // its actual neighborhood, not a continental dot. Both globes
        // accept an optional zoom in the event detail (default 3 for
        // the search-box fly which wants a continent-scale framing).
        window.dispatchEvent(new CustomEvent('geknee:globe-fly-to', {
          detail: { lat: ll.lat, lon: ll.lon, zoom: 12 },
        }));
      }
      // Auto-close the modal sooner now (T+0.8s) so the user lands on
      // the globe just as the camera arrives at the monument and the
      // UnlockCeremony orb explodes.
      setTimeout(onClose, 800);
    }
    else { setMsg(data.error ?? 'Error'); setLastUnlock(null); await load(); } // refresh state on error too (e.g. "Already collected" from another session)
    setLoading(false);
  }

  const [pendingMission, setPendingMission] = useState<{ item: CollectibleBase; ms: Mission } | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  function compressImage(file: File, maxWidth = 800, quality = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    compressImage(file).then(setPhotoPreview).catch(() => setMsg('Failed to load photo'));
  }

  async function completeMission(item: CollectibleBase, ms: Mission, photoData?: string) {
    setLoading(true); setMsg('');
    try {
      if (ms.verify === 'photo' && !photoData && !isDev) {
        setPendingMission({ item, ms });
        setLoading(false);
        return;
      }

      // Geolocation removed per privacy directive — only flight
      // departure detection requests location now. Monument missions
      // submit without lat/lon; the API will trust the user's claim
      // that they're at the monument or a server-side verification
      // path can be added later.
      const lat: number | undefined = undefined;
      const lon: number | undefined = undefined;

      const res = await fetch('/api/monuments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mission', monumentId: item.id, missionId: ms.id, skin: ms.skin.id, lat, lon, photoUrl: photoData }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`${ms.skin.name} skin unlocked!`);
        setLastUnlock({ mk: item.id, name: item.name, skin: ms.skin.id });
        // Push the unlock to the global share-toast bridge with the proof
        // photo URL the API just persisted to Blob (data.mission.photoUrl).
        // The toast wins the race against Lm's later bridge-flip detection
        // because _hasPendingUnlockFor(mk) makes Lm bail.
        _setPendingUnlock({
          mk: item.id,
          skin: ms.skin.id,
          photoUrl: data?.mission?.photoUrl ?? undefined,
        });
        setPendingMission(null);
        setPhotoPreview(null);
        await load();
        window.dispatchEvent(new Event('geknee:monuments-updated'));
      } else {
        setMsg(data.error ?? 'Error');
        await load();
      }
    } catch {
      setMsg('Failed to complete mission');
    }
    setLoading(false);
  }

  const list    = tab === 'monuments' ? ALL_MONUMENTS : ANIMALS;
  const total   = collected.filter(c => c.skin === 'default').length;
  const allTotal = ALL_MONUMENTS.length + ANIMALS.length;

  const displayed = list.filter(m => {
    if (filter === 'unlocked' && !isCollected(m.id)) return false;
    if (filter === 'locked'   &&  isCollected(m.id)) return false;
    if (rarityFilter !== 'all' && m.rarity !== rarityFilter) return false;
    return true;
  });

  // Which rarities actually exist in the current tab so we don't render
  // dead pills (e.g. no 'epic' monuments yet).
  const availableRarities = Array.from(new Set(list.map(m => m.rarity))) as Rarity[];
  const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  const sortedRarities = availableRarities.sort((a, b) => RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b));

  // Keep the component mounted while UnlockCeremony plays out, even if the
  // shop modal is closed. That way the ceremony orb can finish traveling to
  // the globe corner after the user dismisses the shop.
  if (!open && !lastUnlock) return null;

  return (
    <>
      <UnlockCeremony trigger={lastUnlock} originRef={unlockOriginRef} />
      {open && (
    <div style={{
      // Fullscreen overlay. Earlier iterations docked the sheet to the
      // bottom 55svh so the globe stayed visible behind, but the user
      // wanted the full detail screen back — too much content (skin
      // quests, share, leaderboard) was getting cropped at the bottom.
      // Globe-zoom-to-monument now happens on tap (see CapacitorGlobe
      // marker click), so the live preview moment lives BEFORE the
      // shop opens, not behind it.
      position: 'fixed', inset: 0, zIndex: 9000, animation: 'modalFadeIn 0.25s ease-out',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      background: 'rgba(2, 4, 12, 0.92)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative',
        background: 'linear-gradient(135deg,#0a0f1e,#0f172a,#1a0a2e)',
        border: '1px solid rgba(167, 139, 250,0.3)',
        width: '100%', maxWidth: 640,
        animation: 'modalSlideUp 0.3s ease-out',
        // Fullscreen — claim the entire viewport. iOS safe-area insets
        // handled inside the inner content padding where needed.
        height: '100svh', maxHeight: '100svh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 -16px 60px rgba(0,0,0,0.6), 0 0 60px rgba(167, 139, 250,0.1)',
        overflow: 'hidden',
      }}>
        {/* Absolute-positioned Close pill — anchored top-right of the modal
            so it stays visible regardless of how wide the header content
            grows (was getting clipped on iPhone 15 Pro previously). */}
        <button
          onClick={onClose}
          aria-label="Close collection"
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 10,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px 7px 12px', borderRadius: 999,
            background: 'rgba(15,23,42,0.55)',
            border: '1px solid rgba(167,139,250,0.45)',
            color: '#e9d5ff', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer', fontFamily: 'inherit',
            lineHeight: 1,
            WebkitBackdropFilter: 'blur(14px) saturate(140%)',
            backdropFilter: 'blur(14px) saturate(140%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 14px rgba(167,139,250,0.22)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Close
        </button>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        {/* Collection-home chrome — title, counter, Wrap + Leaderboard pills,
            progress bar, Monuments/Animals tabs. Hidden once the user drills
            into a specific monument (selected != null) — at that point this
            is just noise above the quest list and crowds the Close pill.
            Reappears when Back returns to the grid. */}
        {!selected && (
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{
                fontSize: 24, fontWeight: 500,
                fontFamily: 'var(--font-display, Georgia, serif)',
                color: '#f2f2f8',
                letterSpacing: '-0.01em',
                lineHeight: 1.1,
              }}>
                {tab === 'monuments' ? 'Monuments' : 'Animals'},
                {' '}
                <em style={{ fontStyle: 'italic', color: '#a78bfa' }}>earned.</em>
              </div>
              <div style={{ fontSize: 11, color: '#a8a8c0', marginTop: 4, letterSpacing: '0.02em' }}>
                {total} of {allTotal} unlocked
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Year Wrap — lives next to Leaderboard in the MonumentShop
                  header since they're sibling "year in review" surfaces. */}
              <Link
                href={`/wrapped?year=${currentIssueYear()}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 999,
                  background: 'rgba(125,211,252,0.14)',
                  border: '1px solid rgba(125,211,252,0.35)',
                  WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                  backdropFilter: 'blur(14px) saturate(140%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 14px rgba(125,211,252,0.18)',
                  color: '#bae6fd',
                  fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.04em',
                  textDecoration: 'none',
                  fontFamily: 'inherit',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                  <circle cx="8" cy="8" r="5" />
                  <path d="M3 8c2 1.6 4 2.5 5 2.5s3-.9 5-2.5" />
                </svg>
                <span>{currentIssueYear()} Wrap</span>
              </Link>
              <Link
                href="/leaderboard"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 999,
                  background: 'rgba(167,139,250,0.14)',
                  border: '1px solid rgba(167,139,250,0.35)',
                  WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                  backdropFilter: 'blur(14px) saturate(140%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 14px rgba(167,139,250,0.20)',
                  color: '#c7d2fe',
                  fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.04em',
                  textDecoration: 'none',
                  fontFamily: 'inherit',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 2h6v4a3 3 0 0 1-6 0V2z" />
                  <path d="M3 4H1.5v2A2.5 2.5 0 0 0 4 8.5M13 4h1.5v2A2.5 2.5 0 0 1 12 8.5" />
                  <path d="M6.5 11h3l.5 3h-4z" />
                </svg>
                <span>Leaderboard</span>
              </Link>
              {/* Close button moved to absolute top-right of the modal
                  (see CLOSE_PILL below the modal-root return) — the inline
                  spot ran out of horizontal room next to Wrap +
                  Leaderboard and got clipped on iPhone 15 Pro width. */}
            </div>
          </div>

          {/* Progress */}
          <div style={{ height: 4, background: 'rgba(148,163,208,0.12)', borderRadius: 99, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: 'linear-gradient(90deg,#a78bfa,#7dd3fc)',
              width: `${(total / allTotal) * 100}%`,
              transition: 'width 0.6s ease',
            }} />
          </div>

          {/* Tabs: Monuments | Animals — pill style */}
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { key: 'monuments', label: 'Monuments' },
              { key: 'animals',   label: 'Animals' },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => switchTab(key)} style={{
                padding: '7px 16px', borderRadius: 999,
                background: tab === key ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tab === key ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.10)'}`,
                WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                backdropFilter: 'blur(14px) saturate(140%)',
                boxShadow: tab === key
                  ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 14px rgba(167,139,250,0.22)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.25)',
                color: tab === key ? '#c4b5fd' : '#a8a8c0',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        )}

        {/* ── Body ────────────────────────────────────────────────────────── */}
        {/* Top padding bumps up when the home-chrome is hidden so the Back
            button doesn't sit directly under the absolute-positioned Close
            pill (top: 12). 56px clears the pill + 8px breathing room. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: selected ? '56px 24px 24px' : '16px 24px 24px' }}>

          {pendingMission && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.8)', WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)',
            }} onClick={() => { setPendingMission(null); setPhotoPreview(null); }}>
              <div onClick={e => e.stopPropagation()} style={{
                background: '#1a1a2e', borderRadius: 16, padding: 24, maxWidth: 340, width: '90%',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
                  {'\u{1F4F7}'} Photo Verification
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16, lineHeight: 1.5 }}>
                  {pendingMission.ms.label}
                </div>
                {photoPreview ? (
                  <div style={{ marginBottom: 16 }}>
                    <img src={photoPreview} alt="Mission photo" style={{
                      width: '100%', borderRadius: 10, maxHeight: 220, objectFit: 'cover',
                    }} />
                  </div>
                ) : (
                  <label style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: 140, borderRadius: 12, border: '2px dashed rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.03)', cursor: 'pointer', marginBottom: 16,
                    color: 'rgba(255,255,255,0.4)', fontSize: 13, gap: 8,
                  }}>
                    <span style={{ fontSize: 32 }}>{'\u{1F4F8}'}</span>
                    Tap to take or choose a photo
                    <input type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect}
                      style={{ display: 'none' }} />
                  </label>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setPendingMission(null); setPhotoPreview(null); }} style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                    background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer',
                  }}>Cancel</button>
                  <button disabled={!photoPreview || loading} onClick={() => {
                    if (pendingMission && photoPreview) completeMission(pendingMission.item, pendingMission.ms, photoPreview);
                  }} style={{
                    flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                    background: photoPreview ? pendingMission.ms.skin.color : 'rgba(255,255,255,0.08)',
                    color: photoPreview ? '#000' : 'rgba(255,255,255,0.3)',
                    fontSize: 13, fontWeight: 700, cursor: photoPreview ? 'pointer' : 'default',
                  }}>{loading ? 'Uploading...' : 'Submit & Claim'}</button>
                </div>
              </div>
            </div>
          )}

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

          {!selected && session?.user && (() => {
            const uid = (session.user as { id?: string }).id;
            if (!uid) return null;
            return (
              <a
                href={`/u/${uid}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'block', marginBottom: 12,
                  padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(167, 139, 250,0.14)',
                  border: '1px solid rgba(167, 139, 250,0.32)',
                  WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                  backdropFilter: 'blur(14px) saturate(140%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 14px rgba(167,139,250,0.20)',
                  color: '#c4b5fd', fontSize: 12, fontWeight: 700,
                  textDecoration: 'none', textAlign: 'center',
                }}
              >
                {String.fromCodePoint(0x1F517)} View your public collection page
              </a>
            );
          })()}

          {lastUnlock && (() => {
            const username = (session?.user?.name ?? session?.user?.email?.split('@')[0] ?? 'traveler')
              .replace(/\s+/g, '').slice(0, 32);
            // base64url-encode the slug client-side — stateless share URL
            const slug = typeof btoa === 'function'
              ? btoa(JSON.stringify({ u: username, mk: lastUnlock.mk, skin: lastUnlock.skin }))
                  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
              : '';
            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://geknee.com';
            const shareUrl = `${origin}/share/${slug}`;
            const shareText = `Just unlocked the ${lastUnlock.skin.toUpperCase()} ${lastUnlock.name} on @geknee ${String.fromCodePoint(0x1F30D)}`;
            const twitter   = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
            const copy = async () => {
              try { await navigator.clipboard.writeText(shareUrl); setMsg('Link copied!'); } catch {}
            };
            return (
              <div style={{
                background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(167, 139, 250,0.15))',
                border: '1px solid rgba(245,158,11,0.35)',
                borderRadius: 12, padding: '12px 14px', marginBottom: 12,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fde68a', marginBottom: 8, letterSpacing: 0.5 }}>
                  {String.fromCodePoint(0x2728)} Share your unlock
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a
                    href={twitter}
                    target="_blank" rel="noreferrer"
                    onClick={() => track('share_click', { channel: 'twitter', mk: lastUnlock.mk, skin: lastUnlock.skin })}
                    style={{
                      padding: '8px 14px', borderRadius: 8, background: '#1d9bf0',
                      color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none',
                    }}
                  >Post to X</a>
                  <button
                    onClick={() => { track('share_click', { channel: 'copy', mk: lastUnlock.mk, skin: lastUnlock.skin }); copy(); }}
                    style={{
                      padding: '8px 14px', borderRadius: 8, background: '#7dd3fc',
                      color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                    }}
                  >Copy link</button>
                  <a
                    href={shareUrl}
                    target="_blank" rel="noreferrer"
                    onClick={() => track('share_click', { channel: 'preview', mk: lastUnlock.mk, skin: lastUnlock.skin })}
                    style={{
                      padding: '8px 14px', borderRadius: 8, background: '#06b6d4',
                      color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none',
                    }}
                  >Preview</a>
                </div>
              </div>
            );
          })()}

          {/* Detail view */}
          {selected ? (
            <DetailView
              item={selected} collected={collected} missions={missions} tripLocs={tripLocs}
              loading={loading} isDev={isDev}
              onUnlock={async (it, e) => {
                unlockOriginRef.current = e.currentTarget as HTMLElement;
                await unlock(it);
              }}
              onMission={async (it, ms) => { await completeMission(it, ms); }}
              onBack={() => { setSelected(null); setMsg(''); }}
              onEquipSkin={async (it, skinId) => {
                // Set the chosen skin active server-side; reload state so
                // the "Equipped" badge moves to the new skin row.
                setLoading(true);
                try {
                  const res = await fetch('/api/monuments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'set_skin', monumentId: it.id, skin: skinId }),
                  });
                  if (res.ok) {
                    await load();
                    // Tell both globes to refresh their monument render
                    // (web Three.js Lm cache + Capacitor Mapbox layer)
                    // so the new skin appears without a page refresh.
                    window.dispatchEvent(new Event('geknee:monuments-updated'));
                  }
                } finally { setLoading(false); }
              }}
            />
          ) : (
            <>
              {/* Status pills */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                {(['all', 'unlocked', 'locked'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding: '5px 14px', borderRadius: 999, border: '1px solid',
                    borderColor: filter === f ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.10)',
                    background: filter === f ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.04)',
                    WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                    backdropFilter: 'blur(14px) saturate(140%)',
                    boxShadow: filter === f
                      ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 3px 12px rgba(167,139,250,0.22)'
                      : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.25)',
                    color: filter === f ? '#c4b5fd' : '#a8a8c0',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                    fontFamily: 'inherit',
                  }}>
                    {f}
                  </button>
                ))}
              </div>

              {/* Rarity pills — colored dots only; tap an active one again to clear. */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
                {sortedRarities.map(r => {
                  const rColor = RARITY_COLOR[r];
                  const active = rarityFilter === r;
                  const anyActive = rarityFilter !== 'all';
                  return (
                    <button
                      key={r}
                      onClick={() => setRarityFilter(active ? 'all' : r)}
                      aria-label={`Filter by ${r}`}
                      aria-pressed={active}
                      title={r.charAt(0).toUpperCase() + r.slice(1)}
                      style={{
                        width: 18, height: 18, borderRadius: 999, padding: 0,
                        border: `1px solid ${active ? rColor : `${rColor}55`}`,
                        background: active ? rColor : `${rColor}33`,
                        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                        backdropFilter: 'blur(14px) saturate(140%)',
                        boxShadow: active
                          ? `inset 0 1px 0 rgba(255,255,255,0.25), 0 0 0 2px ${rColor}33, 0 2px 8px ${rColor}44`
                          : 'inset 0 1px 0 rgba(255,255,255,0.10)',
                        opacity: !anyActive || active ? 1 : 0.45,
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    />
                  );
                })}
              </div>

              {/* Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {displayed.map(item => {
                  const unlocked = isCollected(item.id);
                  const eligible = canUnlock(item);
                  const skinsEarned = item.missions.filter(ms => collected.some(c => c.monumentId === item.id && c.skin === ms.skin.id)).length;
                  const rColor = RARITY_COLOR[item.rarity];
                  const card = (
                    <MagicCard
                      gradientColor={unlocked ? rColor : '#a78bfa'}
                      gradientSize={180}
                      gradientOpacity={unlocked ? 0.5 : 0.35}
                      style={{
                        background: unlocked
                          ? `linear-gradient(165deg, ${rColor}1f, rgba(255,255,255,0.03))`
                          : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${unlocked ? `${rColor}66` : eligible ? 'rgba(167, 139, 250, 0.25)' : 'rgba(148,163,208,0.18)'}`,
                        borderRadius: 14,
                        opacity: unlocked ? 1 : 0.7,
                        transition: 'opacity 150ms ease',
                      }}>
                    <div onClick={() => setSelected(item)}
                      style={{
                        padding: 14, cursor: 'pointer',
                      }}>

                      {/* Glyph circle (replaces raw emoji) */}
                      <div style={{
                        width: 56, height: 56, borderRadius: 12,
                        background: unlocked
                          ? `radial-gradient(circle, ${rColor}40, transparent 70%)`
                          : 'rgba(255,255,255,0.04)',
                        display: 'grid', placeItems: 'center',
                        marginBottom: 10,
                        fontSize: 28,
                        color: unlocked ? rColor : '#6b6b85',
                        fontFamily: 'var(--font-display, Georgia, serif)',
                        lineHeight: 1,
                        filter: unlocked ? 'none' : 'brightness(0) drop-shadow(0 0 6px rgba(167, 139, 250, 0.5))',
                      }}>
                        {item.emoji}
                      </div>

                      {/* Name */}
                      <div style={{
                        fontSize: 14, fontWeight: 500,
                        fontFamily: 'var(--font-display, Georgia, serif)',
                        color: unlocked ? '#f2f2f8' : '#a8a8c0',
                        letterSpacing: '-0.01em',
                        marginBottom: 2,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {item.name}
                      </div>
                      <div style={{
                        fontSize: 10, color: '#6b6b85',
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                      }}>
                        {unlocked ? item.location : `${item.location} · Visit to unlock`}
                      </div>

                      {/* Bottom strip: rarity tag + skins counter */}
                      <div style={{
                        marginTop: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          letterSpacing: '0.14em', textTransform: 'uppercase',
                          color: rColor,
                        }}>
                          {item.rarity}
                        </span>
                        <span style={{
                          fontSize: 10, color: '#a8a8c0',
                          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                        }}>
                          {skinsEarned}/{item.missions.length}
                        </span>
                      </div>

                      {/* Top-right marker */}
                      {!unlocked && (
                        <div style={{
                          position: 'absolute', top: 8, right: 10,
                          fontSize: 9, color: eligible ? '#a78bfa' : '#6b6b85',
                          letterSpacing: '0.1em',
                        }}>
                          {eligible ? '⌕ READY' : '⌕ VISIT'}
                        </div>
                      )}
                    </div>
                    </MagicCard>
                  );
                  // AnimatedGlowCard removed — the rotating conic-gradient
                  // border leaked outside the card on some layouts and read
                  // as a glitch. The MagicCard pointer spotlight + rarity
                  // border on unlocked cards is enough.
                  return <div key={item.id}>{card}</div>;
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
      )}
    </>
  );
}
