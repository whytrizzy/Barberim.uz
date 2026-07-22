import { NextRequest, NextResponse } from 'next/server';
import { getBarberProfile } from '@/lib/dataService';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const profile = await getBarberProfile(params.id);
    return NextResponse.json({ success: true, profile });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Barber not found' }, { status: 404 });
  }
}
