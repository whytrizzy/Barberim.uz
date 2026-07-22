import { NextRequest, NextResponse } from 'next/server';
import { deleteService } from '@/lib/dataService';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serviceId = params.id;
    await deleteService(serviceId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to delete service' }, { status: 500 });
  }
}
