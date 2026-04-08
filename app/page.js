import SportHubPage from '@/src/components/SportHubPage';
import { getHubHero, HUB_HERO_SNAPSHOT_KEY } from '@/src/lib/hub';
import { getStoredSnapshot } from '@/src/lib/snapshot-store';

export const revalidate = 60;

function hasRenderableHero(hero) {
  return Boolean(
    hero &&
    (
      (Array.isArray(hero?.heroStories) && hero.heroStories.length) ||
      (Array.isArray(hero?.worldBoard?.players) && hero.worldBoard.players.length) ||
      (Array.isArray(hero?.betLegs) && hero.betLegs.length)
    )
  );
}

export default async function HomePage() {
  let initialHero = null;
  try {
    initialHero = await getStoredSnapshot(HUB_HERO_SNAPSHOT_KEY);
    if (!hasRenderableHero(initialHero)) {
      initialHero = await getHubHero();
    }
  } catch (_error) {
    try {
      initialHero = await getHubHero();
    } catch (_innerError) {
      initialHero = null;
    }
  }
  return <SportHubPage initialHero={initialHero} />;
}
