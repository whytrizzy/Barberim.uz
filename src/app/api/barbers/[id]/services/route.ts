import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@/lib/dataService';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const barberId = resolvedParams.id;

    const services = await getServices(barberId);
    return NextResponse.json({ success: true, services });
  } catch (err) {
    console.error('Barber services GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch barber services' },
      { status: 500 }
    );
  }
}
