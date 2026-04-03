import { NextResponse } from 'next/server';
import { getCBBPlayerCatalog } from '@/src/lib/cbb';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const query = request.nextUrl.searchParams.get('q')?.trim() || '';
    const data = await getCBBPlayerCatalog({ query });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport: 'cbb',
        error: error.message,
        players: [],
        lastUpdated: null,
      },
      { status: 500 },
    );
  }
}
