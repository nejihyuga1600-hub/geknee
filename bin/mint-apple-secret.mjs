#!/usr/bin/env node
// Mint APPLE_CLIENT_SECRET (JWT) for Sign In with Apple.
//
// Apple's "client secret" is actually a JWT signed with your downloaded .p8
// auth key. JWTs expire (max 6 months), so re-run this every ~5 months.
//
// Usage:
//   1. Create an Auth Key in Apple Developer console with Sign In with Apple
//      enabled. Download the AuthKey_<KEY_ID>.p8 file (one-time download).
//   2. Place the .p8 in this repo at ./apple/AuthKey_<KEY_ID>.p8 (gitignored).
//   3. Set env vars:
//        APPLE_TEAM_ID=ABC1234567        # 10-char Team ID (top-right of dev console)
//        APPLE_KEY_ID=DEF7654321         # 10-char Key ID from Apple console
//        APPLE_CLIENT_ID=com.geknee.signin  # your Services ID identifier
//   4. Run: node bin/mint-apple-secret.mjs
//   5. Paste the printed JWT into Vercel env as APPLE_CLIENT_SECRET
//
// Set a calendar reminder 5 months out to re-mint.

import { SignJWT, importPKCS8 } from 'jose';
import { readFileSync, existsSync } from 'node:fs';

const TEAM_ID = process.env.APPLE_TEAM_ID;
const KEY_ID = process.env.APPLE_KEY_ID;
const CLIENT_ID = process.env.APPLE_CLIENT_ID;

if (!TEAM_ID || !KEY_ID || !CLIENT_ID) {
  console.error('Set APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID');
  process.exit(1);
}

const keyPath = `./apple/AuthKey_${KEY_ID}.p8`;
if (!existsSync(keyPath)) {
  console.error(`Missing ${keyPath} — download from Apple Developer console`);
  process.exit(1);
}

const key = await importPKCS8(readFileSync(keyPath, 'utf8'), 'ES256');

const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
  .setIssuer(TEAM_ID)
  .setIssuedAt()
  .setExpirationTime('180d')
  .setAudience('https://appleid.apple.com')
  .setSubject(CLIENT_ID)
  .sign(key);

console.log('\n=== APPLE_CLIENT_SECRET ===\n');
console.log(jwt);
console.log('\nSet this as APPLE_CLIENT_SECRET on Vercel (production env).');
console.log('Re-mint before:', new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString());
