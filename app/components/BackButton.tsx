"use client";
// Unified back-navigation pill. Replaces the assorted hand-rolled
// "← Back to globe" / "← Itinerary" links scattered across the planner.
// One component → one visual, predictable touch target on iOS, and a
// single place to tune appearance.
//
// Usage:
//   <BackButton href="/plan/location" label="Back to globe" />
//   <BackButton href="/plan" label="Itinerary" />
//   <BackButton onClick={() => router.back()} label="Back" />

import Link from "next/link";
import React from "react";

const MONO = "var(--font-mono), ui-monospace, monospace";

interface Props {
  href?: string;
  onClick?: () => void;
  label: string;
  // 'compact' for inline-row use; 'block' for full-width modal headers.
  variant?: "compact" | "block";
}

export default function BackButton({ href, onClick, label, variant = "compact" }: Props) {
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: variant === "block" ? "10px 18px" : "7px 14px",
    borderRadius: 999,
    background: "rgba(167,139,250,0.10)",
    border: "1px solid rgba(167,139,250,0.32)",
    color: "var(--brand-accent, #a78bfa)",
    fontFamily: MONO,
    fontSize: variant === "block" ? 12 : 10,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    textDecoration: "none",
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "background 0.15s ease, transform 0.05s ease",
  };
  const inner = (
    <>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      <span>{label}</span>
    </>
  );
  if (href) return <Link href={href} prefetch style={style}>{inner}</Link>;
  return <button type="button" onClick={onClick} style={style}>{inner}</button>;
}
