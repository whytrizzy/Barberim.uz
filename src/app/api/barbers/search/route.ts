import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get('query') || '').trim();

    // Build where clause for search
    let whereClause: any = {};

    if (query) {
      whereClause.OR = [
        { address: { contains: query, mode: 'insensitive' } },
        { shopName: { contains: query, mode: 'insensitive' } },
        { bio: { contains: query, mode: 'insensitive' } },
        { user: { fullName: { contains: query, mode: 'insensitive' } } },
        { user: { phone: { contains: query, mode: 'insensitive' } } },
      ];
    }

    const profiles = await prisma.barberProfile.findMany({
      where: whereClause,
      include: {
        user: true,
        services: { where: { isActive: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = profiles.map((p) => ({
      id: p.id,
      userId: p.userId,
      shopName: p.shopName,
      bio: p.bio,
      address: p.address,
      workingHours: p.workingHours as any,
      user: p.user
        ? {
            id: p.user.id,
            telegramId: p.user.telegramId.toString(),
            username: p.user.username,
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
  } catch (err) {
    console.error('Barber search error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to search barbers' },
      { status: 500 }
    );
  }
}
