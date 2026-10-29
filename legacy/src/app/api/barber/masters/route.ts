import { NextRequest, NextResponse } from 'next/server';
import { getMasters, createMaster } from '@/lib/dataService';
import { getAuthUser } from '@/lib/authGuard';

export const dynamic = 'force-dynamic';

// A barber manages the masters of their OWN shop.
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    if (!auth.barberProfileId)
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });

    const masters = await getMasters(auth.barberProfileId, true);
    return NextResponse.json({ success: true, masters });
  } catch (err) {
    console.error('Barber masters GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch masters' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    if (!auth.barberProfileId)
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });

    const body = await req.json();
    const { name, specialty, workingHours } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    const master = await createMaster({
      shopId: auth.barberProfileId,
      name: String(name).trim(),
      specialty: specialty ?? null,
      workingHours: workingHours ?? null,
    });

    return NextResponse.json({ success: true, master });
  } catch (err) {
    console.error('Barber masters POST error:', err);
    return NextResponse.json({ success: false, error: 'Failed to create master' }, { status: 500 });
  }
}
