import { NextRequest, NextResponse } from 'next/server';
import { updateMaster, deactivateMaster } from '@/lib/dataService';
import { getAuthUser, masterShopId } from '@/lib/authGuard';

export const dynamic = 'force-dynamic';

async function authorizeMasterOwner(req: NextRequest, masterId: string) {
  const auth = await getAuthUser(req);
  if (!auth) return { error: 'UNAUTHORIZED', status: 401 as const };
  if (!auth.barberProfileId) return { error: 'FORBIDDEN', status: 403 as const };

  const shopId = await masterShopId(masterId);
  if (!shopId) return { error: 'Master not found', status: 404 as const };
  if (shopId !== auth.barberProfileId) return { error: 'FORBIDDEN', status: 403 as const };

  return { auth };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id: masterId } = await params;
    const gate = await authorizeMasterOwner(req, masterId);
    if ('error' in gate) {
      return NextResponse.json({ success: false, error: gate.error }, { status: gate.status });
    }

    const body = await req.json();
    const { name, specialty, workingHours, isActive } = body;

    const master = await updateMaster(masterId, {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(specialty !== undefined && { specialty }),
      ...(workingHours !== undefined && { workingHours }),
      ...(isActive !== undefined && { isActive }),
    });

    return NextResponse.json({ success: true, master });
  } catch (err) {
    console.error('Master PUT error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update master' }, { status: 500 });
  }
}

// Soft-delete so past bookings keep their master reference.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id: masterId } = await params;
    const gate = await authorizeMasterOwner(req, masterId);
    if ('error' in gate) {
      return NextResponse.json({ success: false, error: gate.error }, { status: gate.status });
    }

    await deactivateMaster(masterId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Master DELETE error:', err);
    return NextResponse.json({ success: false, error: 'Failed to delete master' }, { status: 500 });
  }
}
