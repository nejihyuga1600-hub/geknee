// lib/safety/emergencyNumbers.ts
// Country-aware emergency numbers. Seeded from the public EENA/ITU dataset.
// Most of the world uses 112; this map captures the common exceptions plus
// top travel destinations. Expand as needed — the lookup always falls back
// to 112 so a missing country still produces a usable number.

export interface EmergencyNumbers {
  /** General/universal emergency number, shown first. */
  universal: string;
  police: string;
  ambulance: string;
  fire: string;
}

// Keyed by ISO 3166-1 alpha-2 (uppercase).
const NUMBERS: Record<string, EmergencyNumbers> = {
  US: { universal: '911', police: '911', ambulance: '911', fire: '911' },
  CA: { universal: '911', police: '911', ambulance: '911', fire: '911' },
  GB: { universal: '999', police: '999', ambulance: '999', fire: '999' },
  IE: { universal: '112', police: '112', ambulance: '112', fire: '112' },
  AU: { universal: '000', police: '000', ambulance: '000', fire: '000' },
  NZ: { universal: '111', police: '111', ambulance: '111', fire: '111' },
  JP: { universal: '110', police: '110', ambulance: '119', fire: '119' },
  CN: { universal: '110', police: '110', ambulance: '120', fire: '119' },
  IN: { universal: '112', police: '100', ambulance: '102', fire: '101' },
  MX: { universal: '911', police: '911', ambulance: '911', fire: '911' },
  BR: { universal: '190', police: '190', ambulance: '192', fire: '193' },
  FR: { universal: '112', police: '17', ambulance: '15', fire: '18' },
  DE: { universal: '112', police: '110', ambulance: '112', fire: '112' },
  ES: { universal: '112', police: '091', ambulance: '112', fire: '080' },
  IT: { universal: '112', police: '113', ambulance: '118', fire: '115' },
  PT: { universal: '112', police: '112', ambulance: '112', fire: '112' },
  NL: { universal: '112', police: '112', ambulance: '112', fire: '112' },
  CH: { universal: '112', police: '117', ambulance: '144', fire: '118' },
  AT: { universal: '112', police: '133', ambulance: '144', fire: '122' },
  GR: { universal: '112', police: '100', ambulance: '166', fire: '199' },
  TR: { universal: '112', police: '155', ambulance: '112', fire: '110' },
  AE: { universal: '999', police: '999', ambulance: '998', fire: '997' },
  TH: { universal: '191', police: '191', ambulance: '1669', fire: '199' },
  ID: { universal: '112', police: '110', ambulance: '118', fire: '113' },
  SG: { universal: '999', police: '999', ambulance: '995', fire: '995' },
  KR: { universal: '112', police: '112', ambulance: '119', fire: '119' },
  ZA: { universal: '112', police: '10111', ambulance: '10177', fire: '10111' },
  EG: { universal: '122', police: '122', ambulance: '123', fire: '180' },
};

const FALLBACK: EmergencyNumbers = { universal: '112', police: '112', ambulance: '112', fire: '112' };

/** Look up emergency numbers by ISO alpha-2 code; falls back to 112 (GSM universal). */
export function emergencyNumbersFor(countryCode: string | null | undefined): {
  numbers: EmergencyNumbers;
  isFallback: boolean;
} {
  const cc = (countryCode ?? '').toUpperCase();
  const hit = NUMBERS[cc];
  return hit ? { numbers: hit, isFallback: false } : { numbers: FALLBACK, isFallback: true };
}
