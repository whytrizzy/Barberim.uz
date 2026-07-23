import { NextRequest, NextResponse } from 'next/server';
import { getBarberProfile, updateBarberProfile } from '@/lib/dataService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    const profile = await getBarberProfile(undefined, userId);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Barber profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, profile });
  } catch (err) {
    console.error('Barber profile GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, shopName, bio, address, fullName, phone, workingHours } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    const profile = await updateBarberProfile(userId, {
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
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
