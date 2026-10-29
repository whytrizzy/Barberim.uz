/**
 * One-off migration: give every existing shop a default master and attach
 * existing bookings to it.
 *
 * Safe to run multiple times (idempotent).
 *
 *   npx ts-node --compiler-options {"module":"CommonJS"} prisma/backfill-masters.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const shops = await prisma.barberProfile.findMany({
    include: { user: true, masters: true },
  });

  console.log(`Found ${shops.length} shop(s).`);

  for (const shop of shops) {
    let master = shop.masters[0];

    if (!master) {
      master = await prisma.master.create({
        data: {
          shopId: shop.id,
          name: shop.user?.fullName || shop.shopName || 'Usta',
          isActive: true,
          sortOrder: 0,
          // workingHours left null => inherits the shop's hours
        },
      });
      console.log(`  + created master "${master.name}" for shop ${shop.shopName || shop.id}`);
    } else {
      console.log(`  = shop ${shop.shopName || shop.id} already has a master`);
    }

    const { count } = await prisma.booking.updateMany({
      where: { barberId: shop.id, masterId: null },
      data: { masterId: master.id },
    });
    if (count > 0) console.log(`  ~ linked ${count} booking(s) to "${master.name}"`);
  }

  const orphans = await prisma.booking.count({ where: { masterId: null } });
  console.log(`Done. Bookings still without a master: ${orphans}`);
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
