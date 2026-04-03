import { notFound } from 'next/navigation';
import FootballLeagueRoute from '@/src/components/FootballLeagueRoute';
import { isFootballLeague } from '@/src/lib/football';

export default async function FootballLeaguePage({ params, searchParams }) {
  const { league } = await params;
  const query = await searchParams;

  if (!isFootballLeague(league)) {
    notFound();
  }

  return (
    <FootballLeagueRoute
      leagueKey={league}
      initialEntry={{
        playerId: query?.player || null,
        fromHub: query?.from === 'hub',
      }}
    />
  );
}
