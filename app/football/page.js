import FootballLandingRoute from '@/src/components/FootballLandingRoute';
import {
  FOOTBALL_LANDING_SNAPSHOT_KEY,
  getFootballLandingSnapshot,
} from '@/src/lib/live-sports-backend';
import { getStoredSnapshot } from '@/src/lib/snapshot-store';

function hasRenderableLanding(data) {
  return Boolean(
    data &&
    Array.isArray(data?.leagues) &&
    data.leagues.length &&
    (
      (Array.isArray(data?.topPlayers) && data.topPlayers.length) ||
      (Array.isArray(data?.topMatches) && data.topMatches.length)
    ),
  );
}

export default async function FootballPage() {
  let initialData = null;

  try {
    initialData = await getStoredSnapshot(FOOTBALL_LANDING_SNAPSHOT_KEY);
  } catch (_error) {
    initialData = null;
  }

  if (!hasRenderableLanding(initialData)) {
    try {
      initialData = await getFootballLandingSnapshot();
    } catch (_error) {
      initialData = initialData || null;
    }
  }

  return <FootballLandingRoute initialData={initialData} />;
}
