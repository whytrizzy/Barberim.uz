import { NextRequest, NextResponse } from 'next/server';
import { getServices, createService } from '@/lib/dataService';
import { MOCK_BARBER_PROFILE } from '@/lib/mockData';

export async function GET() {
  try {
    const services = await getServices(MOCK_BARBER_PROFILE.id);
    return NextResponse.json({ success: true, services });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to fetch services' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, durationMinutes, price, barberId } = body;

    if (!name || !durationMinutes || !price) {
      return NextResponse.json(
        { success: false, error: 'Name, duration, and price are required' },
        { status: 400 }
      );
    }

    const service = await createService({
      barberId: barberId || MOCK_BARBER_PROFILE.id,
      name,
      durationMinutes: Number(durationMinutes),
      price: Number(price),
    });

    return NextResponse.json({ success: true, service });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to create service' }, { status: 500 });
  }
}
