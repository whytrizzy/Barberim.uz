import { NextRequest, NextResponse } from 'next/server';
import { getBarberProfile, updateBarberProfile } from '@/lib/dataService';
import { getAuthUser } from '@/lib/authGuard';

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

    const profile = await getBarberProfile(undefined, auth.id);
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
