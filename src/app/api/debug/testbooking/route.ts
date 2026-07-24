import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createBooking } from '@/lib/dataService';

export const dynamic = 'force-dynamic';

// TEMPORARY debug endpoint — reproduces a booking directly against the DB so we
// can see the exact failure without going through Telegram. REMOVE after fixing.
export async function GET() {
  const diag: any = {};
  try {
    diag.counts = {
      users: await prisma.user.count(),
      barbers: await prisma.barberProfile.count(),
      services: await prisma.service.count(),
      activeServices: await prisma.service.count({ where: { isActive: true } }),
      bookings: await prisma.booking.count(),
    };

    const barber = await prisma.barberProfile.findFirst({
      include: { services: { where: { isActive: true } } },
    });
    if (!barber) return NextResponse.json({ ok: false, step: 'no-barber', diag });
    diag.barberId = barber.id;
    diag.activeServiceCount = barber.services.length;

    if (barber.services.length === 0) {
      return NextResponse.json({ ok: false, step: 'no-active-service', diag });
    }
    const service = barber.services[0];
    diag.serviceId = service.id;

    const client = await prisma.user.findFirst();
    if (!client) return NextResponse.json({ ok: false, step: 'no-user', diag });
    diag.clientId = client.id;

    const startTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    diag.startTime = startTime;

    const booking = await createBooking({
      barberId: barber.id,
      clientId: client.id,
      serviceIds: [service.id],
      startTime,
    });

    return NextResponse.json({ ok: true, created: booking.id, diag });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      step: 'exception',
      error: {
        name: err?.name,
        message: String(err?.message || err),
        code: err?.code,
        stack: String(err?.stack || '').split('\n').slice(0, 8),
      },
      diag,
    });
  }
}
