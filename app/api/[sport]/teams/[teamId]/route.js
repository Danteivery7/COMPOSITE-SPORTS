import { NextResponse } from 'next/server';
import { getTeamDetail, isGenericSport } from '@/src/lib/generic-sports';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { sport, teamId } = await params;

  if (!isGenericSport(sport)) {
    return NextResponse.json({ error: 'Unsupported sport' }, { status: 404 });
  }

  try {
    const data = await getTeamDetail(sport, teamId);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        sport,
        teamId,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
