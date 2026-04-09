import { NextResponse } from 'next/server';
import { FOOTBALL_ROUTE_ORDER } from '@/src/lib/football';
import {
  warmFootballLandingSnapshot,
  warmFootballLeagueSnapshot,
} from '@/src/lib/live-sports-backend';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [landing, leagues] = await Promise.all([
      warmFootballLandingSnapshot(true),
      Promise.allSettled(FOOTBALL_ROUTE_ORDER.map((leagueKey) => warmFootballLeagueSnapshot(leagueKey, true))),
    ]);

    return NextResponse.json({
      ok: true,
      landingUpdated: landing?.lastUpdated || landing?.snapshotUpdated || null,
      leagues: leagues.map((result, index) => ({
        league: FOOTBALL_ROUTE_ORDER[index],
        ok: result.status === 'fulfilled',
        lastUpdated: result.status === 'fulfilled'
          ? (result.value?.lastUpdated || result.value?.snapshotUpdated || null)
          : null,
        error: result.status === 'rejected' ? result.reason?.message || 'Warm failed' : null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Football warm failed' },
      { status: 500 },
    );
  }
}
