import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MOCK_BARBER_PROFILE } from '@/lib/mockData';
import { BarberProfileType } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get('query') || '').trim();
    const location = (searchParams.get('location') || '').trim();

    // Query Prisma DB
    let whereClause: any = {};

    if (query || location) {
      whereClause.OR = [
        { address: { contains: query || location, mode: 'insensitive' } },
        { bio: { contains: query, mode: 'insensitive' } },
        { user: { fullName: { contains: query, mode: 'insensitive' } } },
        { user: { phone: { contains: query, mode: 'insensitive' } } },
      ];
    }

    const profiles = await prisma.barberProfile.findMany({
      where: whereClause,
      include: {
        user: true,
        services: true,
      },
    });

    if (profiles && profiles.length > 0) {
      const formatted = profiles.map((p) => ({
        id: p.id,
        userId: p.userId,
        bio: p.bio,
        address: p.address,
        workingHours: p.workingHours as any,
        user: p.user
          ? {
              id: p.user.id,
              telegramId: p.user.telegramId.toString(),
              role: p.user.role as any,
              fullName: p.user.fullName,
              phone: p.user.phone,
            }
          : undefined,
        services: p.services.map((s) => ({
          id: s.id,
          barberId: s.barberId,
          name: s.name,
          durationMinutes: s.durationMinutes,
          price: s.price,
          isActive: s.isActive,
        })),
      }));

      return NextResponse.json({ success: true, barbers: formatted });
    }
  } catch (err) {
    console.warn('⚡ Fallback search database query');
  }

  // Memory fallback list
  const mockBarbers: BarberProfileType[] = [
    MOCK_BARBER_PROFILE,
    {
      id: 'barber-profile-2',
      userId: 'barber-user-2',
      bio: 'Top Fades & Styling Specialist in Tashkent City Center.',
      address: 'Navoi Street 14, Tashkent',
      workingHours: MOCK_BARBER_PROFILE.workingHours,
      user: {
        id: 'barber-user-2',
        telegramId: '998909876543',
        role: 'BARBER',
        fullName: 'Rustam Master Barber',
        phone: '+998 90 987 65 43',
      },
      services: MOCK_BARBER_PROFILE.services,
    },
  ];

  return NextResponse.json({ success: true, barbers: mockBarbers });
}
