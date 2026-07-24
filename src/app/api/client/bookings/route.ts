import { NextRequest, NextResponse } from 'next/server';
import { getBookings } from '@/lib/dataService';
import { getAuthUser } from '@/lib/authGuard';

export const dynamic = 'force-dynamic';

// A user views their OWN bookings only. clientId comes from the verified caller.
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const bookings = await getBookings({ clientId: auth.id });
    return NextResponse.json({ success: true, bookings });
  } catch (err) {
    console.error('Client bookings GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch client bookings' }, { status: 500 });
  }
}
