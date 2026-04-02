import { NextResponse } from 'next/server';
import { warmHubSnapshots } from '@/src/lib/hub';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await warmHubSnapshots());
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        lastUpdated: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
