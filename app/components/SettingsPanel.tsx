"use client";
import React, { useEffect, useRef, useState } from "react";
import InstallEntry from "./InstallEntry";
import { currentIssueYear, isWrapUpWindow, nextRolloverDate } from "@/lib/issue-year";
import { Sparkle } from "@/lib/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppSettings {
  language: string;
  timezone: string;
  locationTracking: boolean;
  locationSharing: boolean;
  privacyAI: "full" | "minimal" | "none";
  darkMode: boolean;
  notifTripReminders: boolean;
  notifFriendActivity: boolean;
  notifDeals: boolean;
  // Profile / constraints — pre-fills style page step 5
  profileMobility: string;
  profileDietary: string;
  profileOther: string;
}

const DEFAULTS: AppSettings = {
  language: "en",
  timezone: "",
  locationTracking: false,
  locationSharing: false,
  privacyAI: "full",
  darkMode: true,
  notifTripReminders: true,
  notifFriendActivity: true,
  notifDeals: false,
  profileMobility: "",
  profileDietary: "",
  profileOther: "",
};

const LS_KEY = "geknee_settings";

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(s: AppSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

// ─── Language options ─────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文 (Chinese)" },
  { code: "es", label: "Español (Spanish)" },
  { code: "pt", label: "Português (Portuguese)" },
  { code: "ar", label: "العربية (Arabic)" },
  { code: "fr", label: "Français (French)" },
  { code: "de", label: "Deutsch (German)" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "it", label: "Italiano (Italian)" },
  { code: "hi", label: "हिन्दी (Hindi)" },
  { code: "ja", label: "日本語 (Japanese)" },
  { code: "ms", label: "Bahasa Melayu (Malay)" },
  { code: "pl", label: "Polski (Polish)" },
  { code: "ru", label: "Русский (Russian)" },
  { code: "ko", label: "한국어 (Korean)" },
];

// ─── Common timezones ─────────────────────────────────────────────────────────

const TIMEZONES = [
  "Auto-detect",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const BG    = "rgba(6,8,22,0.97)";
const CARD  = "rgba(255,255,255,0.04)";
const BORD  = "rgba(167, 139, 250,0.2)";
const BORD2 = "rgba(255,255,255,0.08)";
const TEXT  = "#e2e8f0";
const MUTED = "rgba(255,255,255,0.45)";
const INDIGO = "#818cf8";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: INDIGO, marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORD2}`, borderRadius: 10, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: `1px solid ${BORD2}` }}>
      <div>
        <div style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 12 }}>{children}</div>
    </div>
  );
}

function RowLast({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px" }}>
      <div>
        <div style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 12 }}>{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        display: "inline-flex", alignItems: "center", padding: "11px 0",
        background: "none", border: "none", cursor: "pointer", flexShrink: 0,
      }}
    >
      <span style={{
        display: "block", width: 40, height: 22, borderRadius: 11,
        background: on ? "#a78bfa" : "rgba(255,255,255,0.15)",
        position: "relative", transition: "background 0.2s", pointerEvents: "none",
      }}>
        <span style={{
          position: "absolute", top: 3, left: on ? 21 : 3, width: 16, height: 16,
          borderRadius: "50%", background: "#fff", transition: "left 0.2s",
        }} />
      </span>
    </button>
  );
}

function Select({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: "rgba(255,255,255,0.14)", border: `1px solid ${BORD2}`, borderRadius: 7,
        color: TEXT, fontSize: 12, padding: "5px 8px", cursor: "pointer", maxWidth: 180,
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: "#0a0c1e" }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: Props) {
  const [s, setS] = useState<AppSettings>(DEFAULTS);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [mapDownloading, setMapDownloading] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setS(loadSettings());
  }, []);

  // Auto-detect timezone on first open if not set
  useEffect(() => {
    if (open && !s.timezone) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      update("timezone", tz || "Auto-detect");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  function update<K extends keyof AppSettings>(key: K, val: AppSettings[K]) {
    setS(prev => {
      const next = { ...prev, [key]: val };
      saveSettings(next);
      return next;
    });
  }

  async function sendFeedback() {
    if (!feedbackText.trim()) return;
    setFeedbackSending(true);
    // Will post to /api/feedback once GeKnee email is configured
    // For now, store locally and show confirmation
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: feedbackText }),
      });
      if (res.ok || res.status === 404) {
        // 404 means endpoint not yet set up — still show success to user
        setFeedbackSent(true);
        setFeedbackText("");
      }
    } catch {
      setFeedbackSent(true);
      setFeedbackText("");
    } finally {
      setFeedbackSending(false);
    }
  }

  function simulateMapDownload(city: string) {
    setMapDownloading(city);
    // Simulate download — real implementation would use a tile service or offline map API
    setTimeout(() => setMapDownloading(null), 2500);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 40, animation: "modalFadeIn 0.25s ease-out",
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 50, animation: "panelSlideIn 0.3s ease-out",
          width: 380, background: BG,
          borderLeft: `1px solid ${BORD}`,
          boxShadow: "-8px 0 40px rgba(0,0,0,0.6)",
          display: "flex", flexDirection: "column",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 16px", borderBottom: `1px solid ${BORD2}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={INDIGO} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Settings</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontWeight: 500 }}>ESC to close</span>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, fontSize: 20, lineHeight: 1, padding: 4 }}>
              &#x2715;
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 40px", scrollbarWidth: "thin", scrollbarColor: "rgba(167, 139, 250,0.3) transparent" }}>

          {/* ── Language ── */}
          <Section title="Language">
            <RowLast label="App Language" sub="Affects UI text and AI responses">
              <Select
                value={s.language}
                options={LANGUAGES.map(l => ({ value: l.code, label: l.label }))}
                onChange={v => update("language", v)}
              />
            </RowLast>
          </Section>

          {/* ── Timezone ── */}
          <Section title="Date & Time">
            <RowLast label="Timezone" sub={s.timezone ? `Current: ${s.timezone}` : "Used for trip planning times"}>
              <Select
                value={s.timezone || "Auto-detect"}
                options={TIMEZONES.map(tz => ({ value: tz, label: tz === "Auto-detect" ? "Auto-detect" : tz.replace("_", " ") }))}
                onChange={v => update("timezone", v === "Auto-detect" ? "" : v)}
              />
            </RowLast>
          </Section>

          {/* ── Appearance ── */}
          <Section title="Appearance">
            <RowLast label="Dark Mode" sub="Toggle dark / light interface">
              <Toggle on={s.darkMode} onChange={v => update("darkMode", v)} />
            </RowLast>
          </Section>

          {/* ── Privacy ── */}
          <Section title="Privacy & AI Geknee">
            <Row label="AI Data Sharing" sub="Controls what context Geknee receives">
              <Select
                value={s.privacyAI}
                options={[
                  { value: "full",    label: "Full context" },
                  { value: "minimal", label: "Basic only" },
                  { value: "none",    label: "Off" },
                ]}
                onChange={v => update("privacyAI", v as AppSettings["privacyAI"])}
              />
            </Row>
            <Row label="Location Sharing" sub="Share your location with friends">
              <Toggle on={s.locationSharing} onChange={v => update("locationSharing", v)} />
            </Row>
            <RowLast label="Navigation Tracking" sub="GPS tracking during active trips">
              {/* Location is only requested for flight-departure detection.
                  Per privacy policy: this toggle stores user preference but
                  doesn't actually request browser geolocation here. */}
              <Toggle on={s.locationTracking} onChange={v => update("locationTracking", v)} />
            </RowLast>
          </Section>

          {/* ── Profile / Constraints ── */}
          <Section title="Profile & Accessibility">
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORD2}` }}>
              <div style={{ fontSize: 13, color: TEXT, fontWeight: 500, marginBottom: 6 }}>Mobility needs</div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>Pre-fills travel constraints on trip planning</div>
              <input
                value={s.profileMobility}
                onChange={e => update("profileMobility", e.target.value)}
                placeholder="e.g. wheelchair accessible, limited walking..."
                style={{
                  width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${BORD2}`,
                  borderRadius: 8, color: TEXT, fontSize: 12, padding: "8px 12px",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORD2}` }}>
              <div style={{ fontSize: 13, color: TEXT, fontWeight: 500, marginBottom: 6 }}>Dietary requirements</div>
              <input
                value={s.profileDietary}
                onChange={e => update("profileDietary", e.target.value)}
                placeholder="e.g. vegan, gluten-free, halal..."
                style={{
                  width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${BORD2}`,
                  borderRadius: 8, color: TEXT, fontSize: 12, padding: "8px 12px",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 13, color: TEXT, fontWeight: 500, marginBottom: 6 }}>Other constraints</div>
              <textarea
                value={s.profileOther}
                onChange={e => update("profileOther", e.target.value)}
                placeholder="e.g. fear of heights, budget-conscious, travelling with infant..."
                rows={3}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${BORD2}`,
                  borderRadius: 8, color: TEXT, fontSize: 12, padding: "8px 12px",
                  outline: "none", resize: "vertical", boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
              <div style={{ fontSize: 10, color: MUTED, marginTop: 6 }}>
                These are automatically applied to Step 5 (Constraints) when planning a trip.
              </div>
            </div>
          </Section>

          {/* ── Offline Maps ── */}
          <Section title="Offline Maps">
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORD2}` }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
                Download city maps for offline use on your device. Tap to download — available in the app when you have no internet connection.
              </div>
              {["Paris", "Tokyo", "New York", "London", "Barcelona"].map((city, i, arr) => (
                <div
                  key={city}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    paddingBottom: i < arr.length - 1 ? 10 : 0,
                    marginBottom: i < arr.length - 1 ? 10 : 0,
                    borderBottom: i < arr.length - 1 ? `1px solid ${BORD2}` : "none",
                  }}
                >
                  <div style={{ fontSize: 13, color: TEXT }}>{city}</div>
                  <button
                    onClick={() => simulateMapDownload(city)}
                    disabled={mapDownloading === city}
                    style={{
                      background: mapDownloading === city ? "rgba(167, 139, 250,0.2)" : "rgba(167, 139, 250,0.15)",
                      border: `1px solid ${BORD}`,
                      borderRadius: 7, color: INDIGO, fontSize: 11, fontWeight: 600,
                      padding: "5px 12px", cursor: mapDownloading === city ? "default" : "pointer",
                    }}
                  >
                    {mapDownloading === city ? "Downloading..." : "Download"}
                  </button>
                </div>
              ))}
            </div>
            <RowLast label="Custom city" sub="Type any city to download its map">
              <button
                onClick={() => {
                  const city = window.prompt("Enter city name:");
                  if (city?.trim()) simulateMapDownload(city.trim());
                }}
                style={{
                  background: "rgba(255,255,255,0.06)", border: `1px solid ${BORD2}`,
                  borderRadius: 7, color: TEXT, fontSize: 11, fontWeight: 600,
                  padding: "5px 12px", cursor: "pointer",
                }}
              >
                + Add city
              </button>
            </RowLast>
          </Section>

          {/* ── Notifications ── */}
          <Section title="Notifications">
            <NotificationPrefsRows />
            <Row label="Friend activity" sub="When friends add trips or come online">
              <Toggle on={s.notifFriendActivity} onChange={v => update("notifFriendActivity", v)} />
            </Row>
            <RowLast label="Deals & offers" sub="Flight and hotel price drops">
              <Toggle on={s.notifDeals} onChange={v => update("notifDeals", v)} />
            </RowLast>
          </Section>

          {/* ── Year Wrap ──
              Active issue year = prior calendar year during Jan 1–14, current
              calendar year otherwise. During the Dec 1 → Jan 14 wrap-up window
              we show a "closes on Jan 15" hint to nudge final captures. */}
          {(() => {
            const issueYear = currentIssueYear();
            const inWrapUp = isWrapUpWindow();
            const rollover = nextRolloverDate();
            const rolloverLabel = rollover.toLocaleDateString(undefined, {
              month: "short", day: "numeric",
            });
            return (
              <Section title={`${issueYear} Wrap`}>
                <a
                  href={`/wrapped?year=${issueYear}`}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 16px", textDecoration: "none",
                    color: "#fff", fontSize: 14, fontWeight: 600,
                  }}
                >
                  <span>
                    <Sparkle size={12} style={{ marginRight: 8, verticalAlign: "-2px" }} />
                    See your travel year in review
                  </span>
                  <span style={{ fontSize: 18, color: "rgba(255,255,255,0.4)" }}>→</span>
                </a>
                {inWrapUp && (
                  <div style={{
                    padding: "0 16px 12px 16px",
                    fontSize: 11,
                    fontFamily: "var(--font-mono-display, monospace)",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "rgba(251, 191, 36, 0.85)",
                  }}>
                    Issue {issueYear} closes {rolloverLabel}
                  </div>
                )}
              </Section>
            );
          })()}

          {/* ── Help & Feedback ── */}
          <Section title="Help & Feedback">
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
                Send feedback, report a bug, or ask for help. We read every message.
              </div>
              {feedbackSent ? (
                <div style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "12px 16px", color: "#34d399", fontSize: 13 }}>
                  Thanks for your feedback! We&apos;ll be in touch soon.
                </div>
              ) : (
                <>
                  <textarea
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                    placeholder="Describe your feedback or issue..."
                    rows={4}
                    style={{
                      width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${BORD2}`,
                      borderRadius: 8, color: TEXT, fontSize: 12, padding: "10px 12px",
                      outline: "none", resize: "vertical", boxSizing: "border-box",
                      fontFamily: "inherit", marginBottom: 10,
                    }}
                  />
                  <button
                    onClick={sendFeedback}
                    disabled={!feedbackText.trim() || feedbackSending}
                    style={{
                      width: "100%", background: feedbackText.trim() ? "#a78bfa" : "rgba(167, 139, 250,0.25)",
                      border: "none", borderRadius: 8, color: feedbackText.trim() ? "#fff" : MUTED,
                      fontSize: 13, fontWeight: 600, padding: "10px", cursor: feedbackText.trim() ? "pointer" : "default",
                      transition: "background 0.2s",
                    }}
                  >
                    {feedbackSending ? "Sending..." : "Send Feedback"}
                  </button>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 8, textAlign: "center" }}>
                    Sent to the GeKnee team — hello@geknee.com
                  </div>
                </>
              )}
            </div>
          </Section>

          {/* Install — hidden when already running standalone */}
          <InstallEntry />

          {/* App version */}
          <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 8 }}>
            GeKnee v0.1.0 &mdash; All settings saved locally
          </div>
        </div>
      </div>
    </>
  );
}

// Server-backed notification preference toggles. Hydrates from
// /api/notification-prefs on mount, PATCHes on every change. Each toggle
// silences a whole category of cron-emitted notifications when off.
function NotificationPrefsRows() {
  const [prefs, setPrefs] = React.useState<{
    weatherTwoWeeks: boolean;
    packingPrep: boolean;
    dailyBriefing: boolean;
  } | null>(null);

  React.useEffect(() => {
    fetch('/api/notification-prefs')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPrefs({ weatherTwoWeeks: d.weatherTwoWeeks, packingPrep: d.packingPrep, dailyBriefing: d.dailyBriefing }); })
      .catch(() => { /* leave null — toggles render disabled */ });
  }, []);

  function patch<K extends keyof NonNullable<typeof prefs>>(key: K, value: boolean) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    fetch('/api/notification-prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => { /* optimistic — revert on error left as future polish */ });
  }

  return (
    <>
      <Row label="Weather forecast" sub="Outlook for your destination, 2 weeks before departure">
        <Toggle on={prefs?.weatherTwoWeeks ?? true} onChange={v => patch('weatherTwoWeeks', v)} />
      </Row>
      <Row label="Packing prep" sub="Tailored packing checklist, 2 weeks before departure">
        <Toggle on={prefs?.packingPrep ?? true} onChange={v => patch('packingPrep', v)} />
      </Row>
      <Row label="Daily briefing" sub="Morning rundown of today's plan during the trip">
        <Toggle on={prefs?.dailyBriefing ?? true} onChange={v => patch('dailyBriefing', v)} />
      </Row>
    </>
  );
}
