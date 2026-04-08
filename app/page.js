import SportHubPage from '@/src/components/SportHubPage';

export const revalidate = 60;

export default function HomePage() {
  return <SportHubPage initialHero={null} />;
}
