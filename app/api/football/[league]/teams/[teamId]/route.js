import { NextResponse } from 'next/server';
import { getFootballTeamDetail, isFootballLeague } from '@/src/lib/football';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { league, teamId } = await params;

  if (!isFootballLeague(league)) {
    return NextResponse.json({ error: 'Unsupported football league' }, { status: 404 });
  }

  try {
    const data = await getFootballTeamDetail(league, teamId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        league,
        teamId,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
