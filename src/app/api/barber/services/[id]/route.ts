import { NextRequest, NextResponse } from 'next/server';
import { deleteService, updateService } from '@/lib/dataService';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const serviceId = resolvedParams.id;
    const body = await req.json();
    const { name, durationMinutes, price } = body;

    const updated = await updateService(serviceId, {
      name,
      durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      price: price ? Number(price) : undefined,
    });

    return NextResponse.json({ success: true, service: updated });
  } catch (err) {
    console.error('Service PUT error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to update service' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const serviceId = resolvedParams.id;
    await deleteService(serviceId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Service DELETE error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to delete service' },
      { status: 500 }
    );
  }
}
