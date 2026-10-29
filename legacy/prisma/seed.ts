import { PrismaClient, Role, BookingStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Barberim database...');

  // Create Barber User
  const barberUser = await prisma.user.upsert({
    where: { telegramId: BigInt(998901234567) },
    update: {},
    create: {
      telegramId: BigInt(998901234567),
      role: Role.BARBER,
      fullName: 'Sardor Barber',
      phone: '+998901234567',
    },
  });

  // Create Barber Profile
  const workingHoursJson = {
    workDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
    startTime: '09:00',
    endTime: '20:00',
    breakStart: '13:00',
    breakEnd: '14:00',
    slotDurationMinutes: 30,
  };

  const barberProfile = await prisma.barberProfile.upsert({
    where: { userId: barberUser.id },
    update: {},
    create: {
      userId: barberUser.id,
      shopName: 'Sardor Barbershop',
      bio: 'Master Barber with 8 years of experience. Premium haircuts, beard grooming, and hot towel treatments in Tashkent.',
      address: 'Amir Temur Avenue 42, Tashkent, Uzbekistan',
      workingHours: workingHoursJson,
    },
  });

  // Create Services
  const servicesData = [
    { name: 'Classic Men Haircut', durationMinutes: 45, price: 100000 },
    { name: 'Beard Trim & Modeling', durationMinutes: 30, price: 60000 },
    { name: 'VIP Full Styling & Hot Towel', durationMinutes: 60, price: 180000 },
    { name: 'Junior Haircut (Under 12)', durationMinutes: 30, price: 70000 },
  ];

  const createdServices = [];
  for (const s of servicesData) {
    const existing = await prisma.service.findFirst({
      where: { barberId: barberProfile.id, name: s.name },
    });
    if (!existing) {
      const serv = await prisma.service.create({
        data: {
          barberId: barberProfile.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          price: s.price,
        },
      });
      createdServices.push(serv);
    } else {
      createdServices.push(existing);
    }
  }

  // Create Client User
  const clientUser = await prisma.user.upsert({
    where: { telegramId: BigInt(998935551234) },
    update: {},
    create: {
      telegramId: BigInt(998935551234),
      role: Role.CLIENT,
      fullName: 'Davron Alimov',
      phone: '+998935551234',
    },
  });

  // Create Sample Booking
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setMinutes(tomorrowEnd.getMinutes() + 45);

  const existingBooking = await prisma.booking.findFirst({
    where: { clientId: clientUser.id, barberId: barberProfile.id },
  });

  if (!existingBooking && createdServices.length > 0) {
    const booking = await prisma.booking.create({
      data: {
        clientId: clientUser.id,
        barberId: barberProfile.id,
        startTime: tomorrow,
        endTime: tomorrowEnd,
        totalPrice: createdServices[0].price,
        status: BookingStatus.CONFIRMED,
        services: {
          create: [
            { serviceId: createdServices[0].id },
          ],
        },
      },
    });
    console.log('✅ Created sample booking:', booking.id);
  }

  console.log('🎉 Seeding completed successfully!');
  console.log('Barber ID:', barberProfile.id);
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
