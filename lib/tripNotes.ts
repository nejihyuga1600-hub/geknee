// Local-first notes + journal storage for the live-now page.
//
// We're intentionally deferring the DB round-trip: the value of "capture
// what happened just now" collapses if it takes a network call to save.
// LocalStorage is instant + offline-safe, and a future TripDraft.notes
// backfill can hydrate from these keys on next open.
//
// Storage keys are per-tripId so multi-trip users don't collide:
//   geknee:trip-notes:<tripId>         → NoteEntry[]
//   geknee:journal-dismissed:<tripId>:<yyyy-mm-dd>  → '1'
//
// A soft cap of 200 entries per trip keeps the localStorage payload
// under Safari's 5MB budget even with base64-embedded thumbnails.

export type NoteKind = 'quick' | 'journal';

export interface NoteEntry {
  id: string;                   // ISO timestamp + short random, sortable
  kind: NoteKind;
  text: string | null;
  photoDataUrl: string | null;  // base64; null when text-only
  createdAtMs: number;
  // Auto-tags (all optional — captured best-effort from live-now context)
  place: string | null;
  tempC: number | null;
  lat: number | null;
  lng: number | null;
}

const MAX_ENTRIES = 200;

function notesKey(tripId: string): string {
  return `geknee:trip-notes:${tripId}`;
}

function journalDismissedKey(tripId: string, yyyymmdd: string): string {
  return `geknee:journal-dismissed:${tripId}:${yyyymmdd}`;
}

// Format today as YYYY-MM-DD in the *viewer's* timezone. Good enough for
// dismiss-per-day since a traveler checking the app is usually in the trip TZ.
export function todayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function loadNotes(tripId: string): NoteEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(notesKey(tripId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidNote);
  } catch {
    // Corrupt payload — self-clear so the next save writes a fresh array.
    try { window.localStorage.removeItem(notesKey(tripId)); } catch {}
    return [];
  }
}

export function saveNote(tripId: string, entry: NoteEntry): NoteEntry[] {
  const list = loadNotes(tripId);
  list.unshift(entry); // newest first
  const trimmed = list.slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(notesKey(tripId), JSON.stringify(trimmed));
  } catch {
    // QuotaExceeded — drop the oldest half and retry once. Photo entries
    // are the biggest offenders.
    const halved = trimmed.slice(0, Math.floor(MAX_ENTRIES / 2));
    try { window.localStorage.setItem(notesKey(tripId), JSON.stringify(halved)); } catch {}
    return halved;
  }
  return trimmed;
}

export function deleteNote(tripId: string, entryId: string): NoteEntry[] {
  const list = loadNotes(tripId).filter(e => e.id !== entryId);
  try { window.localStorage.setItem(notesKey(tripId), JSON.stringify(list)); } catch {}
  return list;
}

export function newNoteId(now: Date = new Date()): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${now.toISOString()}-${rand}`;
}

export function isJournalDismissedToday(tripId: string, now: Date = new Date()): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(journalDismissedKey(tripId, todayIsoDate(now))) === '1'; }
  catch { return false; }
}

export function dismissJournalForToday(tripId: string, now: Date = new Date()): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(journalDismissedKey(tripId, todayIsoDate(now)), '1'); }
  catch {}
}

function isValidNote(v: unknown): v is NoteEntry {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string'
    && (o.kind === 'quick' || o.kind === 'journal')
    && (o.text === null || typeof o.text === 'string')
    && (o.photoDataUrl === null || typeof o.photoDataUrl === 'string')
    && typeof o.createdAtMs === 'number';
}

// Convert an <input type=file> pick into a base64 data URL, downscaled
// so thumbnails stay small (max 1200 px on the long edge, JPEG q0.72).
// Returns null on decode failure — caller falls back to text-only save.
export async function fileToScaledDataUrl(file: File): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const MAX = 1200;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); resolve(null); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { resolve(canvas.toDataURL('image/jpeg', 0.72)); }
      catch { resolve(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
