// Curated landmark write-ups for the live-now page's "About your next stop"
// card. Text-only for MVP — audio deferred per the 2026-08-03 handoff.
//
// Keyed by a fuzzy-normalized landmark name (lowercase, punctuation
// stripped, articles dropped). A fuzzy match layer lets us catch
// "The Eiffel Tower" and "eiffel tower" from the same key.
//
// Add liberally — silent-on-miss means adding entries only helps.

export interface LandmarkGuide {
  intro: string;               // one paragraph, 2-4 sentences
  facts: string[];             // 2-3 punchy fun facts
  bestTime?: string;           // "sunrise" | "weekday morning" | "avoid summer noon"
  tip?: string;                // one insider line
}

// Normalization used both for the keys below AND lookups. Keep the
// transforms symmetric so a match key like "sagrada familia" catches
// "La Sagrada Família", "Basílica de la Sagrada Familia", etc.
// Exported so sibling libraries (skipLineTickets) can share the same key
// space — otherwise a fuzzy-hit in one won't hit the other.
export function normalizeLandmarkKey(name: string): string {
  return normalize(name);
}

function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|la|le|el|il|de|del|de la|di|du|des)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const LANDMARK_GUIDES: Record<string, LandmarkGuide> = {
  'eiffel tower': {
    intro: "The Eiffel Tower was built in 1889 as a temporary showpiece for the World's Fair — Parisian intellectuals hated it and demanded it be torn down. It survived because its height made it the perfect radio antenna, then the perfect TV antenna, then the perfect global icon. Today it's the most-visited paid monument on Earth.",
    facts: [
      "Grows ~15 cm taller in summer heat as the iron expands.",
      "Painted by hand every 7 years; takes 60 tons of paint.",
      "Was the world's tallest building for 41 years until the Chrysler Building.",
    ],
    bestTime: 'Sunrise (empty) or after 10 PM (twinkle-light show, top of the hour)',
    tip: 'The 2nd floor is the sweet spot — better views than the summit and half the queue.',
  },
  'colosseum': {
    intro: "The Colosseum opened in AD 80 with 100 straight days of games — 9,000 animals killed in the first month alone. Its 80 arched entrances let 50,000 spectators empty out in fifteen minutes, an evacuation feat modern stadiums still copy. Two-thirds of the original stone was carted off in the Middle Ages to build churches.",
    facts: [
      "Had a retractable canvas roof (velarium) worked by 1,000 sailors.",
      "The arena floor could be flooded for mock naval battles.",
      "'Colosseum' comes from a 30-meter statue of Nero that once stood next door.",
    ],
    bestTime: 'First entry (8:30 AM) or last two hours before close',
    tip: 'Book the "Arena Floor + Underground" ticket — walking where gladiators stood beats the general admission by a mile.',
  },
  'sagrada familia': {
    intro: "Gaudí worked on Sagrada Família for 43 years — over half his life — and knew it would take another century to finish. Construction is still going, funded entirely by donations and ticket sales. The projected completion date is 2026, marking 144 years of construction.",
    facts: [
      "Every column branches like a tree — Gaudí modeled the interior on a forest.",
      "The Passion facade is deliberately harsher than the Nativity facade — a stylistic contrast Gaudí planned.",
      "Gaudí is buried in the crypt below.",
    ],
    bestTime: 'Late afternoon (3-5 PM) — light through the west stained glass turns the nave amber',
    tip: 'Pay extra for tower access — the spiral stairs down are the most photogenic part.',
  },
  'louvre': {
    intro: "The Louvre started as a 12th-century fortress, became a royal palace, and only turned into a museum in 1793 after the Revolution. It holds 380,000 objects but displays maybe 35,000 — walking every gallery takes ~35 miles of steps. The pyramid entrance was called a monstrosity in 1989; now it's iconic.",
    facts: [
      "Mona Lisa is smaller than most visitors expect — 77 x 53 cm behind a bulletproof case.",
      "Was empty during WWII: 3,600 works were secretly evacuated to châteaux in the Loire.",
      "The pyramid has exactly 673 glass panes (not 666 — that's an urban myth).",
    ],
    bestTime: 'Wednesday or Friday evening (open till 9:45 PM, crowds thin after 6 PM)',
    tip: 'Enter via the Carrousel du Louvre mall — bypasses the pyramid queue entirely.',
  },
  'prague castle': {
    intro: "Prague Castle is officially the largest ancient castle complex in the world — 70,000 m² of palaces, gardens, and cathedrals, continuously occupied since the 9th century. It sits above the Vltava on Hradčany hill and has been the seat of Bohemian kings, Holy Roman Emperors, Czechoslovak presidents, and now the Czech president.",
    facts: [
      "St. Vitus Cathedral inside took 600 years to finish (started 1344, completed 1929).",
      "The changing of the guard at noon includes a full fanfare — smaller ceremonies every hour.",
      "Franz Kafka lived on Golden Lane (Zlatá ulička) inside the walls in 1916.",
    ],
    bestTime: 'Early morning before 10 AM — tour groups start arriving',
    tip: "You don't need a ticket to walk the grounds. Buy the shortest ticket (Circuit B) — it covers the cathedral and Golden Lane, which are the highlights.",
  },
  'taj mahal': {
    intro: "The Taj Mahal was built between 1632 and 1653 by Shah Jahan as a tomb for his wife Mumtaz Mahal, who died in childbirth. It took 20,000 workers and 1,000 elephants, and Shah Jahan planned to build a mirror image in black marble across the river — until his son deposed him.",
    facts: [
      "The four minarets tilt slightly outward so they'd fall away from the tomb in an earthquake.",
      "The marble subtly changes color with the light — pink at sunrise, white at noon, gold at sunset.",
      "Semi-precious stones (jasper, jade, lapis) were inlaid using pietra dura from 28 different regions.",
    ],
    bestTime: 'Sunrise entry (buy tickets online night before) — coolest, quietest, best light',
    tip: 'Fridays are closed. Take the shoe covers offered at the gate — the marble platform is scorching by 10 AM.',
  },
  'machu picchu': {
    intro: "Machu Picchu was built ~1450 by the Inca emperor Pachacuti and abandoned about a century later during the Spanish conquest — the Spanish never found it. Local farmers knew about it, but the site was 'introduced' to the world by Hiram Bingham in 1911. It sits at 2,430 m on a saddle between two peaks.",
    facts: [
      "Not a single stone in the walls uses mortar — they're cut so tight a knife blade won't fit between them.",
      "The Intihuatana stone catches the sun exactly at solar noon on the equinoxes.",
      "Only 5,940 visitors per day allowed since 2019 — book weeks ahead.",
    ],
    bestTime: 'First entry (6 AM) — clouds usually clear by 9 AM',
    tip: 'The classic postcard view is from Guardhouse platform, uphill and left as you enter. Do that before the site.',
  },
  'petra': {
    intro: "Petra was the capital of the Nabataeans, a caravan-trading kingdom that channelled desert water into a hidden city carved from rose-red sandstone. It thrived from ~400 BC to AD 100 before Roman annexation and centuries of earthquakes reduced it to legend. Rediscovered by Europeans in 1812.",
    facts: [
      "The 'Treasury' (Al-Khazneh) is actually a tomb — the 'treasure' myth came from Bedouin folklore about the urn on the facade.",
      "The Siq canyon that leads in is 1.2 km long and 3 m wide at its narrowest.",
      "The Monastery (Ad-Deir) is 800 rock-cut steps above the main site and worth every one.",
    ],
    bestTime: 'Enter at 6 AM to walk the Siq before tour buses; return for "Petra by Night" (Mon/Wed/Thu)',
    tip: 'Wear real hiking shoes — the sandstone is slippery from centuries of foot polish.',
  },
  'stonehenge': {
    intro: "Stonehenge was built in stages between ~3000 BC and 1600 BC on Salisbury Plain — a millennium before the Great Pyramid. Its bluestones were dragged 240 km from the Preseli Hills in Wales; the massive sarsens came from 25 km away. Its exact purpose is still debated: temple, calendar, healing site, burial ground.",
    facts: [
      "Aligned to the winter solstice sunset AND summer solstice sunrise — probably both intentional.",
      "There's a second, older bluestone circle 3 km away (Bluestonehenge) discovered in 2009.",
      "Cremated remains of 63 people have been found buried around the perimeter.",
    ],
    bestTime: 'Winter weekday mornings — sunrise light + empty plain',
    tip: 'The £27 general ticket keeps you 20 m out. Book a private "Stone Circle Access" tour (£57) for pre-opening walk-among-the-stones access.',
  },
  'angkor wat': {
    intro: "Angkor Wat was built early-1100s by Khmer king Suryavarman II as a Hindu temple to Vishnu, later converted to Buddhist use. It's the largest religious monument in the world by area — the surrounding moat alone is 190 m across. The main temple's five towers represent Mount Meru, the cosmic mountain.",
    facts: [
      "Faces west instead of east, unusual for a Hindu temple — probably because it doubled as Suryavarman's tomb.",
      "The bas-reliefs along the outer gallery run 800 m and depict the Churning of the Ocean of Milk.",
      "The temple appears on Cambodia's national flag — one of only two flags with a building on it.",
    ],
    bestTime: 'Sunrise from the reflecting pool (arrive by 5 AM); revisit the interior after 10 AM when it empties',
    tip: 'Buy the 3-day pass — Angkor Thom (Bayon) and Ta Prohm are as good as Angkor Wat and get overlooked on 1-day tickets.',
  },
  'burj khalifa': {
    intro: "Burj Khalifa opened in 2010 as the world's tallest building at 828 m — 60% taller than any predecessor. The Y-shaped floor plan and setback design distribute wind load; the concrete pump used to lift material set a world record at 606 m vertical. It cost $1.5 B to build.",
    facts: [
      "The tip sways about 2 meters at the top in strong winds.",
      "At the top you can watch the sunset twice — once from the ground floor, then take the elevator up and see it again.",
      "The building's shadow at noon is over a kilometer long.",
    ],
    bestTime: 'Book the "At The Top SKY" (Level 148) at sunset — 45 minutes before sundown',
    tip: 'Skip the At The Top counter — buy online 24 h ahead for half the price.',
  },
  'hagia sophia': {
    intro: "Hagia Sophia opened in AD 537 under Justinian I as the world's largest cathedral, and held that record for nearly a thousand years. It became a mosque after the Ottoman conquest in 1453, a museum in 1934, and a mosque again in 2020. The dome — 31 m across, 55 m off the floor — was so bold that it partially collapsed twice in the first 30 years.",
    facts: [
      "Christian mosaics were plastered over, not destroyed, when it became a mosque — many were rediscovered intact in the 1930s.",
      "Four minarets were added at four different times, each in a slightly different style.",
      "The floor slopes visibly — supports have shifted over 1,500 years.",
    ],
    bestTime: 'Weekday morning outside prayer times (Fridays close for jumu\'ah 12:30–2:30 PM)',
    tip: 'The upper gallery holds the best mosaics — Deesis, Empress Zoe. Enter via the ramp on the north side.',
  },
  'statue of liberty': {
    intro: "The Statue of Liberty was a gift from France in 1886, celebrating the alliance between the two revolutionary republics. Sculpted by Bartholdi over a Gustave Eiffel iron frame, shipped in 350 pieces across the Atlantic. Her crown, torch, and tablet are richly symbolic: seven rays for the seven continents, a broken chain at her feet for freedom from tyranny.",
    facts: [
      "Originally copper-brown; the green patina took 30 years to form and now protects the metal underneath.",
      "The tablet reads 'JULY IV MDCCLXXVI' — U.S. Independence Day.",
      "Climbing to the crown is 377 steps — no elevator, book the crown ticket months out.",
    ],
    bestTime: 'First ferry of the day (8:30 AM from Battery Park); afternoon light for photos from Liberty Island',
    tip: "Free ferry alternative: ride the Staten Island Ferry (also free) past Liberty Island — you don't set foot on it, but you get the classic view for zero dollars.",
  },
  'pyramid of giza': {
    intro: "The Great Pyramid of Giza was built ~2560 BC for pharaoh Khufu — 2.3 million limestone blocks, some weighing 80 tons, hauled up ramps for 20 years. It was the tallest man-made structure on Earth for 3,800 years. The precise construction methods are still debated by Egyptologists.",
    facts: [
      "The four sides align with the cardinal points to within 4 arcminutes — better than most modern buildings.",
      "The interior 'King's Chamber' is made of granite, not limestone, hauled 800 km from Aswan.",
      "A 30 m 'void' was discovered above the Grand Gallery in 2017 using cosmic-ray muon scanning — its purpose is unknown.",
    ],
    bestTime: 'First entry at 8 AM before the desert heat; ride a camel to Panorama Point for the classic three-pyramid shot',
    tip: 'Interior access is a separate ticket. Skip it if claustrophobic — the passages are narrow, hot, and airless.',
  },
  'grand canyon': {
    intro: "The Grand Canyon exposes 2 billion years of Earth's history in a single vertical mile of colored rock. The Colorado River has been carving it for ~6 million years, but the canyon itself is much older than the current river's course. It's 446 km long, up to 29 km wide, and stunningly quiet at dawn.",
    facts: [
      "The oldest rocks at the bottom (Vishnu Schist) date to 1.75 billion years ago — nearly half the age of Earth.",
      "The canyon has its own weather system: rim can be freezing while the floor is 20°C warmer.",
      "About 5 million visitors per year — 90% only see it from the South Rim.",
    ],
    bestTime: 'Sunrise from Mather Point (South Rim) or Cape Royal (North Rim, quieter)',
    tip: "Take the free shuttle to Hermits Rest — the drive is closed to private cars and the viewpoints are the best on the rim.",
  },
  'great wall china': {
    intro: "The Great Wall isn't one wall but many, built and rebuilt over 2,000 years by successive dynasties defending against nomadic incursions from the north. Total length, including all branches and parallel walls, is about 21,000 km. The most-visited restored sections date to the Ming dynasty (14th-17th century).",
    facts: [
      "It's not visible from space with the naked eye — that's an old myth.",
      "The mortar between bricks used sticky rice flour — an ingredient discovered by chemical analysis in 2010.",
      "The steepest stairs (Jiankou section) hit 70° — hands-and-knees terrain.",
    ],
    bestTime: 'Weekday early morning at Mutianyu (less crowded than Badaling) or Jinshanling for wilder unrestored stretches',
    tip: 'Take the toboggan down at Mutianyu — it\'s a stainless-steel slide back to the parking lot and everyone loves it.',
  },
};

// Fuzzy match: tries exact normalized key, then substring containment
// in either direction. Guards against gibberish by requiring at least
// 4 shared characters in the substring match.
export function guideFor(placeName: string | null | undefined): LandmarkGuide | null {
  if (!placeName) return null;
  const q = normalize(placeName);
  if (!q) return null;
  const direct = LANDMARK_GUIDES[q];
  if (direct) return direct;
  for (const [k, v] of Object.entries(LANDMARK_GUIDES)) {
    if (k.length >= 4 && (q.includes(k) || k.includes(q))) return v;
  }
  return null;
}

// Introspection for tooling / tests.
export function landmarksWithGuides(): string[] {
  return Object.keys(LANDMARK_GUIDES);
}
