import GenericSportRoute from '@/src/components/GenericSportRoute';

export default async function NFLPage({ searchParams }) {
  const query = await searchParams;
  const initialEntry = {
    playerId: query?.player || null,
    fromHub: query?.from === 'hub',
  };
  return <GenericSportRoute sportKey="nfl" initialEntry={initialEntry} />;
}
