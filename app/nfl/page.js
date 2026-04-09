import NFLRoute from '@/src/components/NFLRoute';
import { getNFLSnapshot } from '@/src/lib/live-sports-backend';

export default async function NFLPage({ searchParams }) {
  const query = await searchParams;
  let initialBootstrap = null;

  try {
    initialBootstrap = await getNFLSnapshot();
  } catch (_error) {
    initialBootstrap = null;
  }

  const initialEntry = {
    playerId: query?.player || null,
    fromHub: query?.from === 'hub',
  };
  return <NFLRoute initialEntry={initialEntry} initialBootstrap={initialBootstrap} />;
}
