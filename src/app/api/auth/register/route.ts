import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types';
import { MOCK_WORKING_HOURS } from '@/lib/mockData';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { telegramId, fullName, phone, role } = body as {
      telegramId: string | number;
      fullName: string;
      phone?: string;
      role: Role;
    };

    if (!telegramId || !fullName || !role) {
      return NextResponse.json({ success: false, error: 'Missing required registration parameters' }, { status: 400 });
    }

    const tId = BigInt(telegramId);

    // Upsert User in PostgreSQL
    const user = await prisma.user.upsert({
      where: { telegramId: tId },
      update: { role: role as any, fullName, phone },
      create: {
        telegramId: tId,
        fullName,
        phone: phone || '+998900000000',
        role: role as any,
      },
    });

    // If role is BARBER, ensure a BarberProfile exists in DB
    if (role === 'BARBER') {
      const existingProfile = await prisma.barberProfile.findUnique({
        where: { userId: user.id },
      });

      if (!existingProfile) {
        await prisma.barberProfile.create({
          data: {
            userId: user.id,
            bio: `${fullName} Master Barber in Uzbekistan.`,
            address: 'Tashkent, Uzbekistan',
            workingHours: MOCK_WORKING_HOURS as any,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        telegramId: user.telegramId.toString(),
        role: user.role,
        fullName: user.fullName,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error('Registration API error:', err);
    return NextResponse.json({ success: false, error: 'Failed to register user' }, { status: 500 });
  }
}
