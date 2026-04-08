import MLBRoute from '@/src/components/MLBRoute';
import { buildMLBBootstrapSnapshot } from '@/src/mlb/lib/bootstrap';

export const dynamic = 'force-dynamic';

export default async function MLBPage({ searchParams }) {
  const query = await searchParams;
  let initialRoutes = null;
  try {
    initialRoutes = await buildMLBBootstrapSnapshot();
  } catch (_error) {
    initialRoutes = null;
  }
  const initialEntry = {
    playerId: query?.player || null,
    fromHub: query?.from === 'hub',
  };
  return <MLBRoute initialEntry={initialEntry} initialRoutes={initialRoutes} />;
}
