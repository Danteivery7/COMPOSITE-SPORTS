import { notFound } from 'next/navigation';
import FootballLeagueRoute from '@/src/components/FootballLeagueRoute';
import { isFootballLeague } from '@/src/lib/football';
import { getFootballLeagueSnapshot } from '@/src/lib/live-sports-backend';

export default async function FootballLeaguePage({ params, searchParams }) {
  const { league } = await params;
  const query = await searchParams;

  if (!isFootballLeague(league)) {
    notFound();
  }

  let initialBootstrap = null;
  try {
    initialBootstrap = await getFootballLeagueSnapshot(league);
  } catch (_error) {
    initialBootstrap = null;
  }

  return (
    <FootballLeagueRoute
      leagueKey={league}
      initialBootstrap={initialBootstrap}
      initialEntry={{
        playerId: query?.player || null,
        fromHub: query?.from === 'hub',
      }}
    />
  );
}
