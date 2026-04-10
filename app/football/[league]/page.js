import { notFound } from 'next/navigation';
import FootballLeagueRoute from '@/src/components/FootballLeagueRoute';
import { isFootballLeague } from '@/src/lib/football';
import {
  getFootballLeagueSnapshot,
  getFootballLeagueSnapshotKey,
} from '@/src/lib/live-sports-backend';
import { getStoredSnapshot } from '@/src/lib/snapshot-store';

function hasRenderableBootstrap(data) {
  return Boolean(
    data &&
    Array.isArray(data?.rankings) &&
    data.rankings.length &&
    (
      (Array.isArray(data?.featuredPlayers) && data.featuredPlayers.length) ||
      (Array.isArray(data?.playersCatalog?.players) && data.playersCatalog.players.length) ||
      (Array.isArray(data?.scoreboard) && data.scoreboard.length) ||
      (Array.isArray(data?.news) && data.news.length)
    ),
  );
}

export default async function FootballLeaguePage({ params, searchParams }) {
  const { league } = await params;
  const query = await searchParams;

  if (!isFootballLeague(league)) {
    notFound();
  }

  let initialBootstrap = null;
  try {
    initialBootstrap = await getStoredSnapshot(getFootballLeagueSnapshotKey(league));
  } catch (_error) {
    initialBootstrap = null;
  }

  if (!hasRenderableBootstrap(initialBootstrap)) {
    try {
      initialBootstrap = await getFootballLeagueSnapshot(league);
    } catch (_error) {
      initialBootstrap = initialBootstrap || null;
    }
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
