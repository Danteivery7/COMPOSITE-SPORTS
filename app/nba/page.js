import SportFrameRoute from '@/src/components/SportFrameRoute';

export default async function NBAPage({ searchParams }) {
  const query = await searchParams;
  return (
    <SportFrameRoute
      sportKey="nba"
      frameSrc="/vendor/nba/index.html"
      deepLink={{
        id: query?.id || null,
        view: query?.view || null,
        fromHub: query?.from === 'hub',
      }}
    />
  );
}
