import { NextResponse } from 'next/server';
import { resolveFootballHeadshotAsset } from '@/src/lib/football';

const DEFAULT_HEADSHOT = 'https://a.espncdn.com/i/headshots/nophoto.png';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const searchParams = request.nextUrl.searchParams;
  const playerId = String(searchParams.get('playerId') || '').trim();
  const displayName = String(searchParams.get('name') || '').trim();
  const shortName = String(searchParams.get('shortName') || '').trim();
  const teamName = String(searchParams.get('team') || '').trim();
  const currentHeadshot = String(searchParams.get('src') || '').trim();

  try {
    const resolved = await resolveFootballHeadshotAsset({
      playerId,
      displayName,
      shortName,
      teamName,
      currentHeadshot,
    });

    const response = NextResponse.redirect(resolved || DEFAULT_HEADSHOT, 307);
    response.headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return response;
  } catch (_error) {
    const response = NextResponse.redirect(DEFAULT_HEADSHOT, 307);
    response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return response;
  }
}
