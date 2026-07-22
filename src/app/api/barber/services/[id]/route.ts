import { NextRequest, NextResponse } from 'next/server';
import { deleteService } from '@/lib/dataService';

export const dynamic = 'force-dynamic';

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
    return NextResponse.json({ success: false, error: 'Failed to delete service' }, { status: 500 });
  }
}
