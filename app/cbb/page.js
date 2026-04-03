import CBBRoute from '@/src/components/CBBRoute';

export default async function CBBPage({ searchParams }) {
  const query = await searchParams;
  const initialEntry = {
    playerId: query?.player || null,
    fromHub: query?.from === 'hub',
  };
  return <CBBRoute initialEntry={initialEntry} />;
}
