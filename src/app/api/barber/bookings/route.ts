import { NextResponse } from 'next/server';
import { getBookings } from '@/lib/dataService';
import { MOCK_BARBER_PROFILE } from '@/lib/mockData';

export async function GET() {
  try {
    const bookings = await getBookings({ barberId: MOCK_BARBER_PROFILE.id });
    return NextResponse.json({ success: true, bookings });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to fetch bookings' }, { status: 500 });
  }
}
