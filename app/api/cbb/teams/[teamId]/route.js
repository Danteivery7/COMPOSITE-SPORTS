import { NextResponse } from 'next/server';
import { getCBBTeamDetail } from '@/src/lib/cbb';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  try {
    const { teamId } = await params;
    const data = await getCBBTeamDetail(teamId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport: 'cbb',
        error: error.message,
      },
      { status: 500 },
    );
  }
}
