import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

const ISSUER = 'geknee.com';
const AUDIENCE = 'geknee-native';
const TTL_SECONDS = 60;

function secret(): Uint8Array {
  const raw = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!raw) throw new Error('NEXTAUTH_SECRET / AUTH_SECRET not set');
  return new TextEncoder().encode(raw);
}

const seenJti = new Map<string, number>();
const LRU_MAX = 1000;
const LRU_TTL_MS = 5 * 60 * 1000;

function rememberJti(jti: string) {
  const now = Date.now();
  for (const [k, expiresAt] of seenJti) {
    if (expiresAt < now) seenJti.delete(k);
  }
  if (seenJti.size >= LRU_MAX) {
    const oldest = seenJti.keys().next().value;
    if (oldest) seenJti.delete(oldest);
  }
  seenJti.set(jti, now + LRU_TTL_MS);
}

function jtiSeen(jti: string): boolean {
  const expiresAt = seenJti.get(jti);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    seenJti.delete(jti);
    return false;
  }
  return true;
}

export async function mintHandoff(args: { userId: string; email: string }): Promise<string> {
  return new SignJWT({ email: args.email })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(args.userId)
    .setJti(randomUUID())
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyHandoff(token: string | undefined): Promise<{ userId: string; email: string }> {
  if (!token) throw new Error('handoff: missing token');
  const { payload } = await jwtVerify(token, secret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const jti = payload.jti;
  const sub = payload.sub;
  const email = typeof payload.email === 'string' ? payload.email : null;
  if (!jti || !sub || !email) throw new Error('handoff: malformed claims');
  if (jtiSeen(jti)) throw new Error('handoff: token already used');
  rememberJti(jti);
  return { userId: sub, email };
}
