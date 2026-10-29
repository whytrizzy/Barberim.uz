import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Debug endpoint disabled. Safe to delete the src/app/api/debug folder.
export async function GET() {
  return NextResponse.json({ ok: false, error: 'disabled' }, { status: 404 });
}
