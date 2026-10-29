/**
 * Demo data for development: one Tashkent shop with three masters, real-looking services,
 * schedules (lunch break, Friday-prayer break, a day off) and bookings over the next days.
 *   npm run db:seed
 * Re-runnable: it deletes and recreates the demo shop. Refuses to run outside development.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { fromTashkent, toTashkent } from '../src/domain/time';
import { PrismaClient } from '../src/generated/prisma/client';

try {
  process.loadEnvFile('.env.local');
} catch {
  // Rely on the real environment.
}

if ((process.env.APP_ENV ?? 'development') !== 'development') {
  throw new Error('Seeding only runs with APP_ENV=development');
}
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL in .env.local');

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const SLUG = 'ustoz-demo';
const hm = (h: number, m = 0) => h * 60 + m;

/** Tashkent date `offset` days from today. */
function day(offset: number) {
  const today = toTashkent(new Date());
  const base = fromTashkent(today.year, today.month, today.day);
  return toTashkent(new Date(base.getTime() + offset * 86_400_000));
}

async function main() {
  // Telegram ids from 100000001 up are fake; 100000001 is the browser-mode dev user (src/telegram).
  const users = await Promise.all(
    [
      { telegramId: 100000001n, firstName: 'Dev', lastName: 'Owner', locale: 'uz_Latn' as const },
      { telegramId: 100000002n, firstName: 'Sardor', lastName: 'Aliyev' },
      { telegramId: 100000003n, firstName: 'Aziz', lastName: 'Karimov', phone: '+998901112233' },
      { telegramId: 100000004n, firstName: 'Дмитрий', lastName: 'Ким', locale: 'ru' as const },
    ].map((u) => db.user.upsert({ where: { telegramId: u.telegramId }, update: {}, create: u })),
  );
  const [owner, sardorUser, aziz, dmitry] = users as [
    (typeof users)[0],
    (typeof users)[0],
    (typeof users)[0],
    (typeof users)[0],
  ];

  await db.shop.deleteMany({ where: { slug: SLUG } });

  const shop = await db.shop.create({
    data: {
      slug: SLUG,
      name: 'Ustoz Barbershop',
      about: 'Demo sartaroshxona. Klassik va zamonaviy soch turmaklari, soqol, bolalar uchun.',
      address: 'Chilonzor tumani, 9-kvartal, 14-uy',
      landmark: 'Novza metrosi yonida',
      district: 'Chilonzor',
      lat: 41.2925,
      lng: 69.2051,
      status: 'ACTIVE',
      settings: { slotStepMin: 20, minNoticeMin: 60, horizonDays: 30, bufferMin: 0 },
    },
  });

  const services = {
    haircut: await db.service.create({
      data: { shopId: shop.id, name: 'Soch olish', durationMin: 40, price: 60000, sortOrder: 1 },
    }),
    haircutBeard: await db.service.create({
      data: { shopId: shop.id, name: 'Soch + soqol', durationMin: 60, price: 90000, sortOrder: 2 },
    }),
    beard: await db.service.create({
      data: {
        shopId: shop.id,
        name: 'Soqol',
        category: 'BEARD',
        durationMin: 20,
        price: 35000,
        sortOrder: 3,
      },
    }),
    kids: await db.service.create({
      data: {
        shopId: shop.id,
        name: 'Bolalar soch olishi',
        category: 'KIDS',
        durationMin: 30,
        price: 40000,
        sortOrder: 4,
      },
    }),
    groom: await db.service.create({
      data: {
        shopId: shop.id,
        name: 'Kuyov paketi',
        category: 'WEDDING',
        durationMin: 120,
        price: 250000,
        priceIsFrom: true,
        sortOrder: 5,
      },
    }),
  };

  const ownerStaff = await db.staff.create({
    data: {
      shopId: shop.id,
      userId: owner.id,
      displayName: 'Jasur',
      role: 'OWNER',
      bio: '12 yillik tajriba. Klassik soch turmaklari.',
      sortOrder: 1,
    },
  });
  const sardor = await db.staff.create({
    data: {
      shopId: shop.id,
      userId: sardorUser.id,
      displayName: 'Sardor',
      role: 'MASTER',
      bio: 'Fade va zamonaviy turmaklar.',
      commissionPct: 50,
      sortOrder: 2,
    },
  });
  // Not yet joined: invited but no Telegram account linked.
  const bekzod = await db.staff.create({
    data: {
      shopId: shop.id,
      displayName: 'Bekzod',
      role: 'MASTER',
      commissionPct: 45,
      sortOrder: 3,
    },
  });
  const masters = [ownerStaff, sardor, bekzod];

  // Everyone does everything except the groom package (only Jasur); Sardor is faster at beards.
  await db.staffService.createMany({
    data: [
      ...masters.flatMap((m) =>
        [services.haircut, services.haircutBeard, services.beard, services.kids].map((s) => ({
          staffId: m.id,
          serviceId: s.id,
        })),
      ),
      { staffId: ownerStaff.id, serviceId: services.groom.id },
    ].map((row) =>
      row.staffId === sardor.id && row.serviceId === services.beard.id
        ? { ...row, durationOverride: 15 }
        : row,
    ),
  });

  // Mon–Sat 10:00–20:00 with lunch 13:20–14:00; Friday breaks for prayer 12:30–14:00.
  // Jasur and Sardor rest on Sunday; Bekzod works Tue–Sun.
  const weekly = (staffId: string, weekdays: number[]) =>
    weekdays.flatMap((weekday) =>
      weekday === 5
        ? [
            { staffId, weekday, startMin: hm(10), endMin: hm(12, 30) },
            { staffId, weekday, startMin: hm(14), endMin: hm(20) },
          ]
        : [
            { staffId, weekday, startMin: hm(10), endMin: hm(13, 20) },
            { staffId, weekday, startMin: hm(14), endMin: hm(20) },
          ],
    );
  await db.weeklyHours.createMany({
    data: [
      ...weekly(ownerStaff.id, [1, 2, 3, 4, 5, 6]),
      ...weekly(sardor.id, [1, 2, 3, 4, 5, 6]),
      ...weekly(bekzod.id, [2, 3, 4, 5, 6, 7]),
    ],
  });

  // Sardor is off in 3 days; Jasur leaves early (16:00) in 2 days.
  const d2 = day(2);
  const d3 = day(3);
  await db.scheduleOverride.createMany({
    data: [
      {
        staffId: sardor.id,
        date: new Date(Date.UTC(d3.year, d3.month - 1, d3.day)),
        type: 'DAY_OFF',
        reason: 'Toʻy',
      },
      {
        staffId: ownerStaff.id,
        date: new Date(Date.UTC(d2.year, d2.month - 1, d2.day)),
        type: 'CUSTOM_HOURS',
        startMin: hm(10),
        endMin: hm(16),
      },
    ],
  });

  const clients = {
    aziz: await db.shopClient.create({
      data: {
        shopId: shop.id,
        userId: aziz.id,
        name: 'Aziz Karimov',
        phone: aziz.phone,
        visitCount: 7,
      },
    }),
    dmitry: await db.shopClient.create({
      data: { shopId: shop.id, userId: dmitry.id, name: 'Дмитрий Ким', visitCount: 2 },
    }),
    walkIn: await db.shopClient.create({
      data: { shopId: shop.id, name: 'Timur', notes: 'Kalta fade, soqolsiz' },
    }),
    phone: await db.shopClient.create({
      data: {
        shopId: shop.id,
        name: 'Diyor Rahimov',
        phone: '+998935554433',
        noShowCount: 1,
      },
    }),
  };

  type Svc = (typeof services)[keyof typeof services];
  async function book(opts: {
    staffId: string;
    clientId: string;
    dayOffset: number;
    at: [number, number];
    items: Svc[];
    source?: 'APP' | 'WALK_IN' | 'PHONE';
    status?: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED_CLIENT';
    groupId?: string;
  }) {
    const d = day(opts.dayOffset);
    const startAt = fromTashkent(d.year, d.month, d.day, opts.at[0], opts.at[1]);
    const minutes = opts.items.reduce((sum, s) => sum + s.durationMin, 0);
    return db.booking.create({
      data: {
        shopId: shop.id,
        staffId: opts.staffId,
        shopClientId: opts.clientId,
        startAt,
        endAt: new Date(startAt.getTime() + minutes * 60_000),
        status: opts.status ?? 'CONFIRMED',
        source: opts.source ?? 'APP',
        groupId: opts.groupId,
        totalPrice: opts.items.reduce((sum, s) => sum + s.price, 0),
        cancelledAt: opts.status === 'CANCELLED_CLIENT' ? new Date() : undefined,
        items: {
          create: opts.items.map((s, i) => ({
            serviceId: s.id,
            nameSnapshot: s.name,
            priceSnapshot: s.price,
            durationSnapshot: s.durationMin,
            sortOrder: i,
          })),
        },
      },
    });
  }

  await book({
    staffId: ownerStaff.id,
    clientId: clients.aziz.id,
    dayOffset: -7,
    at: [11, 0],
    items: [services.haircutBeard],
    status: 'COMPLETED',
  });
  await book({
    staffId: ownerStaff.id,
    clientId: clients.aziz.id,
    dayOffset: 1,
    at: [10, 0],
    items: [services.haircutBeard],
  });
  await book({
    staffId: sardor.id,
    clientId: clients.walkIn.id,
    dayOffset: 1,
    at: [11, 20],
    items: [services.haircut],
    source: 'WALK_IN',
  });
  await book({
    staffId: sardor.id,
    clientId: clients.phone.id,
    dayOffset: 1,
    at: [12, 0],
    items: [services.kids],
    source: 'PHONE',
  });
  // Cancelled bookings free their time: this one overlaps the next and is allowed.
  await book({
    staffId: sardor.id,
    clientId: clients.dmitry.id,
    dayOffset: 1,
    at: [14, 0],
    items: [services.haircut],
    status: 'CANCELLED_CLIENT',
  });
  await book({
    staffId: sardor.id,
    clientId: clients.dmitry.id,
    dayOffset: 1,
    at: [14, 0],
    items: [services.haircut, services.beard],
  });
  await book({
    staffId: ownerStaff.id,
    clientId: clients.aziz.id,
    dayOffset: 4,
    at: [14, 0],
    items: [services.groom],
  });
  // Family booking: father and son back to back with Bekzod.
  const family = crypto.randomUUID();
  await book({
    staffId: bekzod.id,
    clientId: clients.phone.id,
    dayOffset: 2,
    at: [15, 0],
    items: [services.haircut],
    groupId: family,
    source: 'PHONE',
  });
  await book({
    staffId: bekzod.id,
    clientId: clients.phone.id,
    dayOffset: 2,
    at: [15, 40],
    items: [services.kids],
    groupId: family,
    source: 'PHONE',
  });

  const counts = {
    services: await db.service.count({ where: { shopId: shop.id } }),
    staff: await db.staff.count({ where: { shopId: shop.id } }),
    weeklyHours: await db.weeklyHours.count({ where: { staff: { shopId: shop.id } } }),
    clients: await db.shopClient.count({ where: { shopId: shop.id } }),
    bookings: await db.booking.count({ where: { shopId: shop.id } }),
  };
  console.log(`Seeded "${shop.name}" (/${shop.slug}):`, counts);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
