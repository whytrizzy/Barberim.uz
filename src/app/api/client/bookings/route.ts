import { NextRequest, NextResponse } from 'next/server';
import { getBookings } from '@/lib/dataService';
import { MOCK_CLIENT_USER } from '@/lib/mockData';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId') || MOCK_CLIENT_USER.id;

    const bookings = await getBookings({ clientId });
    return NextResponse.json({ success: true, bookings });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to fetch client bookings' }, { status: 500 });
  }
}
