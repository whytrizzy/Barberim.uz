import { NextRequest, NextResponse } from 'next/server';
import { updateBookingStatus } from '@/lib/dataService';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const bookingId = resolvedParams.id;
    const body = await req.json();
    const { status } = body;

    if (!['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    const updated = await updateBookingStatus(bookingId, status);
    return NextResponse.json({ success: true, booking: updated });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to update booking status' }, { status: 500 });
  }
}
