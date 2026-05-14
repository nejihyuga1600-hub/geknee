// Pure parsing helpers for AI-generated itinerary markdown.
// Extracted from app/plan/summary/page.tsx during the summary-page split so
// other surfaces (Live trip, future tools) can reuse the same logic without
// pulling in the 2.5kLOC summary client bundle.

export interface Section {
  id: string;
  heading: string;
  lines: string[];
}

export type ActivityGroup =
  | { type: 'activity'; headline: string; headlineIdx: number; details: { line: string; idx: number }[] }
  | { type: 'plain';    line: string;     idx: number };

// Subheadings inside a day that are pure time-of-day labels — strip them
// entirely so activities flow chronologically by their **HH:MM AM** stamps
// instead of being chunked into Morning/Afternoon/Evening cards. Catches
// both bare "### Morning" and bolded "**Morning**" variants.
const TIME_OF_DAY_RE = /^(?:###\s+)?(?:\*\*)?\s*(morning|afternoon|evening|night|midday|noon|early\s+morning|late\s+afternoon|late\s+evening|breakfast|lunch|dinner)\s*(?:\*\*)?\s*:?\s*$/i;

export function parseLines(rawLines: string[]): Section[] {
  const sections: Section[] = [];
  let current: Section = { id: 's0', heading: '', lines: [] };
  let idx = 1;

  // Match any line that opens a Day section, regardless of whether the
  // model bolds the whole line ("**Day 4 — Farewell**"), only the
  // "Day N" token ("**Day 4** — Farewell"), uses an h1/h2/h3 prefix
  // ("## Day 4"), uses a hyphen ("Day-4"), or a word-form numeral
  // ("**Day Four** — Farewell"). The previous boldDay regex required
  // the closing ** to end the line, so "**Day 4** — Farewell" silently
  // dropped through and merged Day 4's content into Day 3.
  const DAY_OPENER_RE = /^\s*(?:#{1,3}\s+)?(?:\*\*\s*)?Day[\s\-]+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;

  function dayHeadingFrom(line: string): string {
    return line
      .trim()
      .replace(/^#{1,3}\s+/, '')
      .replace(/^\*\*\s*/, '')
      .replace(/\*\*\s*$/, '')
      .replace(/\s*\*\*\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  for (const line of rawLines) {
    const trimmed = line.trim();
    const isDayOpener = DAY_OPENER_RE.test(trimmed);
    // Section boundaries: any `## H2` OR a recognized Day opener.
    // Older `### Morning|Afternoon|Evening` subheadings are dropped
    // below so a single day stays one card.
    if (line.startsWith('## ') || isDayOpener) {
      if (current.heading || current.lines.some(l => l.trim())) {
        sections.push(current);
      }
      const heading = isDayOpener
        ? dayHeadingFrom(line)
        : line.slice(3).trim();
      current = { id: `s${idx++}`, heading, lines: [] };
    } else if (line === '---') {
      // Drop horizontal rules — they're decoration in the AI output.
      continue;
    } else if (TIME_OF_DAY_RE.test(trimmed)) {
      // Drop morning/afternoon/evening sub-labels; activity time stamps
      // (**9:00 AM**) already encode the chronological order so the
      // sub-labels are visual noise that wrecks the day's flow.
      continue;
    } else {
      current.lines.push(line);
    }
  }
  if (current.heading || current.lines.some(l => l.trim())) {
    sections.push(current);
  }

  // Drop fully-empty preamble sections
  return sections.filter(
    s => s.heading || s.lines.some(l => l.trim())
  );
}

/** Matches lines like **9:00 AM** or **12:30 PM** at the start */
export function isTimeLine(line: string): boolean {
  return /^\*\*\d{1,2}:\d{2}\s*[AP]M\*\*/.test(line.trim());
}

export function groupLines(lines: string[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  let current: Extract<ActivityGroup, { type: 'activity' }> | null = null;
  lines.forEach((line, idx) => {
    if (isTimeLine(line)) {
      if (current) groups.push(current);
      current = { type: 'activity', headline: line, headlineIdx: idx, details: [] };
    } else if (current) {
      current.details.push({ line, idx });
    } else {
      groups.push({ type: 'plain', line, idx });
    }
  });
  if (current) groups.push(current);
  return groups;
}

// Pull the day index out of headings like "Day 1", "Day 2: Arrival", "Day Three".
export function extractDayNumber(heading: string): number | null {
  const m1 = heading.match(/day[\s\-]*(\d+)/i);
  if (m1) return parseInt(m1[1], 10);
  const wordToNum: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  const m2 = heading.match(/day\s+(one|two|three|four|five|six|seven|eight|nine|ten)/i);
  if (m2) return wordToNum[m2[1].toLowerCase()];
  return null;
}

// Strip the "Day N" prefix so the title can sit beside the giant numeral.
export function stripDayPrefix(heading: string): string {
  return heading
    .replace(/^day[\s\-]*\d+[:\s\-–—]*/i, '')
    .replace(/^day\s+(one|two|three|four|five|six|seven|eight|nine|ten)[:\s\-–—]*/i, '')
    .trim();
}
