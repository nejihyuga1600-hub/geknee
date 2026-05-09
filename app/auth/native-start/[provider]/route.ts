import { NextResponse } from 'next/server';
import { signIn } from '@/auth';

// Native OAuth start endpoint. SFSafariViewController opens this URL directly,
// so all NextAuth state/PKCE/CSRF cookies are set in SFSafari's cookie jar
// rather than the WKWebView's. Without this, the cookies set by client-side
// signIn() in the WKWebView never reach the OAuth callback running in
// SFSafari → NextAuth's state cookie verification fails → Configuration error.
//
// signIn() server-side throws a NEXT_REDIRECT that Next.js catches and turns
// into a 302 response carrying the OAuth start URL plus the cookies set by
// the OAuth provider config (state, pkce verifier, callback url).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const allowed = new Set(['google', 'apple', 'microsoft-entra-id']);
  if (!allowed.has(provider)) {
    return NextResponse.json({ error: 'unsupported provider' }, { status: 400 });
  }
  // redirectTo is where NextAuth lands the user AFTER the OAuth callback
  // succeeds. Our native-handoff page mints the JWT and emits geknee://...
  await signIn(provider, { redirectTo: '/auth/native-handoff' });
  // signIn always throws NEXT_REDIRECT — this line is unreachable.
  return new NextResponse(null, { status: 500 });
}
