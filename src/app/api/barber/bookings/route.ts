import { NextRequest, NextResponse } from 'next/server';
import { getBookings } from '@/lib/dataService';
import { getAuthUser } from '@/lib/authGuard';

export const dynamic = 'force-dynamic';

// A barber views their OWN bookings only.
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (!auth.barberProfileId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const bookings = await getBookings({ barberId: auth.barberProfileId });
    return NextResponse.json({ success: true, bookings });
  } catch (err) {
    console.error('Barber bookings GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch bookings' }, { status: 500 });
  }
}
