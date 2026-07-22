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
    const updated = await updateBookingStatus(bookingId, 'CANCELLED');
    return NextResponse.json({ success: true, booking: updated });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to cancel booking' }, { status: 500 });
  }
}
