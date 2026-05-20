import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';

const rawAdapter = PrismaAdapter(prisma);
const adapter = new Proxy(rawAdapter, {
  get(target, prop, receiver) {
    const val = Reflect.get(target, prop, receiver);
    if (typeof val === 'function') {
      return async (...args: unknown[]) => {
        try {
          const result = await (val as (...a: unknown[]) => Promise<unknown>)(...args);
          console.log(`[adapter] ${String(prop)} OK`);
          return result;
        } catch (e: unknown) {
          const err = e as Error;
          console.error(`[adapter] ${String(prop)} FAILED:`, err.message, err.stack?.slice(0, 500));
          throw e;
        }
      };
    }
    return val;
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  trustHost: true,
  debug: true,
  logger: {
    error(code, ...message) {
      console.error('[auth][error-full]', code, JSON.stringify(message, null, 2));
    },
  },

  cookies: {
    state: {
      name: 'authjs.state',
      options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: process.env.NODE_ENV === 'production' },
    },
    pkceCodeVerifier: {
      name: 'authjs.pkce.code_verifier',
      options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: process.env.NODE_ENV === 'production' },
    },
    callbackUrl: {
      name: 'authjs.callback-url',
      options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: process.env.NODE_ENV === 'production' },
    },
    sessionToken: {
      name: 'authjs.session-token',
      options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: process.env.NODE_ENV === 'production' },
    },
  },

  // JWT sessions — no DB lookup on every request
  session: { strategy: 'jwt' },

  providers: [
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID  ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      checks: ['none'],
      // Google verifies email ownership before issuing the id_token, so it
      // is safe to auto-link a Google sub to an existing User row that
      // shares the email. Without this, the second-time user who first
      // signed up via credentials (or Apple) is rejected with the cryptic
      // OAuthAccountNotLinked error. Email collisions across providers
      // would otherwise still be fine on Google because Google itself
      // forbids two accounts sharing a verified email.
      allowDangerousEmailAccountLinking: true,
      // Request gmail.readonly so the email-vault feature can poll the
      // user's inbox for booking confirmations. access_type=offline is
      // what triggers a refresh_token. We use prompt=select_account
      // ALONE (not combined with consent) — Google's documented
      // behavior for the combined string is inconsistent: with only one
      // Google session active, the browser often skips the chooser. The
      // refresh_token is still issued on first consent; subsequent
      // sign-ins reuse the cached grant. authuser=-1 nudges Google to
      // present the chooser even with cached cookies.
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
          access_type: 'offline',
          prompt: 'select_account',
          authuser: '-1',
        },
      },
    }),

    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? [Apple({
          clientId:     process.env.APPLE_CLIENT_ID,
          clientSecret: process.env.APPLE_CLIENT_SECRET,
        })]
      : []),

    // Microsoft Entra ID (formerly Azure AD) — covers Outlook.com,
    // Hotmail, Live, and Office 365 accounts. `tenant: 'common'` lets
    // both personal and work/school accounts sign in. Mail.Read is
    // requested so the email-vault feature can poll the user's inbox
    // for booking confirmations. offline_access is required for a
    // refresh_token to come back. Provider only registers when the
    // env vars are set, so a missing config doesn't break sign-in.
    ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
      ? [MicrosoftEntraID({
          clientId:     process.env.MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
          issuer:       `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID ?? 'common'}/v2.0`,
          authorization: {
            params: {
              scope: 'openid profile email offline_access Mail.Read',
            },
          },
        })]
      : []),

    Credentials({
      name: 'Email',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });
        if (!user?.password) return null;

        const passwordMatch = await compare(
          credentials.password as string,
          user.password,
        );
        if (!passwordMatch) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),

    // Native handoff: SFSafariViewController completes OAuth on the
    // server, deep-links back to the WKWebView with a short-lived signed
    // token, and we mint a session here. Token is verified for signature,
    // expiry (60s), and replay (in-memory jti LRU). See lib/handoff-token.ts.
    Credentials({
      id: 'native-handoff',
      name: 'Native Handoff',
      credentials: {
        token: { label: 'Token', type: 'text' },
      },
      async authorize(credentials) {
        const token = credentials?.token;
        if (typeof token !== 'string' || !token) return null;
        const { verifyHandoff } = await import('@/lib/handoff-token');
        try {
          const { userId } = await verifyHandoff(token);
          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (!user) return null;
          return { id: user.id, email: user.email, name: user.name, image: user.image };
        } catch (e) {
          console.warn('[auth][native-handoff] verify failed:', (e as Error).message);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    // Block the "sign-in-while-signed-in attaches new OAuth sub to current
    // session user" footgun. In JWT mode NextAuth silently calls
    // adapter.linkAccount(..., userId: currentSessionUserId) when a fresh
    // OAuth sub completes while a session cookie is still valid. That's how
    // we ended up with one user owning two distinct Google subs in
    // different Gmail accounts. We refuse the sign-in if a User already
    // exists whose email matches the OAuth profile but whose id differs
    // from what the OAuth account points at — forcing the client to retry
    // after signOut(), at which point allowDangerousEmailAccountLinking
    // takes the safe path.
    async signIn({ user, account, profile }) {
      if (!account || account.provider === 'credentials' || account.provider === 'native-handoff') return true;
      const oauthEmail = (profile as { email?: string } | null)?.email ?? user?.email ?? null;
      if (!oauthEmail) return true;
      try {
        const existing = await prisma.user.findUnique({ where: { email: oauthEmail }, select: { id: true } });
        if (existing && user?.id && existing.id !== user.id) {
          console.warn('[auth][signIn] cross-email link blocked', {
            provider: account.provider,
            oauthEmail,
            adapterUserId: user.id,
            existingUserId: existing.id,
          });
          return false;
        }
      } catch (e) {
        console.error('[auth][signIn] cross-email check failed:', (e as Error).message);
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        // Backfill: users who signed up before auto-username shipped get a
        // handle on their next sign-in. `user` is only defined on initial
        // JWT creation, so this runs at most once per session.
        if (user.id) {
          try {
            const { ensureUsername } = await import('@/lib/username');
            await ensureUsername(user.id);
          } catch { /* swallow — /u/<id> still works without a handle */ }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string; email?: string }).id = token.id as string;
        (session.user as { id?: string; email?: string }).email = token.email as string;
      }
      return session;
    },
  },

  events: {
    // Fires once when the PrismaAdapter creates a row for a new OAuth user.
    // Credentials signups flow through /api/auth/register which sets the
    // username up front; this event handles Google/Apple/etc. newcomers.
    async createUser({ user }) {
      if (!user.id) return;
      try {
        const { ensureUsername } = await import('@/lib/username');
        await ensureUsername(user.id);
      } catch (e) {
        console.error('[auth/events/createUser] ensureUsername failed:', e);
      }
    },
  },

  pages: {
    // Use our custom modal rather than the default NextAuth sign-in page
    signIn: '/',
  },
});
