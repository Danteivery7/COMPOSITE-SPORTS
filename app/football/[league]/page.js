import { notFound } from 'next/navigation';
import FootballLeagueRoute from '@/src/components/FootballLeagueRoute';
import { isFootballLeague } from '@/src/lib/football';

export default async function FootballLeaguePage({ params }) {
  const { league } = await params;

  if (!isFootballLeague(league)) {
    notFound();
  }

  return <FootballLeagueRoute leagueKey={league} />;
}
