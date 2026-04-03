import GenericSportRoute from '@/src/components/GenericSportRoute';

export default async function CBBPage({ searchParams }) {
  const query = await searchParams;
  const initialEntry = {
    playerId: query?.player || null,
    fromHub: query?.from === 'hub',
  };
  return <GenericSportRoute sportKey="cbb" initialEntry={initialEntry} />;
}
