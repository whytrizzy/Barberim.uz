import { NextRequest, NextResponse } from 'next/server';
import { getBarberProfile, getBookings, getMasterWorkingHours } from '@/lib/dataService';
import { calculateTimeSlots } from '@/lib/slotEngine';

export const dynamic = 'force-dynamic';

/**
 * Availability is always per MASTER. `masterId` is required — each master has
 * an independent calendar, so shop-wide slots would be wrong.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date'); // YYYY-MM-DD
    const masterId = searchParams.get('masterId');
    const durationMinutes = Number(searchParams.get('duration')) || 30;

    if (!date) {
      return NextResponse.json(
        { success: false, error: 'Date parameter is required' },
        { status: 400 }
      );
    }
    if (!masterId) {
      return NextResponse.json(
        { success: false, error: 'masterId parameter is required' },
        { status: 400 }
      );
    }

    const profile = await getBarberProfile(resolvedParams.id);
    if (!profile) {
      return NextResponse.json({ success: false, error: 'Barber not found' }, { status: 404 });
    }

    const masterHours = await getMasterWorkingHours(masterId);
    if (!masterHours || masterHours.shopId !== resolvedParams.id) {
      return NextResponse.json({ success: false, error: 'Master not found' }, { status: 404 });
    }

    // Only this master's bookings block their calendar.
    const bookings = await getBookings({ masterId });
    const slots = calculateTimeSlots(date, masterHours.workingHours, durationMinutes, bookings);

    return NextResponse.json({ success: true, slots });
  } catch (err) {
    console.error('Slots calculation error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate time slots' },
      { status: 500 }
    );
  }
}
