import { NextRequest, NextResponse } from 'next/server';
import { getMasters } from '@/lib/dataService';

export const dynamic = 'force-dynamic';

// Public: list the active masters of a shop so clients can pick one.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id } = await params;
    const masters = await getMasters(id);
    return NextResponse.json({ success: true, masters });
  } catch (err) {
    console.error('Masters GET error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch masters' },
      { status: 500 }
    );
  }
}
