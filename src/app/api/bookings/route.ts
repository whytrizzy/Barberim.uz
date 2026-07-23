import { NextRequest, NextResponse } from 'next/server';
import { createBooking } from '@/lib/dataService';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { barberId, clientId, serviceIds, startTime } = body;

    if (!barberId || !clientId || !serviceIds?.length || !startTime) {
      return NextResponse.json(
        { success: false, error: 'Missing required booking details (barberId, clientId, serviceIds, startTime)' },
        { status: 400 }
      );
    }

    const booking = await createBooking({
      barberId,
      clientId,
      serviceIds,
      startTime,
    });

    return NextResponse.json({ success: true, booking });
  } catch (err) {
    console.error('Booking creation error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to create booking' },
      { status: 500 }
    );
  }
}
