import NFLRoute from '@/src/components/NFLRoute';
import { getSportSnapshotKey } from '@/src/lib/live-sports-backend';
import { getStoredSnapshot } from '@/src/lib/snapshot-store';

export default async function NFLPage({ searchParams }) {
  const query = await searchParams;
  let initialBootstrap = null;

  try {
    initialBootstrap = await getStoredSnapshot(getSportSnapshotKey('nfl'));
  } catch (_error) {
    initialBootstrap = null;
  }

  const initialEntry = {
    playerId: query?.player || null,
    fromHub: query?.from === 'hub',
  };
  return <NFLRoute initialEntry={initialEntry} initialBootstrap={initialBootstrap} />;
}
