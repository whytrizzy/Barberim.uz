import { NextRequest, NextResponse } from 'next/server';
import { getBarberProfile } from '@/lib/dataService';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const profile = await getBarberProfile(resolvedParams.id);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Barber not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, profile });
  } catch (err) {
    console.error('Barber detail GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Barber not found' },
      { status: 404 }
    );
  }
}
