import { NextRequest, NextResponse } from 'next/server';
import { deleteService, updateService } from '@/lib/dataService';
import { getAuthUser, serviceBarberId } from '@/lib/authGuard';

export const dynamic = 'force-dynamic';

async function authorizeServiceOwner(req: NextRequest, serviceId: string) {
  const auth = await getAuthUser(req);
  if (!auth) return { error: 'UNAUTHORIZED', status: 401 as const };
  if (!auth.barberProfileId) return { error: 'FORBIDDEN', status: 403 as const };

  const ownerId = await serviceBarberId(serviceId);
  if (!ownerId) return { error: 'Service not found', status: 404 as const };
  if (ownerId !== auth.barberProfileId) return { error: 'FORBIDDEN', status: 403 as const };

  return { auth };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id: serviceId } = await params;
    const gate = await authorizeServiceOwner(req, serviceId);
    if ('error' in gate) {
      return NextResponse.json({ success: false, error: gate.error }, { status: gate.status });
    }

    const body = await req.json();
    const { name, durationMinutes, price, isActive } = body;

    const updated = await updateService(serviceId, {
      name,
      durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      price: price ? Number(price) : undefined,
      isActive,
    });

    return NextResponse.json({ success: true, service: updated });
  } catch (err) {
    console.error('Service PUT error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update service' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id: serviceId } = await params;
    const gate = await authorizeServiceOwner(req, serviceId);
    if ('error' in gate) {
      return NextResponse.json({ success: false, error: gate.error }, { status: gate.status });
    }

    await deleteService(serviceId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Service DELETE error:', err);
    return NextResponse.json({ success: false, error: 'Failed to delete service' }, { status: 500 });
  }
}
