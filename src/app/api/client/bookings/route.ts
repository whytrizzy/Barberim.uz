import { NextRequest, NextResponse } from 'next/server';
import { getBookings } from '@/lib/dataService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId');

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: 'clientId query parameter is required' },
        { status: 400 }
      );
    }

    const bookings = await getBookings({ clientId });
    return NextResponse.json({ success: true, bookings });
  } catch (err) {
    console.error('Client bookings GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch client bookings' },
      { status: 500 }
    );
  }
}
