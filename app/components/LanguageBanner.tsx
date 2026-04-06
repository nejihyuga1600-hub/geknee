"use client";

import { useEffect, useState } from "react";
import { detectBrowserLang, LANG_NAMES, getTranslations, RTL_LANGS, type LangCode } from "@/lib/i18n";
import { loadSettings } from "@/app/components/SettingsPanel";

const DISMISSED_KEY = "geknee_lang_banner_dismissed";

interface Props {
  onSwitch: (lang: LangCode) => void;
}

export default function LanguageBanner({ onSwitch }: Props) {
  const [detected, setDetected] = useState<LangCode | null>(null);
  const [visible, setVisible]   = useState(false);

  useEffect(() => {
    // Only show once per session
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    const browserLang = detectBrowserLang();
    if (!browserLang || browserLang === "en") return;

    const saved = loadSettings().language;
    // Only prompt if browser lang differs from saved preference
    if (saved && saved !== "en" && saved === browserLang) return;
    if (saved && saved !== "en") return; // user already chose something different — respect it

    setDetected(browserLang);
    // Small delay so it doesn't flash immediately on load
    setTimeout(() => setVisible(true), 1800);
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  function handleSwitch() {
    if (!detected) return;
    onSwitch(detected);
    dismiss();
  }

  if (!visible || !detected) return null;

  const langName = LANG_NAMES[detected];
  const tr = getTranslations(detected);
  const isRtl = RTL_LANGS.has(detected);

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 18px",
        background: "rgba(10,15,40,0.97)",
        border: "1px solid rgba(99,102,241,0.4)",
        borderRadius: 14,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        backdropFilter: "blur(16px)",
        fontFamily: "system-ui, sans-serif",
        animation: "langBannerIn 0.3s ease-out",
        maxWidth: "calc(100vw - 48px)",
        flexWrap: "wrap",
      }}
    >
      <style>{`
        @keyframes langBannerIn {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Globe icon */}
      <span style={{ fontSize: 20, flexShrink: 0 }}>{String.fromCodePoint(0x1F30D)}</span>

      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", whiteSpace: "nowrap" }}>
        {tr.bannerText} <strong style={{ color: "#a5b4fc" }}>{langName}</strong>.
      </span>

      <button
        onClick={handleSwitch}
        style={{
          padding: "6px 16px",
          borderRadius: 8,
          border: "none",
          background: "#6366f1",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {tr.bannerSwitch} → {langName}
      </button>

      <button
        onClick={dismiss}
        style={{
          padding: "6px 14px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "transparent",
          color: "rgba(255,255,255,0.45)",
          fontSize: 12,
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {tr.bannerDismiss}
      </button>
    </div>
  );
}
