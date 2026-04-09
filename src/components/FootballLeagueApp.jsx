'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import StoryDetailCard from '@/src/components/StoryDetailCard';
import RouteThemeToggle from '@/src/components/RouteThemeToggle';
import { getFootballLeagueConfig } from '@/src/lib/football';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'scores', label: 'Scores' },
  { key: 'rankings', label: 'Rankings' },
  { key: 'teams', label: 'Clubs' },
  { key: 'players', label: 'Players' },
  { key: 'predictor', label: 'Predictor' },
  { key: 'news', label: 'News' },
  { key: 'settings', label: 'Settings' },
];

function getFootballEntityCopy(leagueKey) {
  const isInternational = leagueKey === 'international-play';
  return {
    singular: isInternational ? 'National Side' : 'Club',
    plural: isInternational ? 'National Sides' : 'Clubs',
    singularLower: isInternational ? 'national side' : 'club',
    pluralLower: isInternational ? 'national sides' : 'clubs',
    identityLabel: isInternational ? 'National Side Identity' : 'Club Identity',
    newsLabel: isInternational ? 'National Side News' : 'Club News',
  };
}

function recordParts(record) {
  const match = String(record || '').match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
  if (!match) return null;
  return [
    { label: 'W', value: match[1] },
    { label: 'D', value: match[2] },
    { label: 'L', value: match[3] },
  ];
}

function FootballRecordLine({ record, fallback }) {
  const parts = recordParts(record);
  if (!parts) return <span>{fallback || record || 'Record TBD'}</span>;
  return (
    <span className="football-record-inline">
      {parts.map((part) => (
        <span className="football-record-chip" key={part.label}>
          <strong>{part.label}</strong>
          <span>{part.value}</span>
        </span>
      ))}
    </span>
  );
}

function TeamLogo({ team }) {
  if (!team?.logo) {
    return <span className="football-logo-fallback">{team?.abbreviation?.slice(0, 3) || 'CLB'}</span>;
  }
  return <img src={team.logo} alt={team.displayName || team.abbreviation} className="football-team-logo" />;
}

function applyFootballHeadshotFallback(event) {
  const { currentTarget } = event;
  const fallbackSrc = currentTarget.dataset.fallbackSrc;
  if (fallbackSrc && currentTarget.dataset.fallbackApplied !== 'primary') {
    currentTarget.dataset.fallbackApplied = 'primary';
    currentTarget.src = fallbackSrc;
    return;
  }
  if (currentTarget.dataset.fallbackApplied === 'final') return;
  currentTarget.dataset.fallbackApplied = 'final';
  currentTarget.src = 'https://a.espncdn.com/i/headshots/nophoto.png';
}

function PlayerVisual({ player }) {
  if (!player?.headshot) {
    return <span className="football-logo-fallback">{player?.displayName?.slice(0, 2)?.toUpperCase() || 'PL'}</span>;
  }
  return (
    <img
      src={player.headshot}
      alt={player.displayName}
      className="football-player-headshot"
      data-fallback-src={`https://a.espncdn.com/i/headshots/soccer/players/full/${player.id}.png`}
      onError={applyFootballHeadshotFallback}
    />
  );
}

function GameCard({ game, onOpen }) {
  return (
    <button className={`football-panel football-game-card ${['live', 'in'].includes(game?.state) ? 'is-live' : ''}`} type="button" onClick={() => onOpen(game.id)}>
      <div className="football-card-head">
        <span className={`football-status-pill is-${game.state}`}>{game.statusLabel}</span>
        <span>{game.broadcast || game.startLabel || 'ESPN'}</span>
      </div>
      <div className="football-team-stack">
        {[game.away, game.home].map((team) => (
          <div className="football-team-row" key={`${game.id}-${team?.teamId}`}>
            <div className="football-team-copy">
              <TeamLogo team={team} />
              <div>
                <strong>{team?.displayName || team?.abbreviation}</strong>
                <FootballRecordLine record={team?.record} fallback={team?.abbreviation} />
              </div>
            </div>
            <strong className="football-score-number">{team?.score ?? '-'}</strong>
          </div>
        ))}
      </div>
    </button>
  );
}

function FootballOverview({ bootstrap, entityCopy, openGame, openTeam, openPlayer, openStory, setPage }) {
  const leadMatch = bootstrap.scoreboard?.[0];
  const topTeam = bootstrap.rankings?.[0];
  const topPlayer = bootstrap.featuredPlayers?.[0];
  const leadNews = bootstrap.news?.[0];
  const bestEdge = bootstrap.predictors?.[0];

  return (
    <section className="football-overview-shell">
      <article className="football-panel football-hero-panel football-broadcast-panel">
        <div className="football-hero-copy">
          <p className="eyebrow">{bootstrap.league?.region || 'Football Night'}</p>
          <h2>{bootstrap.league?.label}</h2>
          <p>{bootstrap.headline}</p>
          <div className="football-chip-row">
            <span className="football-chip">{bootstrap.meta?.liveGames || 0} live matches</span>
            <span className="football-chip">{bootstrap.rankings?.length || 0} {entityCopy.pluralLower} tracked</span>
            <span className="football-chip">{bootstrap.featuredPlayers?.length || 0} featured players</span>
          </div>
          <div className="football-hero-mini-board">
            {(bootstrap.scoreboard || []).slice(0, 3).map((game) => (
              <button className={`football-mini-match ${['live', 'in'].includes(game.state) ? 'is-live' : ''}`} key={game.id} type="button" onClick={() => openGame(game.id)}>
                <span>{game.away.abbreviation} vs {game.home.abbreviation}</span>
                <strong>{game.statusLabel}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="football-hero-side">
          {leadMatch ? (
            <button className="football-side-card" type="button" onClick={() => openGame(leadMatch.id)}>
              <span className="football-side-label">Featured Match</span>
              <strong>{leadMatch.away.abbreviation} at {leadMatch.home.abbreviation}</strong>
              <p>{leadMatch.statusLabel} • {leadMatch.startLabel}</p>
            </button>
          ) : null}
          {bestEdge ? (
            <button className="football-side-card" type="button" onClick={() => setPage('predictor')}>
              <span className="football-side-label">Best Edge</span>
              <strong>{bestEdge.home.abbreviation} {bestEdge.homeWinProbability}%</strong>
              <p>{bestEdge.projectedAwayScore} - {bestEdge.projectedHomeScore} • {bestEdge.confidence}</p>
            </button>
          ) : null}
        </div>
      </article>

      <div className="football-overview-grid">
        <article className="football-panel">
          <div className="football-section-head">
            <h3>League Pulse</h3>
            <button type="button" onClick={() => setPage('scores')}>All scores</button>
          </div>
          <div className="football-list">
            {(bootstrap.scoreboard || []).slice(0, 4).map((game) => (
              <button className="football-row-button" key={game.id} type="button" onClick={() => openGame(game.id)}>
                <div>
                  <strong>{game.away.abbreviation} at {game.home.abbreviation}</strong>
                  <span>{game.statusLabel}</span>
                </div>
                <span>{game.away.score} - {game.home.score}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="football-panel">
          <div className="football-section-head">
            <h3>Top {entityCopy.singular}</h3>
            <button type="button" onClick={() => topTeam && openTeam(topTeam.id)}>Open</button>
          </div>
          {topTeam ? (
            <button className="football-top-club" type="button" onClick={() => openTeam(topTeam.id)}>
              <TeamLogo team={topTeam} />
              <div>
                <strong>{topTeam.displayName}</strong>
                <span>#{topTeam.ovrRank} OVR</span>
                <FootballRecordLine record={topTeam.record} fallback={topTeam.abbreviation} />
                <p>{topTeam.clubPoints ?? topTeam.standingPoints ?? 0} pts • {topTeam.recentFormLabel || 'Recent pending'}</p>
              </div>
            </button>
          ) : (
            <p className="football-empty-copy">{`Top ${entityCopy.singularLower} is still syncing.`}</p>
          )}
        </article>

        <article className="football-panel">
          <div className="football-section-head">
            <h3>Top Player</h3>
            <button type="button" onClick={() => topPlayer && openPlayer(topPlayer.id)}>Open</button>
          </div>
          {topPlayer ? (
            <button className="football-top-player" type="button" onClick={() => openPlayer(topPlayer.id)}>
              <PlayerVisual player={topPlayer} />
              <div>
                <strong>{topPlayer.displayName}</strong>
                <span>{topPlayer.positionLabel || topPlayer.position} • {topPlayer.team?.abbreviation || bootstrap.league?.shortLabel}</span>
                <p>{topPlayer.rating} OVR • {topPlayer.leaderSummary}</p>
              </div>
            </button>
          ) : (
            <p className="football-empty-copy">Top player is still syncing.</p>
          )}
        </article>
      </div>

      <div className="football-overview-lower">
        <article className="football-panel football-panel-wide">
          <div className="football-section-head">
            <h3>Top {entityCopy.plural}</h3>
            <button type="button" onClick={() => setPage('rankings')}>League table</button>
          </div>
          <div className="football-rank-list">
            {(bootstrap.rankings || []).slice(0, 6).map((team) => (
              <button className="football-row-button" key={team.id} type="button" onClick={() => openTeam(team.id)}>
                <div className="football-row-team">
                  <TeamLogo team={team} />
                  <div>
                    <strong>#{team.ovrRank} {team.displayName}</strong>
                    <FootballRecordLine record={team.record} fallback={team.abbreviation} />
                    <span>{team.clubPoints ?? team.standingPoints ?? 0} pts • {team.recentFormLabel || 'Recent pending'}</span>
                  </div>
                </div>
                <span>{team.ovrScore}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="football-panel">
          <div className="football-section-head">
            <h3>Trending News</h3>
            <button type="button" onClick={() => setPage('news')}>All news</button>
          </div>
          {leadNews ? (
            <button className="football-news-feature" type="button" onClick={() => openStory(leadNews, 'overview')}>
              {leadNews.image ? <img src={leadNews.image} alt={leadNews.headline} className="football-news-image" /> : null}
              <div>
                <strong>{leadNews.headline}</strong>
                <p>{leadNews.description || 'Open story'}</p>
              </div>
            </button>
          ) : (
            <p className="football-empty-copy">News is syncing.</p>
          )}
        </article>
      </div>
    </section>
  );
}

function RankingsView({ rankings, entityCopy, openTeam }) {
  return (
    <div className="football-table-wrap">
      <table className="football-table">
        <thead>
          <tr>
            <th>RK</th>
            <th>{entityCopy.singular}</th>
            <th>PTS</th>
            <th>OVR</th>
            <th>OFF</th>
            <th>DEF</th>
            <th>Record</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((team) => (
            <tr key={team.id} onClick={() => openTeam(team.id)}>
              <td>{team.ovrRank}</td>
              <td>
                <div className="football-row-team">
                  <TeamLogo team={team} />
                  <div>
                    <strong>{team.displayName}</strong>
                    <FootballRecordLine record={team.record} fallback={team.abbreviation} />
                    <span>{team.recentFormLabel || 'Recent pending'}</span>
                  </div>
                </div>
              </td>
              <td>{team.clubPoints ?? team.standingPoints ?? 0}</td>
              <td>{team.ovrScore}</td>
              <td>{team.offScore}</td>
              <td>{team.defScore}</td>
              <td><FootballRecordLine record={team.record} fallback={team.abbreviation} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamsView({ teams, openTeam }) {
  return (
    <div className="football-card-grid">
      {teams.map((team) => (
        <button className="football-panel football-team-card" key={team.id} type="button" onClick={() => openTeam(team.id)}>
          <div className="football-row-team">
            <TeamLogo team={team} />
            <div>
              <h3>{team.displayName}</h3>
              <FootballRecordLine record={team.record} fallback={team.abbreviation} />
            </div>
          </div>
          <div className="football-chip-row">
            <span className="football-chip">#{team.ovrRank} OVR</span>
            <span className="football-chip">{team.clubPoints ?? team.standingPoints ?? 0} pts</span>
            <span className="football-chip">{team.recentFormLabel || 'Recent pending'}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function PlayersView({ entityCopy, players, query, setQuery, loading, openPlayer }) {
  return (
    <section className="football-stack">
      <div className="football-toolbar">
        <input
          className="football-search"
          type="search"
          placeholder="Search all players"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span>{loading ? 'Syncing player board...' : `${players.length} players`}</span>
      </div>

      <div className="football-table-wrap">
        <table className="football-table">
          <thead>
            <tr>
              <th>RK</th>
              <th>Player</th>
              <th>{entityCopy.singular}</th>
              <th>POS</th>
              <th>OVR</th>
              <th>Tier</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id} onClick={() => openPlayer(player.id)}>
                <td>{player.rank}</td>
                <td>
                  <div className="football-player-cell">
                    <PlayerVisual player={player} />
                    <div>
                      <strong>{player.displayName}</strong>
                      <span>{player.leaderSummary || `${player.team?.abbreviation} board`}</span>
                    </div>
                  </div>
                </td>
                <td>{player.team?.abbreviation || '-'}</td>
                <td>{player.positionLabel || player.position || '-'}</td>
                <td>{player.rating}</td>
                <td>{player.tier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PredictorView({
  entityCopy,
  predictors,
  teams,
  selectedHomeTeamId,
  selectedAwayTeamId,
  setSelectedHomeTeamId,
  setSelectedAwayTeamId,
  customPredictor,
  predictorLoading,
}) {
  const activePredictors = customPredictor?.length ? customPredictor : predictors;

  return (
    <div className="football-stack">
      <article className="football-panel">
        <div className="football-section-head">
          <h3>Build Any {entityCopy.singular} Matchup</h3>
          <span>{predictorLoading ? 'Updating live…' : `Pick any two ${entityCopy.pluralLower}`}</span>
        </div>
        <div className="football-predictor-builder">
          <select className="football-search" value={selectedAwayTeamId} onChange={(event) => setSelectedAwayTeamId(event.target.value)}>
            <option value="">{`Select away ${entityCopy.singularLower}`}</option>
            {teams.map((team) => (
              <option key={`away-${team.id}`} value={team.id}>{team.displayName}</option>
            ))}
          </select>
          <select className="football-search" value={selectedHomeTeamId} onChange={(event) => setSelectedHomeTeamId(event.target.value)}>
            <option value="">{`Select home ${entityCopy.singularLower}`}</option>
            {teams.map((team) => (
              <option key={`home-${team.id}`} value={team.id}>{team.displayName}</option>
            ))}
          </select>
        </div>
      </article>

      <div className="football-card-grid">
      {activePredictors.map((game) => (
        <article className="football-panel football-predictor-card" key={game.gameId}>
          <div className="football-card-head">
            <span>{game.away.abbreviation} at {game.home.abbreviation}</span>
            <strong>{game.confidence}</strong>
          </div>
          <div className="football-prob-bar">
            <div className="football-prob-fill" style={{ width: `${game.homeWinProbability}%` }} />
          </div>
          <div className="football-chip-row">
            <span className="football-chip">{game.home.abbreviation} {game.homeWinProbability}%</span>
            <span className="football-chip">Proj {game.projectedAwayScore}-{game.projectedHomeScore}</span>
            <span className="football-chip">{game.winner}</span>
            <span className="football-chip">{game.bettingLean || 'Model edge'}</span>
            {game.americanOdds != null ? <span className="football-chip">{game.americanOdds > 0 ? '+' : ''}{game.americanOdds}</span> : null}
          </div>
          {game.reasons?.length ? (
            <div className="football-chip-row">
              {game.reasons.map((reason) => <span className="football-chip" key={reason}>{reason}</span>)}
            </div>
          ) : null}
        </article>
      ))}
      </div>
    </div>
  );
}

function NewsView({ news, openStory }) {
  return (
    <div className="football-card-grid">
      {news.map((story) => (
        <button className="football-panel football-news-card" key={story.id} type="button" onClick={() => openStory(story, 'news')}>
          {story.image ? <img src={story.image} alt={story.headline} className="football-news-image" /> : null}
          <div>
            <strong>{story.headline}</strong>
            <p>{story.description || 'Open story'}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function StoryDetailView({ story, onBack, onOpenRelated }) {
  return (
    <StoryDetailCard
      story={story}
      onBack={onBack}
      backLabel={story?.previousPage === 'team-detail' ? 'Back to page' : 'Back to news'}
      onOpenRelated={onOpenRelated}
    />
  );
}

function TeamDetailView({ detail, entityCopy, openPlayer, openStory, setPage }) {
  return (
    <section className="football-stack">
      <button className="football-back-button" type="button" onClick={() => setPage('teams')}>
        {`Back to ${entityCopy.pluralLower}`}
      </button>
      <article className="football-panel football-detail-hero">
        <div className="football-row-team">
          <TeamLogo team={detail.team} />
          <div>
            <p className="eyebrow">{entityCopy.identityLabel}</p>
            <h2>{detail.team.displayName}</h2>
            <p>#{detail.team.ovrRank} OVR</p>
            <FootballRecordLine record={detail.team.record} fallback={detail.team.abbreviation} />
          </div>
        </div>
        <div className="football-chip-row">
          <span className="football-chip">{detail.team.clubPoints ?? detail.team.standingPoints ?? 0} pts</span>
          <span className="football-chip">OFF {detail.team.offScore}</span>
          <span className="football-chip">DEF {detail.team.defScore}</span>
          <span className="football-chip">{detail.team.recentFormLabel || 'Recent pending'}</span>
        </div>
      </article>

      <div className="football-overview-lower">
        <article className="football-panel football-panel-wide">
          <div className="football-section-head">
            <h3>Key Players</h3>
          </div>
          <div className="football-rank-list">
            {detail.roster.slice(0, 16).map((player) => (
              <button className="football-row-button" type="button" key={player.id} onClick={() => openPlayer(player.id)}>
                <div className="football-player-cell">
                  <PlayerVisual player={player} />
                  <div>
                    <strong>{player.displayName}</strong>
                    <span>{player.positionLabel || player.position} • {player.tier}</span>
                  </div>
                </div>
                <span>{player.rating}</span>
              </button>
            ))}
          </div>
        </article>
        <article className="football-panel">
          <div className="football-section-head">
            <h3>Recent Results</h3>
          </div>
          <div className="football-list">
            {(detail.recent || []).map((note, index) => (
              <div className="football-row-button is-static" key={`${note}-${index}`}>
                <div>
                  <strong>{note}</strong>
                  <span>{detail.team.displayName}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="football-panel">
          <div className="football-section-head">
            <h3>{entityCopy.newsLabel}</h3>
          </div>
          <div className="football-list">
            {(detail.clubNews || []).map((story) => (
              <button className="football-row-button" type="button" key={story.storyId || story.id} onClick={() => openStory(story, 'team-detail')}>
                <div>
                  <strong>{story.headline}</strong>
                  <span>{story.description || `Latest ${entityCopy.singularLower} coverage`}</span>
                </div>
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function PlayerDetailView({ detail, setPage, onBack }) {
  return (
    <section className="football-stack">
      <button className="football-back-button" type="button" onClick={onBack || (() => setPage('players'))}>
        Back to players
      </button>
      <article className="football-panel football-detail-hero">
        <div className="football-player-cell">
          <PlayerVisual player={detail.player} />
          <div>
            <p className="eyebrow">Match Influence</p>
            <h2>{detail.player.displayName}</h2>
            <p>{detail.player.team?.displayName} • {detail.player.positionLabel || detail.player.position}</p>
          </div>
        </div>
        <div className="football-chip-row">
          <span className="football-chip">{detail.player.rating} OVR</span>
          <span className="football-chip">{detail.player.tier}</span>
          <span className="football-chip">{detail.resolvedPosition}</span>
        </div>
        <p className="football-detail-copy">{detail.analysis}</p>
      </article>
      {(detail.statSections || []).map((section) => (
        <article className="football-panel" key={section.title}>
          <div className="football-section-head">
            <h3>{section.title}</h3>
          </div>
          <div className="football-list">
            {(section.stats || []).map((stat) => (
              <div className="football-row-button is-static" key={`${section.title}-${stat.label}`}>
                <div>
                  <strong>{stat.label}</strong>
                  <span>{stat.group || detail.player.positionLabel || detail.player.position}</span>
                </div>
                <span>{stat.value}</span>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function GameDetailView({ detail, predictors, setPage }) {
  const predictor = predictors.find((entry) => entry.gameId === detail.game.id);
  return (
    <section className="football-stack">
      <button className="football-back-button" type="button" onClick={() => setPage('scores')}>
        Back to scores
      </button>
      <article className="football-panel football-detail-hero">
        <div className="football-detail-matchup">
          <div className="football-row-team">
            <TeamLogo team={detail.game.away} />
            <div>
              <strong>{detail.game.away.displayName}</strong>
              <FootballRecordLine record={detail.game.away.record} fallback={detail.game.away.abbreviation} />
            </div>
          </div>
          <div className="football-detail-center">
            <span className={`football-status-pill is-${detail.game.state}`}>{detail.game.statusLabel}</span>
            <strong>{detail.game.away.score} - {detail.game.home.score}</strong>
          </div>
          <div className="football-row-team">
            <TeamLogo team={detail.game.home} />
            <div>
              <strong>{detail.game.home.displayName}</strong>
              <FootballRecordLine record={detail.game.home.record} fallback={detail.game.home.abbreviation} />
            </div>
          </div>
        </div>
        <div className="football-chip-row">
          {detail.venue ? <span className="football-chip">{detail.venue}</span> : null}
          {detail.location ? <span className="football-chip">{detail.location}</span> : null}
          {detail.broadcast ? <span className="football-chip">{detail.broadcast}</span> : null}
          {predictor ? <span className="football-chip">Proj {predictor.projectedAwayScore}-{predictor.projectedHomeScore}</span> : null}
        </div>
        <p className="football-detail-copy">{detail.summary}</p>
      </article>
      <div className="football-overview-lower">
        <article className="football-panel football-panel-wide">
          <div className="football-section-head">
            <h3>Key Moments</h3>
          </div>
          <div className="football-list football-scroll-list">
            {(detail.keyMoments?.length ? detail.keyMoments : detail.notes || []).map((note, index) => (
              <div className="football-row-button is-static" key={`${note}-${index}`}>
                <div>
                  <strong>{note.minute || 'Moment'}</strong>
                  <span>{note.text || note}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="football-panel">
          <div className="football-section-head">
            <h3>Prediction</h3>
          </div>
          {predictor ? (
            <div className="football-list">
              <div className="football-row-button is-static">
                <div>
                  <strong>{predictor.bettingLean || 'Model edge'}</strong>
                  <span>{predictor.home.abbreviation} {predictor.homeWinProbability}% • {predictor.away.abbreviation} {predictor.awayWinProbability}%</span>
                </div>
              </div>
              <div className="football-row-button is-static">
                <div>
                  <strong>Projected Score</strong>
                  <span>{predictor.projectedAwayScore}-{predictor.projectedHomeScore} • Total {predictor.projectedTotal}</span>
                </div>
              </div>
              {predictor.odds ? (
                <div className="football-row-button is-static">
                  <div>
                    <strong>{predictor.odds.provider || 'Market Context'}</strong>
                    <span>
                      {predictor.americanOdds != null ? `ML ${predictor.americanOdds > 0 ? '+' : ''}${predictor.americanOdds}` : 'No ML'}
                      {predictor.odds.overUnder ? ` • O/U ${predictor.odds.overUnder}` : ''}
                    </span>
                  </div>
                </div>
              ) : null}
              {(predictor.explanation || []).slice(0, 2).map((note, index) => (
                <div className="football-row-button is-static" key={`${note}-${index}`}>
                  <div>
                    <strong>Why</strong>
                    <span>{note}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="football-empty-copy">Predictor card is still syncing.</p>
          )}
        </article>
        <article className="football-panel">
          <div className="football-section-head">
            <h3>Man of the Match</h3>
          </div>
          <div className="football-row-button is-static">
            <div className="football-player-cell">
              <PlayerVisual player={detail.manOfTheMatch} />
              <div>
                <strong>{detail.manOfTheMatch?.displayName || 'Pending'}</strong>
                <span>{detail.manOfTheMatch?.note || 'Match-defining performance'}</span>
              </div>
            </div>
          </div>
        </article>
        <article className="football-panel football-panel-wide">
          <div className="football-section-head">
            <h3>Box Score</h3>
          </div>
          <div className="football-list football-scroll-list">
            {(detail.boxScore || []).map((row, index) => (
              <div className="football-row-button is-static" key={`${row.team}-${row.label}-${index}`}>
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.team}</span>
                </div>
                <span>{row.value}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

export default function FootballLeagueApp({ leagueKey, initialEntry = null, theme = 'dark', toggleTheme = () => {} }) {
  const leagueConfig = getFootballLeagueConfig(leagueKey);
  const entityCopy = getFootballEntityCopy(leagueKey);
  const apiBase = `/api/football/${leagueKey}`;
  const [page, setPage] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bootstrap, setBootstrap] = useState(null);
  const [playersData, setPlayersData] = useState(null);
  const [teamDetail, setTeamDetail] = useState(null);
  const [playerDetail, setPlayerDetail] = useState(null);
  const [gameDetail, setGameDetail] = useState(null);
  const [storyDetail, setStoryDetail] = useState(null);
  const [playersQuery, setPlayersQuery] = useState('');
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [hubOriginPlayer, setHubOriginPlayer] = useState(false);
  const [selectedHomeTeamId, setSelectedHomeTeamId] = useState('');
  const [selectedAwayTeamId, setSelectedAwayTeamId] = useState('');
  const [customPredictor, setCustomPredictor] = useState([]);
  const [predictorLoading, setPredictorLoading] = useState(false);
  const initialEntryHandledRef = useRef(false);

  async function fetchBootstrap() {
    let response = null;
    try {
      response = await fetch(`${apiBase}/bootstrap`, { cache: 'no-store' });
      let data = await response.json();
      const invalidBoard =
        !response.ok ||
        !Array.isArray(data?.rankings) ||
        !data.rankings.length ||
        !Array.isArray(data?.playersCatalog?.players) ||
        !data.playersCatalog.players.length;

      if (invalidBoard) {
        response = await fetch(`${apiBase}/bootstrap?force=1`, { cache: 'no-store' });
        data = await response.json();
      }

      setBootstrap(data);
    } finally {
      setLoadingBootstrap(false);
    }
  }

  useEffect(() => {
    fetchBootstrap();
    const timer = setInterval(fetchBootstrap, 45_000);
    return () => clearInterval(timer);
  }, [apiBase]);

  useEffect(() => {
    if (page !== 'players') return;
    if (!playersQuery.trim() && bootstrap?.playersCatalog) {
      setPlayersData(bootstrap.playersCatalog);
      setLoadingPlayers(false);
      return;
    }
    let ignore = false;

    async function fetchPlayers() {
      setLoadingPlayers(true);
      try {
        const query = playersQuery.trim() ? `?q=${encodeURIComponent(playersQuery.trim())}` : '';
        const response = await fetch(`${apiBase}/players${query}`, { cache: 'no-store' });
        const data = await response.json();
        if (!ignore) setPlayersData(data);
      } finally {
        if (!ignore) setLoadingPlayers(false);
      }
    }

    fetchPlayers();
    return () => {
      ignore = true;
    };
  }, [apiBase, page, playersQuery, bootstrap]);

  useEffect(() => {
    if (page !== 'predictor') return;
    if (!selectedHomeTeamId || !selectedAwayTeamId || selectedHomeTeamId === selectedAwayTeamId) {
      setCustomPredictor([]);
      setPredictorLoading(false);
      return;
    }
    let ignore = false;

    async function fetchCustomPredictor() {
      setPredictorLoading(true);
      try {
        const response = await fetch(
          `${apiBase}/predictor?homeTeamId=${encodeURIComponent(selectedHomeTeamId)}&awayTeamId=${encodeURIComponent(selectedAwayTeamId)}`,
          { cache: 'no-store' },
        );
        const data = await response.json();
        if (!ignore) setCustomPredictor(data.predictors || []);
      } finally {
        if (!ignore) setPredictorLoading(false);
      }
    }

    fetchCustomPredictor();
    return () => {
      ignore = true;
    };
  }, [apiBase, page, selectedHomeTeamId, selectedAwayTeamId]);

  async function openTeam(teamId) {
    const response = await fetch(`${apiBase}/teams/${teamId}`, { cache: 'no-store' });
    const data = await response.json();
    setTeamDetail(data);
    setPage('team-detail');
    setMobileNavOpen(false);
  }

  async function openPlayer(playerId, options = {}) {
    const response = await fetch(`${apiBase}/players/${playerId}`, { cache: 'no-store' });
    const data = await response.json();
    setHubOriginPlayer(Boolean(options.fromHub));
    setPlayerDetail(data);
    setPage('player-detail');
    setMobileNavOpen(false);
  }

  async function openGame(gameId) {
    const response = await fetch(`${apiBase}/games/${gameId}`, { cache: 'no-store' });
    const data = await response.json();
    setGameDetail(data);
    setPage('game-detail');
    setMobileNavOpen(false);
  }

  async function openStory(story, fromPage = 'overview') {
    if (!story?.storyId) return;
    const response = await fetch(`${apiBase}/news/${story.storyId}?apiHref=${encodeURIComponent(story.apiHref || '')}`, { cache: 'no-store' });
    const data = await response.json();
    setStoryDetail({ ...data, previousPage: fromPage });
    setPage('story-detail');
    setMobileNavOpen(false);
  }

  useEffect(() => {
    if (initialEntryHandledRef.current) return;
    if (!initialEntry?.playerId) return;
    if (loadingBootstrap) return;
    initialEntryHandledRef.current = true;
    openPlayer(initialEntry.playerId, { fromHub: Boolean(initialEntry.fromHub) });
  }, [initialEntry, loadingBootstrap]);

  const rankings = useMemo(() => bootstrap?.rankings || [], [bootstrap]);
  const teams = useMemo(() => bootstrap?.teams || [], [bootstrap]);
  const predictors = useMemo(() => bootstrap?.predictors || [], [bootstrap]);
  const news = useMemo(() => bootstrap?.news || [], [bootstrap]);

  function renderPage() {
    if (loadingBootstrap) {
      return (
        <section className="football-loading">
          <p className="eyebrow">{leagueConfig.label} Sync</p>
          <h2>{`Pulling match board, ${entityCopy.singularLower} power, player impact, and stories.`}</h2>
        </section>
      );
    }

    switch (page) {
      case 'scores':
        return <div className="football-card-grid">{(bootstrap?.scoreboard || []).map((game) => <GameCard key={game.id} game={game} onOpen={openGame} />)}</div>;
      case 'rankings':
        return <RankingsView rankings={rankings} entityCopy={entityCopy} openTeam={openTeam} />;
      case 'teams':
        return <TeamsView teams={teams} openTeam={openTeam} />;
      case 'players':
        return <PlayersView entityCopy={entityCopy} players={playersData?.players || []} query={playersQuery} setQuery={setPlayersQuery} loading={loadingPlayers} openPlayer={openPlayer} />;
      case 'predictor':
        return (
          <PredictorView
            entityCopy={entityCopy}
            predictors={predictors}
            teams={teams}
            selectedHomeTeamId={selectedHomeTeamId}
            selectedAwayTeamId={selectedAwayTeamId}
            setSelectedHomeTeamId={setSelectedHomeTeamId}
            setSelectedAwayTeamId={setSelectedAwayTeamId}
            customPredictor={customPredictor}
            predictorLoading={predictorLoading}
          />
        );
      case 'news':
        return <NewsView news={news} openStory={openStory} />;
      case 'settings':
        return (
          <div className="football-card-grid">
            <article className="football-panel">
              <h3>League Profile</h3>
              <p>{leagueConfig.cardBlurb}</p>
            </article>
            <article className="football-panel">
              <h3>Refresh Window</h3>
              <p>Football boards repoll live matches every 45 seconds and reuse cached club crawls for heavier roster work.</p>
            </article>
            <article className="football-panel">
              <h3>Player Formulas</h3>
              <div className="football-list">
                <div className="football-row-button is-static">
                  <div>
                    <strong>GK</strong>
                    <span>0.28 ShotStopping + 0.22 GoalsPrevented + 0.16 SavePct + 0.12 Distribution + 0.10 Claims + 0.06 Sweeping + 0.06 Consistency</span>
                  </div>
                </div>
                <div className="football-row-button is-static">
                  <div>
                    <strong>CB / FB-WB</strong>
                    <span>CB = 0.26 Defending + 0.18 Aerials + 0.16 Interceptions + 0.12 Clearances + 0.14 DuelWinPct + 0.08 Progression + 0.06 Discipline. FB/WB = 0.20 Defending + 0.14 RecoveryPace + 0.16 Crossing + 0.16 ChanceCreation + 0.14 BallProgression + 0.12 WorkRate + 0.08 DuelWinPct.</span>
                  </div>
                </div>
                <div className="football-row-button is-static">
                  <div>
                    <strong>DM/CM</strong>
                    <span>0.20 Passing + 0.20 Progression + 0.18 BallWinning + 0.16 PressResistance + 0.16 Control + 0.10 ChanceCreation</span>
                  </div>
                </div>
                <div className="football-row-button is-static">
                  <div>
                    <strong>AM/W</strong>
                    <span>0.20 Creativity + 0.16 Dribbling + 0.20 ChanceCreation + 0.16 BallProgression + 0.18 GoalsAssists + 0.10 WorkRate</span>
                  </div>
                </div>
                <div className="football-row-button is-static">
                  <div>
                    <strong>ST</strong>
                    <span>0.24 Finishing + 0.18 ShotQuality + 0.18 Movement + 0.10 Pressing + 0.12 LinkPlay + 0.18 NonPenaltyScoring</span>
                  </div>
                </div>
              </div>
            </article>
            <article className="football-panel">
              <h3>Context Adjustments</h3>
              <div className="football-list">
                <div className="football-row-button is-static">
                  <div>
                    <strong>League / Club / Minutes</strong>
                    <span>leagueAdj = clamp((competitionWeight - 1.0) x 4, -2, 2); teamAdj = clamp((teamStrengthPct - 50) x 0.04, -2, 2); minutesAdj = clamp((minutesPct - 50) x 0.03, -1.5, 1.5).</span>
                  </div>
                </div>
                <div className="football-row-button is-static">
                  <div>
                    <strong>Recent / Consistency / Prime</strong>
                    <span>recentAdj = clamp((recentPct - seasonPct) x 0.10, -1.5, 1.5); consistencyAdj = clamp((consistencyPct - 50) x 0.03, -1, 1); prime years add +1.0 for ages 24-29.</span>
                  </div>
                </div>
                <div className="football-row-button is-static">
                  <div>
                    <strong>Normalization</strong>
                    <span>Position percentiles drive the base first. Final OVR compresses into 60-99 with very few 95+ and 99 reserved for elite percentile, minutes, and consistency cases.</span>
                  </div>
                </div>
              </div>
            </article>
            <article className="football-panel">
              <h3>{entityCopy.singular} Formula</h3>
              <div className="football-list">
                <div className="football-row-button is-static">
                  <div>
                    <strong>OFF / DEF</strong>
                    <span>OFF = 0.40 GoalsPer90 + 0.35 xG proxy + 0.15 ShotsOnTargetPer90 + 0.10 ChanceCreation. DEF = 0.40 xGA inverse proxy + 0.30 GoalsAllowed inverse + 0.15 CleanSheetRate + 0.15 ShotsAllowed inverse.</span>
                  </div>
                </div>
                <div className="football-row-button is-static">
                  <div>
                    <strong>Final OVR</strong>
                    <span>0.26 StartingXI + 0.14 Depth + 0.16 OFF + 0.16 DEF + 0.12 StandingPointsPct + 0.10 Recent + 0.06 Underlying, plus small league adjustment and FIFA modifier for International Play only.</span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        );
      case 'team-detail':
        return teamDetail ? <TeamDetailView detail={teamDetail} entityCopy={entityCopy} openPlayer={openPlayer} openStory={openStory} setPage={setPage} /> : null;
      case 'player-detail':
        return playerDetail ? (
          <PlayerDetailView
            detail={playerDetail}
            setPage={setPage}
            onBack={() => {
              if (hubOriginPlayer) {
                window.location.assign('/');
                return;
              }
              setPage('players');
            }}
          />
        ) : null;
      case 'game-detail':
        return gameDetail ? <GameDetailView detail={gameDetail} predictors={predictors} setPage={setPage} /> : null;
      case 'story-detail':
        return storyDetail ? (
          <StoryDetailView
            story={storyDetail}
            onBack={() => setPage(storyDetail.previousPage || 'overview')}
            onOpenRelated={(story) => openStory(story, storyDetail.previousPage || 'overview')}
          />
        ) : null;
      case 'overview':
      default:
        return <FootballOverview bootstrap={bootstrap} entityCopy={entityCopy} openGame={openGame} openTeam={openTeam} openPlayer={openPlayer} openStory={openStory} setPage={setPage} />;
    }
  }

  return (
    <section
      className="football-league-shell"
      data-theme={theme}
      style={{
        '--football-league-accent': leagueConfig.accent,
        '--football-league-accent-alt': leagueConfig.accentAlt,
        '--football-league-surface': leagueConfig.surface,
      }}
    >
      <button
        className={`football-mobile-overlay ${mobileNavOpen ? 'is-open' : ''}`}
        type="button"
        aria-label="Close navigation"
        onClick={() => setMobileNavOpen(false)}
      />
      <aside className={`football-sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="football-brand-block">
          <span>{leagueConfig.region}</span>
          <h2>{leagueConfig.label}</h2>
        </div>
        <nav className="football-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={page === item.key ? 'is-active' : ''}
              type="button"
              onClick={() => {
                setPage(item.key);
                setMobileNavOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="football-sidebar-footer">
          <Link href="/football" className="football-hub-link football-site-home-link">
            Football Hub
          </Link>
          <a href="/" className="football-hub-link secondary" target="_top">
            Back To Hub
          </a>
        </div>
      </aside>

      <div className="football-stage">
        <header className="football-stage-header">
          <div>
            <p className="eyebrow">Composite Football</p>
            <h1>{NAV_ITEMS.find((item) => item.key === page)?.label || 'Detail View'}</h1>
          </div>
          <div className="football-chip-row">
            <span className="football-chip">{bootstrap?.lastUpdated ? `Updated ${new Date(bootstrap.lastUpdated).toLocaleTimeString()}` : 'Sync pending'}</span>
            <RouteThemeToggle theme={theme} onToggle={toggleTheme} compact />
            <button className="football-refresh football-menu-button" type="button" onClick={() => setMobileNavOpen((value) => !value)}>
              Menu
            </button>
            <button className="football-refresh football-refresh-button" type="button" onClick={fetchBootstrap}>
              Refresh
            </button>
          </div>
        </header>
        {renderPage()}
      </div>
    </section>
  );
}
