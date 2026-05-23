"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === "loading") {
    return (
      <main style={shell}>
        <div style={card}>
          <p style={{ color: "rgba(255,255,255,0.6)", textAlign: "center" }}>Loading...</p>
        </div>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main style={shell}>
        <div style={card}>
          <h1 style={title}>Not signed in</h1>
          <p style={subtle}>You are not currently signed in to GeKnee.</p>
          <button onClick={() => signIn(undefined, { callbackUrl: "/" })} style={primaryBtn}>
            Sign in
          </button>
          <Link href="/" style={backLink}>← Back to globe</Link>
        </div>
      </main>
    );
  }

  const initial = (session.user.name ?? session.user.email ?? "?")[0]?.toUpperCase() ?? "?";

  return (
    <main style={shell}>
      <div style={card}>
        <div style={avatarWrap}>
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" style={avatarImg} />
          ) : (
            <span style={avatarFallback}>{initial}</span>
          )}
        </div>

        <h1 style={title}>{session.user.name ?? "Signed in"}</h1>
        {session.user.email && <p style={subtle}>{session.user.email}</p>}

        <div style={{ display: "grid", gap: 10, marginTop: 28 }}>
          <button
            onClick={async () => {
              const res = await fetch("/api/stripe/portal", { method: "POST" });
              if (res.ok) {
                const { url } = (await res.json()) as { url?: string };
                if (url) { window.location.href = url; return; }
              }
              if (res.status === 404) { router.push("/pricing"); return; }
              alert("Could not open billing portal");
            }}
            style={primaryBtn}
          >
            Manage subscription
          </button>
          <button
            onClick={async () => {
              // Clear the geknee session cookie BEFORE starting OAuth.
              // Without this, NextAuth in JWT mode treats the OAuth callback
              // as a "link new sub to current session user" instead of a
              // session swap. Google's server-side prompt=select_account
              // + authuser=-1 (configured in auth.ts) handles forcing the
              // chooser. Avoid the accounts.google.com/Logout?continue=
              // chain — Google rejects external continue= targets with a
              // generic 400 when there is no Google session to clear.
              await signOut({ redirect: false });
              await signIn("google", { callbackUrl: "/" });
            }}
            style={primaryBtn}
          >
            Switch account
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            style={dangerBtn}
          >
            Sign out
          </button>
          <button onClick={() => router.back()} style={ghostBtn}>
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}

const shell: React.CSSProperties = {
  minHeight: "100svh",
  display: "grid",
  placeItems: "center",
  padding: 20,
  background:
    "radial-gradient(ellipse at top, rgba(125,211,252,0.08), transparent 50%), radial-gradient(ellipse at bottom, rgba(167,139,250,0.06), transparent 50%), #050518",
};

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 360,
  background: "rgba(15, 15, 35, 0.85)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: "32px 28px",
  backdropFilter: "blur(16px)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  textAlign: "center",
};

const avatarWrap: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: "50%",
  margin: "0 auto 18px",
  background: "linear-gradient(135deg, var(--brand-accent, #a78bfa), var(--brand-accent-2, #7dd3fc))",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.12)",
};

const avatarImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const avatarFallback: React.CSSProperties = {
  fontFamily: "var(--font-display, Georgia, serif)",
  fontWeight: 700,
  fontSize: 32,
  color: "#0a0a1f",
};

const title: React.CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display, Georgia, serif)",
  fontSize: 22,
  color: "white",
};

const subtle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 13,
  color: "rgba(255,255,255,0.55)",
};

const baseBtn: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid rgba(255,255,255,0.12)",
  transition: "background 120ms ease",
};

const primaryBtn: React.CSSProperties = {
  ...baseBtn,
  background: "linear-gradient(135deg, var(--brand-accent, #a78bfa), var(--brand-accent-2, #7dd3fc))",
  color: "#0a0a1f",
  border: "1px solid rgba(255,255,255,0.14)",
};

const dangerBtn: React.CSSProperties = {
  ...baseBtn,
  background: "rgba(239, 68, 68, 0.14)",
  color: "#fca5a5",
  border: "1px solid rgba(239, 68, 68, 0.35)",
};

const ghostBtn: React.CSSProperties = {
  ...baseBtn,
  background: "transparent",
  color: "rgba(255,255,255,0.6)",
};

const backLink: React.CSSProperties = {
  display: "inline-block",
  marginTop: 16,
  color: "rgba(255,255,255,0.5)",
  fontSize: 13,
  textDecoration: "none",
};
