import { NextRequest, NextResponse } from 'next/server';
import { updateBookingStatus } from '@/lib/dataService';
import { getAuthUser, bookingParties } from '@/lib/authGuard';

export const dynamic = 'force-dynamic';

// A barber may only change the status of bookings that belong to their shop.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id: bookingId } = await params;

    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (!auth.barberProfileId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const parties = await bookingParties(bookingId);
    if (!parties) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
    }
    if (parties.barberId !== auth.barberProfileId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const { status } = body;
    if (!['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    const updated = await updateBookingStatus(bookingId, status);
    return NextResponse.json({ success: true, booking: updated });
  } catch (err) {
    console.error('Barber booking PATCH error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update booking status' }, { status: 500 });
  }
}
