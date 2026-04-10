import SportHubPage from '@/src/components/SportHubPage';
import { getHubHero, HUB_HERO_SNAPSHOT_KEY } from '@/src/lib/hub';
import { getStoredSnapshot } from '@/src/lib/snapshot-store';

export const revalidate = 60;

const EXPECTED_WORLD_TOP_FIVE = [
  'shohei ohtani',
  'nikola jokic',
  'connor mcdavid',
  'erling haaland',
  'shai gilgeous alexander',
];

function normalizePlayerName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasExpectedWorldTopFive(hero) {
  const players = hero?.worldBoard?.players || [];
  if (players.length < EXPECTED_WORLD_TOP_FIVE.length) return false;
  return EXPECTED_WORLD_TOP_FIVE.every((expected, index) =>
    normalizePlayerName(players[index]?.displayName).includes(expected),
  );
}

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
    if (!hasRenderableHero(initialHero) || !hasExpectedWorldTopFive(initialHero)) {
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
