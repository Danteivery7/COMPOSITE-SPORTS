import SportHubPage from '@/src/components/SportHubPage';
import { HUB_HERO_SNAPSHOT_KEY } from '@/src/lib/hub';
import { getStoredSnapshot } from '@/src/lib/snapshot-store';

export const revalidate = 60;

export default async function HomePage() {
  let initialHero = null;
  try {
    initialHero = await getStoredSnapshot(HUB_HERO_SNAPSHOT_KEY);
  } catch (_error) {
    initialHero = null;
  }
  return <SportHubPage initialHero={initialHero} />;
}
