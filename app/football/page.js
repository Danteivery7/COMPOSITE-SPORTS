import FootballLandingRoute from '@/src/components/FootballLandingRoute';
import { FOOTBALL_LANDING_SNAPSHOT_KEY } from '@/src/lib/live-sports-backend';
import { getStoredSnapshot } from '@/src/lib/snapshot-store';

export default async function FootballPage() {
  let initialData = null;

  try {
    initialData = await getStoredSnapshot(FOOTBALL_LANDING_SNAPSHOT_KEY);
  } catch (_error) {
    initialData = null;
  }

  return <FootballLandingRoute initialData={initialData} />;
}
