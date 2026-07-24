import { NextRequest, NextResponse } from 'next/server';
import { getServices, createService } from '@/lib/dataService';
import { getAuthUser } from '@/lib/authGuard';

export const dynamic = 'force-dynamic';

// A barber manages their OWN services. barberId is taken from the verified caller.
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (!auth.barberProfileId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const services = await getServices(auth.barberProfileId);
    return NextResponse.json({ success: true, services });
  } catch (err) {
    console.error('Services GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch services' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (!auth.barberProfileId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const { name, durationMinutes, price } = body;

    if (!name || !durationMinutes || !price) {
      return NextResponse.json(
        { success: false, error: 'Name, duration and price are required' },
        { status: 400 }
      );
    }

    const service = await createService({
      barberId: auth.barberProfileId,
      name,
      durationMinutes: Number(durationMinutes),
      price: Number(price),
    });

    return NextResponse.json({ success: true, service });
  } catch (err) {
    console.error('Services POST error:', err);
    return NextResponse.json({ success: false, error: 'Failed to create service' }, { status: 500 });
  }
}
