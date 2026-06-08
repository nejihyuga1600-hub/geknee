"use client";
// Bottom-screen toast that appears when a monument unlocks. Owner sees their
// own unlock and gets a one-tap share button — Web Share API on mobile / Safari,
// clipboard copy fallback elsewhere. PostHog records the funnel so Task 11
// review can correlate unlocks with shares.

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePendingUnlock, _setPendingUnlock } from "./globe/pendingUnlock";
import { INFO } from "./globe/info";
import { track } from "@/lib/analytics";

export default function UnlockShareToast() {
  const pending = usePendingUnlock();
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);

  // Auto-dismiss after 12s — long enough to share, short enough to get out
  // of the way of the next monument the user might unlock right after.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => _setPendingUnlock(null), 12_000);
    return () => clearTimeout(t);
  }, [pending]);

  if (!pending) return null;
  const handle = (session?.user as { username?: string; id?: string } | undefined)?.username
    ?? (session?.user as { id?: string } | undefined)?.id;
  const monumentName = INFO[pending.mk as keyof typeof INFO]?.name ?? pending.mk;
  const displayName = (session?.user as { name?: string | null } | undefined)?.name ?? "I";

  // Append &q=<photoUrl> when MonumentShop pushed a proof photo for this
  // unlock. The OG share route renders it as a polaroid inset on the card.
  const shareUrl = handle
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/u/${handle}?unlocked=${pending.mk}&skin=${pending.skin}&from=share${
        pending.photoUrl ? `&q=${encodeURIComponent(pending.photoUrl)}` : ""
      }`
    : "";
  const shareText = `${displayName} just collected ${monumentName} on geknee 🌍`;

  const onShare = async () => {
    if (!handle) return;
    const platform = (navigator as Navigator & { share?: unknown }).share ? "web-share" : "clipboard";
    // Reuses the canonical 'share_click' event — context goes in properties so
    // we keep the AnalyticsEvent union narrow (lib/analytics.ts).
    track("share_click", { source: "unlock_toast", mk: pending.mk, skin: pending.skin, platform });
    try {
      if ((navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: `${monumentName} · geknee`,
          text: shareText,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // User cancelled the native share sheet — not an error.
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 60,
        background: "rgba(15, 23, 42, 0.95)",
        WebkitBackdropFilter: "blur(12px)", backdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 215, 0, 0.45)",
        boxShadow: "0 14px 40px rgba(0,0,0,0.5), 0 0 32px rgba(255,215,0,0.18)",
        borderRadius: 14,
        padding: "12px 14px 12px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        color: "#fff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <div style={{ fontSize: 26 }}>{String.fromCodePoint(0x1F31F)}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "#ffd700", letterSpacing: 1.2, fontWeight: 800, textTransform: "uppercase" }}>
          New unlock
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {monumentName}
        </div>
      </div>
      {handle ? (
        <button
          onClick={onShare}
          style={{
            border: "none",
            background: "linear-gradient(135deg, #ffd700, #ffaa00)",
            color: "#1a1a2e",
            fontWeight: 800,
            fontSize: 13,
            padding: "10px 16px",
            borderRadius: 10,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {copied ? "Link copied!" : `Share ${String.fromCodePoint(0x2192)}`}
        </button>
      ) : (
        <div style={{ fontSize: 12, color: "#94a3b8", maxWidth: 180 }}>
          Sign in to share your unlock
        </div>
      )}
      <button
        aria-label="Dismiss"
        onClick={() => _setPendingUnlock(null)}
        style={{
          border: "none", background: "transparent", color: "#64748b",
          fontSize: 18, cursor: "pointer", padding: 4, lineHeight: 1,
        }}
      >
        {String.fromCodePoint(0x00D7)}
      </button>
    </div>
  );
}
