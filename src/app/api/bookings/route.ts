import { NextRequest, NextResponse } from 'next/server';
import { createBooking } from '@/lib/dataService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { barberId, clientId, clientName, clientPhone, serviceIds, startTime } = body;

    if (!barberId || !clientPhone || !serviceIds?.length || !startTime) {
      return NextResponse.json(
        { success: false, error: 'Missing required booking details' },
        { status: 400 }
      );
    }

    const booking = await createBooking({
      barberId,
      clientId: clientId || 'client-user-1',
      clientName: clientName || 'Guest Client',
      clientPhone,
      serviceIds,
      startTime,
    });

    return NextResponse.json({ success: true, booking });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to create booking' }, { status: 500 });
  }
}
