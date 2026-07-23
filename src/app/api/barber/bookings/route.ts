import { NextRequest, NextResponse } from 'next/server';
import { getBookings } from '@/lib/dataService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const barberId = searchParams.get('barberId');

    if (!barberId) {
      return NextResponse.json(
        { success: false, error: 'barberId query parameter is required' },
        { status: 400 }
      );
    }

    const bookings = await getBookings({ barberId });
    return NextResponse.json({ success: true, bookings });
  } catch (err) {
    console.error('Barber bookings GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}
