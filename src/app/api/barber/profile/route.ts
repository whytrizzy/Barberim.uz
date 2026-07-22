import { NextRequest, NextResponse } from 'next/server';
import { getBarberProfile, updateBarberProfile } from '@/lib/dataService';

export async function GET() {
  try {
    const profile = await getBarberProfile();
    return NextResponse.json({ success: true, profile });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { bio, address, workingHours } = body;

    const profile = await updateBarberProfile({ bio, address, workingHours });
    return NextResponse.json({ success: true, profile });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to update profile' }, { status: 500 });
  }
}
