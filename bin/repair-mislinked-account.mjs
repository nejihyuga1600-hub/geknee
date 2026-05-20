// Repair the mislinked Google Account row. Background:
//   Account cmpc6gv0a0001ie44l5hw9kn2 holds Google sub 100740599030…
//   The id_token email claim for that sub is nejihyuga1600@gmail.com,
//   but the row's userId points to the nghiaphan081301@gmail.com User.
//   This makes every "sign in as nejihyuga" land in nghiaphan's session.
//
// Cause: NextAuth in JWT mode auto-links new OAuth accounts to whoever
// is currently signed in. The user was signed in as nghiaphan when they
// completed Google OAuth as nejihyuga → wrong link.
//
// Fix: UPDATE the bad Account row's userId to point at the existing
// nejihyuga User row. Also backfill name/image so the user identity is
// clean. No data loss — User A keeps everything except this stray link.

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const BAD_ACCOUNT_ID = 'cmpc6gv0a0001ie44l5hw9kn2';
const CORRECT_USER_ID = 'cmpbzbbzi0000iessqckq05th'; // nejihyuga1600@gmail.com

// Sanity check before mutating
const acct = await prisma.account.findUnique({
  where: { id: BAD_ACCOUNT_ID },
  include: { user: { select: { email: true } } },
});
if (!acct) {
  console.error('Account row not found — aborting.');
  process.exit(1);
}

console.log('Before:');
console.log(`  Account ${acct.id}`);
console.log(`  providerAccountId: ${acct.providerAccountId}`);
console.log(`  currently linked to: ${acct.user.email} (${acct.userId})`);
console.log('');

const correctUser = await prisma.user.findUnique({
  where: { id: CORRECT_USER_ID },
});
if (!correctUser) {
  console.error('Target user row not found — aborting.');
  process.exit(1);
}
console.log(`Re-linking to: ${correctUser.email} (${correctUser.id})`);
console.log('');

// Decode id_token to grab Google's authoritative name + picture for backfill
function decodeJwt(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch { return null; }
}
const claims = acct.id_token ? decodeJwt(acct.id_token) : null;

await prisma.$transaction([
  prisma.account.update({
    where: { id: BAD_ACCOUNT_ID },
    data: { userId: CORRECT_USER_ID },
  }),
  // Refresh name/image from the Google profile so the test-account stub
  // gets the real identity. Username left alone — user can rename via /account.
  prisma.user.update({
    where: { id: CORRECT_USER_ID },
    data: {
      ...(claims?.name ? { name: claims.name } : {}),
      ...(claims?.picture ? { image: claims.picture } : {}),
      emailVerified: new Date(),
    },
  }),
]);

console.log('✅ Re-link complete. Verifying...');

const after = await prisma.account.findUnique({
  where: { id: BAD_ACCOUNT_ID },
  include: { user: { select: { email: true, name: true, image: true } } },
});
console.log('After:');
console.log(`  Account.userId now → ${after.user.email}`);
console.log(`  User.name now      → ${after.user.name}`);
console.log(`  User.image now     → ${after.user.image ? '(set)' : '(null)'}`);

await prisma.$disconnect();
