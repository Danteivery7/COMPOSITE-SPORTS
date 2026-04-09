import { NextResponse } from 'next/server';
import { getNFLTeamDetail } from '@/src/lib/nfl';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { teamId } = await params;

  try {
    const data = await getNFLTeamDetail(teamId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport: 'nfl',
        teamId,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
