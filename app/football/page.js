import FootballLandingRoute from '@/src/components/FootballLandingRoute';
import { getFootballLandingSnapshot } from '@/src/lib/live-sports-backend';

export default async function FootballPage() {
  let initialData = null;

  try {
    initialData = await getFootballLandingSnapshot();
  } catch (_error) {
    initialData = null;
  }

  return <FootballLandingRoute initialData={initialData} />;
}
