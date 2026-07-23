import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, DEFAULT_WORKING_HOURS } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { telegramId, fullName, username, phone, role } = body as {
      telegramId: string | number;
      fullName: string;
      username?: string;
      phone?: string;
      role: Role;
    };

    if (!telegramId || !fullName || !role) {
      return NextResponse.json(
        { success: false, error: 'Missing required registration parameters' },
        { status: 400 }
      );
    }

    const tId = BigInt(telegramId);

    // Upsert User in PostgreSQL
    const user = await prisma.user.upsert({
      where: { telegramId: tId },
      update: { role: role as any, fullName, phone, username },
      create: {
        telegramId: tId,
        fullName,
        username: username || null,
        phone: phone || null,
        role: role as any,
      },
    });

    let barberProfileId: string | null = null;

    // If role is BARBER, ensure a BarberProfile exists in DB
    if (role === 'BARBER') {
      const existingProfile = await prisma.barberProfile.findUnique({
        where: { userId: user.id },
      });

      if (!existingProfile) {
        const newProfile = await prisma.barberProfile.create({
          data: {
            userId: user.id,
            shopName: `${fullName}`,
            bio: null,
            address: null,
            workingHours: DEFAULT_WORKING_HOURS as any,
          },
        });
        barberProfileId = newProfile.id;
      } else {
        barberProfileId = existingProfile.id;
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        telegramId: user.telegramId.toString(),
        username: user.username,
        role: user.role,
        fullName: user.fullName,
        phone: user.phone,
        barberProfileId,
      },
    });
  } catch (err) {
    console.error('Registration API error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to register user' },
      { status: 500 }
    );
  }
}
