import { getHubHero } from '@/src/lib/hub';
import SportHubPage from '@/src/components/SportHubPage';

export const revalidate = 60;

export default async function HomePage() {
  let initialHero = null;
  try {
    initialHero = await getHubHero();
  } catch (_error) {
    initialHero = null;
  }
  return <SportHubPage initialHero={initialHero} />;
}
