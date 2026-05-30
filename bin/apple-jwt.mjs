#!/usr/bin/env node
// Generate APPLE_CLIENT_SECRET (JWT) for Sign in with Apple → NextAuth.
//
// Prerequisites in Apple Developer Portal:
//   1. Certificates → Keys → "+" → "Sign in with Apple" → download AuthKey_XXXXXXXXXX.p8
//      Save it somewhere safe (you can only download once).
//   2. Note the 10-char Key ID (XXXXXXXXXX) shown next to the key.
//   3. Identifiers → Services IDs → "+" → fill in:
//        - Description: "geknee Sign in with Apple"
//        - Identifier: com.geknee.app.signin
//        - Enable "Sign in with Apple" → configure: primary App ID = com.geknee.app
//        - Web domain: www.geknee.com
//        - Return URL: https://www.geknee.com/api/auth/callback/apple
//      The Services ID identifier becomes APPLE_CLIENT_ID.
//   4. Membership → Team ID (10-char alphanumeric).
//
// Usage:
//   node bin/apple-jwt.mjs \
//     --p8 ~/Downloads/AuthKey_XXXXXXXXXX.p8 \
//     --key-id XXXXXXXXXX \
//     --team-id 42PQV5L5PT \
//     --client-id com.geknee.app.signin
//
// Output: prints the JWT to stdout. Then:
//   vercel env add APPLE_CLIENT_ID production    # paste com.geknee.app.signin
//   vercel env add APPLE_CLIENT_SECRET production # paste the JWT
//   vercel env add APPLE_CLIENT_ID preview        # same
//   vercel env add APPLE_CLIENT_SECRET preview    # same
//
// The JWT expires after 6 months. Re-run before then or you'll start
// getting Apple-side rejected sign-ins.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i === process.argv.length - 1) return null;
  return process.argv[i + 1];
}

const p8Path = arg('p8');
const keyId  = arg('key-id');
const teamId = arg('team-id');
const clientId = arg('client-id');

if (!p8Path || !keyId || !teamId || !clientId) {
  console.error('Usage: node bin/apple-jwt.mjs --p8 <AuthKey_XXXX.p8> --key-id XXXX --team-id YYYY --client-id com.geknee.app.signin');
  process.exit(1);
}

const privateKey = readFileSync(p8Path, 'utf8');

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const header  = b64url({ alg: 'ES256', kid: keyId });
const now = Math.floor(Date.now() / 1000);
const payload = b64url({
  iss: teamId,
  iat: now,
  exp: now + 60 * 60 * 24 * 180,  // 180 days — Apple's max is 6 months
  aud: 'https://appleid.apple.com',
  sub: clientId,
});

const signingInput = `${header}.${payload}`;
const signer = createSign('SHA256');
signer.update(signingInput);
signer.end();
const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');

process.stdout.write(`${signingInput}.${signature}\n`);
