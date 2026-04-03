import SportFrameRoute from '@/src/components/SportFrameRoute';

export default async function NHLPage({ searchParams }) {
  const query = await searchParams;
  return (
    <SportFrameRoute
      sportKey="nhl"
      frameSrc="/vendor/nhl/index.html"
      deepLink={{
        id: query?.id || null,
        view: query?.view || null,
        fromHub: query?.from === 'hub',
      }}
    />
  );
}
