// One-off diagnostic — inspect User + Account rows for the two emails
// the user is trying to switch between. Reads DATABASE_URL from .env.
// Run: node bin/debug-user-accounts.mjs

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const EMAILS = ['nejihyuga1600@gmail.com', 'nghiaphan081301@gmail.com'];

const users = await prisma.user.findMany({
  where: { email: { in: EMAILS } },
  include: { accounts: true },
});

console.log(`\nFound ${users.length} user rows for the two emails:\n`);
for (const u of users) {
  console.log(`User ${u.id}`);
  console.log(`  email: ${u.email}`);
  console.log(`  name: ${u.name ?? '(null)'}`);
  console.log(`  username: ${u.username ?? '(null)'}`);
  console.log(`  createdAt: ${u.createdAt.toISOString()}`);
  console.log(`  accounts: ${u.accounts.length}`);
  for (const a of u.accounts) {
    console.log(`    - ${a.provider}/${a.providerAccountId.slice(0, 12)}… (type=${a.type})`);
  }
  console.log('');
}

// Also: any Account row whose userId points at a User whose email *doesn't* match?
const allGoogleAccounts = await prisma.account.findMany({
  where: { provider: 'google' },
  include: { user: { select: { email: true, id: true } } },
});
console.log(`Total Google Account rows in DB: ${allGoogleAccounts.length}`);
const interesting = allGoogleAccounts.filter(a => EMAILS.includes(a.user.email));
console.log(`Google accounts linked to either of our two users:`);
for (const a of interesting) {
  console.log(`  ${a.user.email} <- google sub ${a.providerAccountId.slice(0, 12)}…  (account.id=${a.id})`);
}

await prisma.$disconnect();
