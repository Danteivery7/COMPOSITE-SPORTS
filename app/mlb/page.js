import MLBRoute from '@/src/components/MLBRoute';

export default async function MLBPage({ searchParams }) {
  const query = await searchParams;
  const initialEntry = {
    playerId: query?.player || null,
    fromHub: query?.from === 'hub',
  };
  return <MLBRoute initialEntry={initialEntry} />;
}
