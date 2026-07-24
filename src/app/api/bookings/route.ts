import { NextRequest, NextResponse } from 'next/server';
import { createBooking } from '@/lib/dataService';
import { getAuthUser } from '@/lib/authGuard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const body = await req.json();
    const { barberId, serviceIds, startTime } = body;

    if (!barberId || !serviceIds?.length || !startTime) {
      return NextResponse.json(
        { success: false, error: 'Missing required booking details (barberId, serviceIds, startTime)' },
        { status: 400 }
      );
    }

    // clientId always comes from the verified caller — never trusted from the body.
    const booking = await createBooking({
      barberId,
      clientId: auth.id,
      serviceIds,
      startTime,
    });

    return NextResponse.json({ success: true, booking });
  } catch (err: any) {
    if (err?.message === 'SLOT_TAKEN') {
      return NextResponse.json(
        { success: false, error: 'SLOT_TAKEN', message: 'Bu vaqt band qilib bo\'lindi. Iltimos, boshqa vaqt tanlang.' },
        { status: 409 }
      );
    }
    if (err?.message === 'NO_VALID_SERVICES') {
      return NextResponse.json(
        { success: false, error: 'NO_VALID_SERVICES', message: 'Tanlangan xizmatlar topilmadi.' },
        { status: 400 }
      );
    }
    console.error('Booking creation error:', err);
    const detail = String(err?.message || 'unknown').replace(/\s+/g, ' ').slice(0, 200);
    return NextResponse.json(
      { success: false, error: 'Failed to create booking', message: `Xato: ${detail}` },
      { status: 500 }
    );
  }
}
