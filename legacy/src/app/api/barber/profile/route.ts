import { NextRequest, NextResponse } from 'next/server';
import { getBarberProfile, updateBarberProfile } from '@/lib/dataService';
import { getAuthUser } from '@/lib/authGuard';
import { prisma } from '@/lib/prisma';
import { DEFAULT_WORKING_HOURS } from '@/types';

export const dynamic = 'force-dynamic';

// A barber reads their OWN profile. Identity comes from the verified caller.
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (auth.role !== 'BARBER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    let profile = await getBarberProfile(undefined, auth.id);
    if (!profile) {
      // Auto-create barber profile if missing
      await prisma.barberProfile.create({
        data: {
          userId: auth.id,
          shopName: auth.fullName,
          bio: null,
          address: null,
          workingHours: DEFAULT_WORKING_HOURS as any,
        },
      });
      profile = await getBarberProfile(undefined, auth.id);
    }

    if (!profile) {
      return NextResponse.json({ success: false, error: 'Barber profile not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, profile });
  } catch (err) {
    console.error('Barber profile GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (auth.role !== 'BARBER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const { shopName, bio, address, fullName, phone, workingHours } = body;

    // Always update the caller's own profile — body ids are ignored.
    const profile = await updateBarberProfile(auth.id, {
      shopName,
      bio,
      address,
      fullName,
      phone,
      workingHours,
    });

    return NextResponse.json({ success: true, profile });
  } catch (err) {
    console.error('Barber profile PUT error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update profile' }, { status: 500 });
  }
}
