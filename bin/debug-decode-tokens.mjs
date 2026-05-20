// Decode the stored id_token JWTs on the Google Account rows so we can
// definitively map each providerAccountId (sub) to the Gmail address
// Google issued it for. id_tokens are NOT verified here — we trust the
// payload because Google issued them at link time. The 'email' claim is
// what matters; we ignore signature for this diagnostic.

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function decodeJwt(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

const accounts = await prisma.account.findMany({
  where: { provider: 'google' },
  include: { user: { select: { email: true } } },
});

console.log(`\n${accounts.length} Google Account rows:\n`);
for (const a of accounts) {
  const claims = decodeJwt(a.id_token);
  console.log(`Account ${a.id}`);
  console.log(`  linked User email: ${a.user.email}`);
  console.log(`  providerAccountId (sub): ${a.providerAccountId}`);
  console.log(`  id_token email claim:    ${claims?.email ?? '(no id_token)'}`);
  console.log(`  id_token name:           ${claims?.name ?? '(none)'}`);
  console.log(`  matches?: ${claims?.email === a.user.email ? '✅' : '❌ MISMATCH'}`);
  console.log('');
}

await prisma.$disconnect();
