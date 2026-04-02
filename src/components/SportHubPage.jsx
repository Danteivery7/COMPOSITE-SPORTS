import Link from 'next/link';
import { getSportCards, SPORT_CONFIGS } from '@/src/data/sports';

export default function SportHubPage() {
  const cards = getSportCards();

  return (
    <main className="hub-page">
      <div className="hub-aurora aurora-a" aria-hidden="true" />
      <div className="hub-aurora aurora-b" aria-hidden="true" />
      <section className="hub-hero">
        <p className="eyebrow">Composite Tracking Suite</p>
        <h1>{SPORT_CONFIGS.hub.title}</h1>
        <p>{SPORT_CONFIGS.hub.subtitle}</p>
      </section>

      <section className="hub-grid">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.path}
            className="hub-card"
            style={{
              '--card-accent': card.accent,
              '--card-accent-alt': card.accentAlt,
              '--card-surface': card.surface,
            }}
          >
            <div className="hub-card-surface" />
            <p className="eyebrow">{card.label}</p>
            <h2>{card.name}</h2>
            <p>{card.cardBlurb}</p>
            <span className="hub-card-cta">Open {card.label}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
