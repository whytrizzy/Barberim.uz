import { NextRequest, NextResponse } from 'next/server';
import { getServices, createService } from '@/lib/dataService';

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

    const services = await getServices(barberId);
    return NextResponse.json({ success: true, services });
  } catch (err) {
    console.error('Services GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch services' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, durationMinutes, price, barberId } = body;

    if (!name || !durationMinutes || !price || !barberId) {
      return NextResponse.json(
        { success: false, error: 'Name, duration, price, and barberId are required' },
        { status: 400 }
      );
    }

    const service = await createService({
      barberId,
      name,
      durationMinutes: Number(durationMinutes),
      price: Number(price),
    });

    return NextResponse.json({ success: true, service });
  } catch (err) {
    console.error('Services POST error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to create service' },
      { status: 500 }
    );
  }
}
