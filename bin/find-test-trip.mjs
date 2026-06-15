import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const u = await p.user.findUnique({ where: { email: "nghiaphan081301@gmail.com" }, select: { id: true } });
if (!u) { console.error("no user"); process.exit(1); }
const trips = await p.tripDraft.findMany({
  where: { userId: u.id, itinerary: { not: null } },
  select: { id: true, location: true, startDate: true, endDate: true, nights: true },
  orderBy: { updatedAt: "desc" },
  take: 3,
});
console.log(JSON.stringify(trips, null, 2));
await p.$disconnect();
