import { NextRequest, NextResponse } from 'next/server';
import { updateBookingStatus } from '@/lib/dataService';
import { getAuthUser, bookingParties } from '@/lib/authGuard';

export const dynamic = 'force-dynamic';

// A user may only cancel their OWN booking.
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

    const parties = await bookingParties(bookingId);
    if (!parties) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
    }
    if (parties.clientId !== auth.id) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const updated = await updateBookingStatus(bookingId, 'CANCELLED');
    return NextResponse.json({ success: true, booking: updated });
  } catch (err) {
    console.error('Client booking cancel error:', err);
    return NextResponse.json({ success: false, error: 'Failed to cancel booking' }, { status: 500 });
  }
}
