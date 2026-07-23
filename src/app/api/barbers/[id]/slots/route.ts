import { NextRequest, NextResponse } from 'next/server';
import { getBarberProfile, getBookings } from '@/lib/dataService';
import { calculateTimeSlots } from '@/lib/slotEngine';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date'); // YYYY-MM-DD
    const durationMinutes = Number(searchParams.get('duration')) || 30;

    if (!date) {
      return NextResponse.json(
        { success: false, error: 'Date parameter is required' },
        { status: 400 }
      );
    }

    const profile = await getBarberProfile(resolvedParams.id);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Barber not found' },
        { status: 404 }
      );
    }

    const bookings = await getBookings({ barberId: resolvedParams.id });
    const slots = calculateTimeSlots(date, profile.workingHours, durationMinutes, bookings);

    return NextResponse.json({ success: true, slots });
  } catch (err) {
    console.error('Slots calculation error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate time slots' },
      { status: 500 }
    );
  }
}
