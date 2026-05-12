'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { EditableLine } from './EditableLine';
import { ActivityBlock } from './ActivityBlock';
import { WeatherBar, type DayWeather } from './WeatherBar';
import { DayImages } from './DayImages';
import { extractDayNumber, stripDayPrefix, groupLines, type Section } from '../lib/itinerary-parse';
import { extractActivityPlace, extractActivityCandidates, extractTransitMode, type TransitMode } from '../lib/places';
import type { EditTarget, RouteStop } from '../lib/types';

export interface SectionCardProps {
  section: Section;
  sectionIdx: number;
  editTarget: EditTarget | null;
  editValue: string;
  onStartEdit: (sectionIdx: number, lineIdx: number, current: string) => void;
  onEditChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onAskGenie: (line: string) => void;
  location: string;
  allStops?: RouteStop[];
  weatherDays?: DayWeather[];
  weatherUnit: 'C' | 'F';
  replanning: boolean;
  onReplan: () => void;
}

export function SectionCard({
  section, sectionIdx, editTarget, editValue,
  onStartEdit, onEditChange, onCommit, onCancel, onAskGenie, location, allStops,
  weatherDays, weatherUnit, replanning, onReplan,
}: SectionCardProps) {
  const dayNum = extractDayNumber(section.heading);
  const isDay  = dayNum !== null;
  const isCity = !isDay && (allStops ?? []).some(
    s => section.heading.trim().toLowerCase().includes(s.city.toLowerCase())
  );
  const isTips = /tip|advice|practical|budget|packing|note|reminder|essential|important|safety|currency|visa|weather|transport|getting|overview|summary|introduction|highlight|must.do|must.see/i.test(section.heading);
  const isDayOrCity = isDay || isCity || (!isTips && section.lines.filter(l => l.trim()).length >= 3);
  const mapLocation = isCity ? section.heading.trim() : location;

  // Pull the AI-emitted "Estimated daily cost: ~£35 per person" summary
  // line out of the day's lines so we can render it once as a chip in
  // the day metadata instead of tucked at the bottom of the prose.
  const DAILY_COST_RE = /(?:estimated\s+(?:daily|day)\s+cost|day\s+total|daily\s+total)\s*:?\s*~?\s*([$¥€£₹₩฿][\s]?[\d,]+(?:\.\d+)?(?:[-–][\d,]+(?:\.\d+)?)?)/i;
  let dailyCost: string | null = null;
  const filteredLines: string[] = [];
  for (const l of section.lines) {
    const m = l.match(DAILY_COST_RE);
    if (m && !dailyCost) {
      dailyCost = m[1].replace(/\s/g, '');
      continue; // hide from prose
    }
    filteredLines.push(l);
  }

  const groups = isDayOrCity ? groupLines(filteredLines) : null;
  const [, setResolvedPlaces] = useState<string[]>([]);

  const activityGroups = groups?.filter(g => g.type === 'activity') ?? [];
  const activityNumberMap = new Map<number, number>(
    activityGroups.map((g, i) => [g.headlineIdx, i + 1])
  );
  // For each activity, the 1-based number of the *next* activity in the
  // day. Last activity has no "next" — undefined. Used to suffix
  // "→ step N" on the transit chip so it's obvious which step the
  // walking/taxi leg leads to.
  const nextActivityNumberMap = new Map<number, number>(
    activityGroups.flatMap((g, i) => i < activityGroups.length - 1 ? [[g.headlineIdx, i + 2]] : [])
  );
  // For each activity, the candidate place names (in priority order; the
  // day-map geocoder tries each until one resolves) plus the transit mode
  // of the leg LEAVING that activity (used for routing). Multiple
  // candidates per activity is what makes the map robust against fictional
  // LLM-generated venue names — when the specific name fails, the broader
  // neighborhood candidate carries the pin.
  const activityPlacesAndModes = activityGroups
    .map(g => ({
      candidates: extractActivityCandidates(g.headline, g.details.map(d => d.line)),
      mode: g.details.map(d => extractTransitMode(d.line)).find(m => m !== null) ?? null,
    }))
    .filter((p): p is { candidates: string[]; mode: TransitMode } => p.candidates.length > 0);
  const orderedActivityPlaces = activityPlacesAndModes.map(p => p.candidates[0]);
  const placeCandidates = activityPlacesAndModes.map(p => p.candidates);
  // legModes[i] = the transit mode used to go from stop i → stop i+1.
  // Length matches (N - 1) where N = number of resolved places.
  const legModes: TransitMode[] = activityPlacesAndModes.slice(0, -1).map(p => p.mode);
  // Suppress unused-var warning when the legacy single-name extractor is
  // not referenced after this refactor — keep the import in case other
  // call sites need it later.
  void extractActivityPlace;

  function renderLines(linesToRender: typeof section.lines, baseIdx = 0) {
    if (!groups) {
      return linesToRender.map((line, i) => (
        <EditableLine
          key={i + baseIdx}
          line={line}
          isEditing={editTarget?.sectionIdx === sectionIdx && editTarget?.lineIdx === i + baseIdx}
          editValue={editValue}
          onStartEdit={() => onStartEdit(sectionIdx, i + baseIdx, line)}
          onEditChange={onEditChange}
          onCommit={onCommit}
          onCancel={onCancel}
          onAskGenie={onAskGenie}
        />
      ));
    }
    return groups.map(group =>
      group.type === 'activity' ? (
        <ActivityBlock
          key={group.headlineIdx}
          group={group}
          sectionIdx={sectionIdx}
          editTarget={editTarget}
          editValue={editValue}
          onStartEdit={onStartEdit}
          onEditChange={onEditChange}
          onCommit={onCommit}
          onCancel={onCancel}
          onAskGenie={onAskGenie}
          city={mapLocation}
          activityNumber={activityNumberMap.get(group.headlineIdx)}
          nextActivityNumber={nextActivityNumberMap.get(group.headlineIdx)}
        />
      ) : (
        <EditableLine
          key={group.idx}
          line={group.line}
          isEditing={editTarget?.sectionIdx === sectionIdx && editTarget?.lineIdx === group.idx}
          editValue={editValue}
          onStartEdit={() => onStartEdit(sectionIdx, group.idx, group.line)}
          onEditChange={onEditChange}
          onCommit={onCommit}
          onCancel={onCancel}
          onAskGenie={onAskGenie}
        />
      )
    );
  }

  const dayTitle = isDay ? (stripDayPrefix(section.heading) || section.heading) : section.heading;
  const weatherSubLabel = (() => {
    if (!weatherDays || weatherDays.length === 0) return '';
    const w = weatherDays[0];
    const toDisplay = (c: number) => weatherUnit === 'F' ? Math.round(c * 9 / 5 + 32) : Math.round(c);
    const cond = (w.condition ?? '').toUpperCase();
    return ` · ${toDisplay(w.tempMax)}°/${toDisplay(w.tempMin)}°${cond ? ' · ' + cond : ''}`;
  })();

  return (
    <div id={section.id} style={{
      background: isDayOrCity ? 'rgba(125,211,252,0.04)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${isDayOrCity ? 'rgba(125,211,252,0.18)' : 'var(--brand-border)'}`,
      borderRadius: 16, padding: '24px 28px 20px', marginBottom: 18,
      animation: `cardFadeIn 250ms var(--ease-out) both`,
      animationDelay: `${sectionIdx * 60}ms`,
    }}>
      {section.heading && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, marginBottom: weatherDays ? 10 : 16, paddingBottom: 10,
          borderBottom: `1px solid ${isDayOrCity ? 'rgba(125,211,252,0.2)' : 'var(--brand-border)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, minWidth: 0, flex: 1 }}>
            {isDay && dayNum !== null && (
              <div style={{
                fontFamily: 'var(--font-display), Georgia, serif',
                fontSize: 'clamp(36px, 6vw, 48px)', fontWeight: 400,
                fontStyle: 'italic', letterSpacing: '-0.025em',
                color: 'var(--brand-accent)', lineHeight: 1, flexShrink: 0,
              }}>
                {dayNum < 10 ? `0${dayNum}` : dayNum}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              {isDay && (
                <div style={{
                  fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                  fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: 'var(--brand-accent-2)', marginBottom: 4, fontWeight: 600,
                }}>
                  DAY {dayNum}{weatherSubLabel}{dailyCost ? ` · ${dailyCost} / day` : ''}
                </div>
              )}
              <h2 style={{
                margin: 0,
                fontFamily: 'var(--font-display), Georgia, serif',
                fontSize: isDay ? 'clamp(20px, 3vw, 26px)' : 17,
                fontWeight: isDay ? 400 : 700,
                letterSpacing: '-0.01em',
                color: 'var(--brand-ink)',
              }}>
                {dayTitle}
              </h2>
            </div>
          </div>
          <button
            onClick={onReplan}
            disabled={replanning}
            title="Replan this section with geknee agent"
            style={{
              flexShrink: 0, padding: '5px 12px', borderRadius: 999,
              fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
              border: '1px solid rgba(167,139,250,0.3)',
              background: replanning ? 'rgba(167,139,250,0.06)' : 'transparent',
              color: replanning ? 'rgba(167,139,250,0.4)' : 'var(--brand-accent)',
              cursor: replanning ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            {replanning ? (
              <>
                <span style={{
                  display: 'inline-block', width: 9, height: 9,
                  border: '1.5px solid rgba(167,139,250,0.4)', borderTopColor: 'var(--brand-accent)',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                Replanning&hellip;
              </>
            ) : (
              <>{String.fromCodePoint(0x2728)} Replan</>
            )}
          </button>
        </div>
      )}
      {/* Per-section WeatherBar removed — the per-day weather is summarized
          inline in the day heading (DAY 1 · 18°/9° · CLEAR) and the trip-wide
          weather strip lives once at the top of SummaryView. */}

      {/* Per-section DayMap removed — replaced by a single sticky
          UnifiedTripMap mounted at the top of SummaryView. DayImages
          stay because they're the day's hero image, not a per-step thumb. */}
      <div style={{ minWidth: 0 }}>
        {renderLines(section.lines)}
        {isDayOrCity && <DayImages heading={section.heading} location={mapLocation} />}
      </div>
    </div>
  );
}
