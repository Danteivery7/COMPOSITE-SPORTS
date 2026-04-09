'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import StoryDetailCard from '@/src/components/StoryDetailCard';
import RouteThemeToggle from '@/src/components/RouteThemeToggle';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'scores', label: 'Scores' },
  { key: 'rankings', label: 'Rankings' },
  { key: 'teams', label: 'Teams' },
  { key: 'players', label: 'Players' },
  { key: 'predictor', label: 'Predictor' },
  { key: 'news', label: 'News' },
  { key: 'fantasy', label: 'Fantasy' },
  { key: 'settings', label: 'Settings' },
];

function hasRenderableBootstrap(bootstrap) {
  if (!bootstrap || bootstrap.error) return false;
  return Boolean(
    (bootstrap.scoreboard && bootstrap.scoreboard.length) ||
    (bootstrap.rankings && bootstrap.rankings.length) ||
    (bootstrap.news && bootstrap.news.length) ||
    (bootstrap.featuredPlayers && bootstrap.featuredPlayers.length) ||
    (bootstrap.fantasyRankings && bootstrap.fantasyRankings.length)
  );
}

function applyHeadshotFallback(event) {
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

function TeamLogo({ team }) {
  if (!team?.logo) {
    return <span className="nfl-logo-fallback">{team?.abbreviation?.slice(0, 3) || 'NFL'}</span>;
  }
  return <img src={team.logo} alt={team.displayName || team.abbreviation} className="nfl-team-logo" />;
}

function PlayerVisual({ player }) {
  if (!player?.headshot) {
    return <span className="nfl-logo-fallback">{player?.displayName?.slice(0, 2)?.toUpperCase() || 'PL'}</span>;
  }
  return (
    <img
      src={player.headshot}
      alt={player.displayName}
      className="nfl-player-headshot"
      data-fallback-src={`https://a.espncdn.com/i/headshots/nfl/players/full/${player.id}.png`}
      onError={applyHeadshotFallback}
    />
  );
}

function RenderRecord({ record, streak }) {
  return (
    <span className="nfl-record-line">
      <strong>{record || '0-0'}</strong>
      <span>{streak || 'Even'}</span>
    </span>
  );
}

function GameCard({ game, onOpen }) {
  return (
    <button className={`nfl-card nfl-score-card ${['live', 'in'].includes(game?.state) ? 'is-live' : ''}`} type="button" onClick={() => onOpen(game.id)}>
      <div className="nfl-card-topline">
        <span className={`nfl-status-pill is-${game.state}`}>{game.statusLabel}</span>
        <span>{game.broadcast || game.startLabel || 'ESPN'}</span>
      </div>
      <div className="nfl-score-rows">
        {[game.away, game.home].map((team) => (
          <div className="nfl-score-row" key={`${game.id}-${team.teamId}`}>
            <div className="nfl-team-row-copy">
              <TeamLogo team={team} />
              <div>
                <strong>{team.displayName}</strong>
                <span>{team.record || team.abbreviation}</span>
              </div>
            </div>
            <strong className="nfl-score-number">{team.score ?? '-'}</strong>
          </div>
        ))}
      </div>
    </button>
  );
}

function NewsFeature({ story, onOpen, className = '' }) {
  if (!story) return null;
  return (
    <button className={`nfl-card nfl-news-feature ${className}`.trim()} type="button" onClick={() => onOpen(story)}>
      {story.image ? <img src={story.image} alt={story.headline} className="nfl-news-image" /> : null}
      <div>
        <span className="nfl-panel-kicker">{story.source || 'ESPN'}</span>
        <strong>{story.headline}</strong>
        <p>{story.description || 'Open story'}</p>
      </div>
    </button>
  );
}

function OverviewView({ bootstrap, openGame, openTeam, openPlayer, openStory, setPage }) {
  const safeBootstrap = bootstrap || {};
  const leadGame = safeBootstrap.scoreboard?.[0];
  const topTeam = safeBootstrap.rankings?.[0];
  const topPlayer = safeBootstrap.featuredPlayers?.[0];
  const leadStory = safeBootstrap.news?.[0];
  const bestEdge = safeBootstrap.predictors?.[0];
  const fantasyHeadliner = safeBootstrap.fantasyRankings?.[0];
  const heroPlayers = (safeBootstrap.featuredPlayers || []).slice(0, 4);

  return (
    <section className="nfl-overview-shell">
      <article className="nfl-card nfl-hero-card">
        <div className="nfl-hero-copy">
          <p className="eyebrow">Composite NFL</p>
          <h2>Bright lights, field-level boards, and the full league control room.</h2>
          <p>
            The NFL board is now built like a live broadcast hub: scores, real team power, player tiers, fantasy value,
            and news all up front without the generic clutter.
          </p>
          <div className="nfl-chip-row">
            <span className="nfl-chip">{safeBootstrap.meta?.liveGames || 0} live games</span>
            <span className="nfl-chip">{safeBootstrap.rankings?.length || 0} teams tracked</span>
            <span className="nfl-chip">{safeBootstrap.featuredPlayers?.length || 0} featured players</span>
          </div>
        </div>
        <div className="nfl-hero-side">
          {leadStory ? (
            <button className="nfl-hero-story-visual" type="button" onClick={() => openStory(leadStory, 'overview')}>
              {leadStory.image ? <img src={leadStory.image} alt={leadStory.headline} className="nfl-hero-story-photo" /> : null}
              <div className="nfl-hero-story-overlay">
                <span className="nfl-panel-kicker">Lead Story</span>
                <strong>{leadStory.headline}</strong>
              </div>
            </button>
          ) : null}
          {heroPlayers.length ? (
            <div className="nfl-hero-player-strip">
              {heroPlayers.map((player) => (
                <button className="nfl-hero-player-chip" key={player.id} type="button" onClick={() => openPlayer(player.id)}>
                  <PlayerVisual player={player} />
                  <div>
                    <strong>{player.displayName}</strong>
                    <span>{player.team?.abbreviation} • {player.rating} OVR</span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
          {leadGame ? (
            <button className="nfl-spotlight-card" type="button" onClick={() => openGame(leadGame.id)}>
              <span className="nfl-panel-kicker">Featured Game</span>
              <strong>{leadGame.away.abbreviation} at {leadGame.home.abbreviation}</strong>
              <p>{leadGame.statusLabel} • {leadGame.broadcast || leadGame.startLabel}</p>
            </button>
          ) : null}
          {bestEdge ? (
            <button className="nfl-spotlight-card muted" type="button" onClick={() => setPage('predictor')}>
              <span className="nfl-panel-kicker">Best Edge</span>
              <strong>{bestEdge.home.abbreviation} {bestEdge.homeWinProbability}%</strong>
              <p>{bestEdge.projectedAwayScore}-{bestEdge.projectedHomeScore} • {bestEdge.confidence}</p>
            </button>
          ) : null}
        </div>
      </article>

      <div className="nfl-overview-grid">
        <article className="nfl-card nfl-panel nfl-panel-wide">
          <div className="nfl-panel-head">
            <div>
              <h3>Top Stories</h3>
              <p>Latest league and fantasy storylines, pushed higher up so the page feels alive.</p>
            </div>
            <button type="button" onClick={() => setPage('news')}>Open news</button>
          </div>
          <div className="nfl-news-rail">
            <NewsFeature story={leadStory} onOpen={(story) => openStory(story, 'overview')} />
            <div className="nfl-mini-news-list">
              {(safeBootstrap.news || []).slice(1, 5).map((story) => (
                <button className="nfl-mini-news-item" key={story.id} type="button" onClick={() => openStory(story, 'overview')}>
                  {story.image ? <img src={story.image} alt={story.headline} className="nfl-mini-news-image" /> : null}
                  <div>
                    <span>{story.source || 'ESPN'}</span>
                    <strong>{story.headline}</strong>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </article>

        <article className="nfl-card nfl-panel">
          <div className="nfl-panel-head">
            <div>
              <h3>Power Leader</h3>
              <p>Previous-season power stays in control until July 31.</p>
            </div>
            <button type="button" onClick={() => topTeam && openTeam(topTeam.id)}>Team page</button>
          </div>
          {topTeam ? (
            <button className="nfl-top-team" type="button" onClick={() => openTeam(topTeam.id)}>
              <TeamLogo team={topTeam} />
              <div>
                <strong>#{topTeam.ovrRank} {topTeam.displayName}</strong>
                <RenderRecord record={topTeam.record} streak={topTeam.streak} />
                <p>{topTeam.ovrScore} OVR • OFF {topTeam.offScore} • DEF {topTeam.defScore}</p>
              </div>
            </button>
          ) : (
            <p className="nfl-empty-copy">Power board is still syncing.</p>
          )}
        </article>

        <article className="nfl-card nfl-panel">
          <div className="nfl-panel-head">
            <div>
              <h3>Top Player</h3>
              <p>Real football impact, not just fantasy value.</p>
            </div>
            <button type="button" onClick={() => topPlayer && openPlayer(topPlayer.id)}>Player page</button>
          </div>
          {topPlayer ? (
            <button className="nfl-top-player" type="button" onClick={() => openPlayer(topPlayer.id)}>
              <PlayerVisual player={topPlayer} />
              <div>
                <strong>{topPlayer.displayName}</strong>
                <span>{topPlayer.positionGroup || topPlayer.position} • {topPlayer.team?.abbreviation}</span>
                <p>{topPlayer.rating} OVR • {topPlayer.leaderSummary}</p>
              </div>
            </button>
          ) : (
            <p className="nfl-empty-copy">Top player board is still syncing.</p>
          )}
        </article>
      </div>

      <div className="nfl-overview-grid nfl-overview-grid-lower">
        <article className="nfl-card nfl-panel">
          <div className="nfl-panel-head">
            <div>
              <h3>Live Board</h3>
              <p>Cleaner score cards with more breathing room.</p>
            </div>
            <button type="button" onClick={() => setPage('scores')}>All scores</button>
          </div>
          <div className="nfl-list">
            {(safeBootstrap.scoreboard || []).slice(0, 4).map((game) => (
              <GameCard key={game.id} game={game} onOpen={openGame} />
            ))}
          </div>
        </article>

        <article className="nfl-card nfl-panel">
          <div className="nfl-panel-head">
            <div>
              <h3>Fantasy Lens</h3>
              <p>Offseason value board and fantasy storyline feed.</p>
            </div>
            <button type="button" onClick={() => setPage('fantasy')}>Fantasy tab</button>
          </div>
          {fantasyHeadliner ? (
            <button className="nfl-fantasy-headliner" type="button" onClick={() => setPage('fantasy')}>
              <PlayerVisual player={fantasyHeadliner} />
              <div>
                <strong>#{fantasyHeadliner.fantasyRank} {fantasyHeadliner.displayName}</strong>
                <span>{fantasyHeadliner.positionGroup} • {fantasyHeadliner.team?.abbreviation}</span>
                <p>{fantasyHeadliner.fantasyValue} fantasy value</p>
              </div>
            </button>
          ) : (
            <p className="nfl-empty-copy">Fantasy board is still syncing.</p>
          )}
          <div className="nfl-fantasy-news-list">
            {(safeBootstrap.fantasyNews || []).slice(0, 4).map((story) => (
              <button className="nfl-mini-note" key={story.id} type="button" onClick={() => openStory(story, 'overview')}>
                <strong>{story.headline}</strong>
                <span>{story.source || 'ESPN Fantasy'}</span>
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function RankingsView({ rankings, openTeam }) {
  return (
    <div className="nfl-table-wrap">
      <table className="nfl-table">
        <thead>
          <tr>
            <th>RK</th>
            <th>Team</th>
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
                <div className="nfl-table-team">
                  <TeamLogo team={team} />
                  <div>
                    <strong>{team.displayName}</strong>
                    <span>{team.streak || 'Even'}</span>
                  </div>
                </div>
              </td>
              <td>{team.ovrScore}</td>
              <td>{team.offScore}</td>
              <td>{team.defScore}</td>
              <td>{team.record}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamsView({ teams, openTeam }) {
  return (
    <div className="nfl-card-grid">
      {teams.map((team) => (
        <button className="nfl-card nfl-team-card" key={team.id} type="button" onClick={() => openTeam(team.id)}>
          <div className="nfl-team-card-head">
            <TeamLogo team={team} />
            <div>
              <strong>{team.displayName}</strong>
              <RenderRecord record={team.record} streak={team.streak} />
            </div>
          </div>
          <div className="nfl-chip-row">
            <span className="nfl-chip">#{team.ovrRank}</span>
            <span className="nfl-chip">OFF {team.offScore}</span>
            <span className="nfl-chip">DEF {team.defScore}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function hotnessLabel(value) {
  return `${Math.max(1, Math.min(5, Number(value || 0)))}/5`;
}

async function fetchJsonSafe(url, fallback = null) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) return fallback;
    return data;
  } catch (_error) {
    return fallback;
  }
}

function PlayersView({ players, query, setQuery, loading, openPlayer }) {
  return (
    <section className="nfl-stack">
      <div className="nfl-controls">
        <input
          className="nfl-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search all NFL players"
        />
        <span>{loading ? 'Syncing player board...' : `${players.length} players`}</span>
      </div>
      <div className="nfl-table-wrap">
        <table className="nfl-table">
          <thead>
            <tr>
              <th>RK</th>
              <th>Player</th>
              <th>Team</th>
              <th>POS</th>
              <th>OVR</th>
              <th>Hot</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id} onClick={() => openPlayer(player.id)}>
                <td>{player.rank}</td>
                <td>
                  <div className="nfl-player-cell">
                    <PlayerVisual player={player} />
                    <div>
                      <strong>{player.displayName}</strong>
                      <span>{player.leaderSummary || player.tier}</span>
                    </div>
                  </div>
                </td>
                <td>{player.team?.abbreviation || '-'}</td>
                <td>{player.positionGroup || player.position}</td>
                <td>{player.rating}</td>
                <td>{hotnessLabel(player.hotness || Math.round(((player.percentile || 50) - 45) / 11))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PredictorCard({ predictor }) {
  return (
    <article className="nfl-card nfl-predictor-card">
      <div className="nfl-panel-kicker">Model Result</div>
      <strong>{predictor.away.abbreviation} at {predictor.home.abbreviation}</strong>
      <p className="nfl-predictor-score">{predictor.projectedAwayScore} - {predictor.projectedHomeScore}</p>
      <div className="nfl-chip-row">
        <span className="nfl-chip">{predictor.home.abbreviation} {predictor.homeWinProbability}%</span>
        <span className="nfl-chip">{predictor.away.abbreviation} {predictor.awayWinProbability}%</span>
        <span className="nfl-chip">{predictor.confidence}</span>
      </div>
      <div className="nfl-mini-note-list">
        {(predictor.explanation || []).slice(0, 3).map((note, index) => (
          <div className="nfl-mini-note static" key={`${note}-${index}`}>
            <strong>Why</strong>
            <span>{note}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function PredictorView({
  predictors,
  teams,
  selectedHomeTeamId,
  selectedAwayTeamId,
  setSelectedHomeTeamId,
  setSelectedAwayTeamId,
  customPredictor,
  predictorLoading,
}) {
  return (
    <section className="nfl-stack">
      <article className="nfl-card nfl-panel nfl-predictor-builder">
        <div className="nfl-panel-head">
          <div>
            <h3>Any Two Teams</h3>
            <p>Records, top players, recent form, and team power all feed the board.</p>
          </div>
        </div>
        <div className="nfl-predictor-form">
          <label>
            Home Team
            <select value={selectedHomeTeamId} onChange={(event) => setSelectedHomeTeamId(event.target.value)}>
              <option value="">Select home team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.displayName}</option>
              ))}
            </select>
          </label>
          <label>
            Away Team
            <select value={selectedAwayTeamId} onChange={(event) => setSelectedAwayTeamId(event.target.value)}>
              <option value="">Select away team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.displayName}</option>
              ))}
            </select>
          </label>
        </div>
      </article>

      {predictorLoading ? <p className="nfl-empty-copy">Running matchup model...</p> : null}

      <div className="nfl-card-grid">
        {(customPredictor.length ? customPredictor : predictors).map((predictor) => (
          <PredictorCard predictor={predictor} key={predictor.gameId} />
        ))}
      </div>
    </section>
  );
}

function NewsView({ news, openStory }) {
  return (
    <div className="nfl-card-grid nfl-news-grid">
      {news.map((story) => (
        <NewsFeature key={story.id} story={story} onOpen={(item) => openStory(item, 'news')} className="nfl-news-card" />
      ))}
    </div>
  );
}

function FantasyView({ rankings, news, openPlayer, openStory }) {
  return (
    <section className="nfl-stack">
      <article className="nfl-card nfl-panel">
        <div className="nfl-panel-head">
          <div>
            <h3>Fantasy Rankings</h3>
            <p>Last season carries the board until Week 5, then current-season production takes over more aggressively.</p>
          </div>
        </div>
        <div className="nfl-table-wrap">
          <table className="nfl-table">
            <thead>
              <tr>
                <th>RK</th>
                <th>Player</th>
                <th>POS</th>
                <th>Team</th>
                <th>Fantasy</th>
                <th>Real OVR</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((player) => (
                <tr key={player.id} onClick={() => openPlayer(player.id)}>
                  <td>{player.fantasyRank}</td>
                  <td>
                    <div className="nfl-player-cell">
                      <PlayerVisual player={player} />
                      <div>
                        <strong>{player.displayName}</strong>
                        <span>{player.leaderSummary}</span>
                      </div>
                    </div>
                  </td>
                  <td>{player.positionGroup}</td>
                  <td>{player.team?.abbreviation || '-'}</td>
                  <td>{player.fantasyValue}</td>
                  <td>{player.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="nfl-card nfl-panel">
        <div className="nfl-panel-head">
          <div>
            <h3>Fantasy News</h3>
            <p>Role, injury, depth chart, and offseason signal stories.</p>
          </div>
        </div>
        <div className="nfl-mini-note-list">
          {news.map((story) => (
            <button className="nfl-mini-note" key={story.id} type="button" onClick={() => openStory(story, 'fantasy')}>
              <strong>{story.headline}</strong>
              <span>{story.source || 'ESPN Fantasy'}</span>
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}

function TeamDetailView({ detail, openPlayer, openStory, setPage }) {
  return (
    <section className="nfl-stack">
      <button className="nfl-back-button" type="button" onClick={() => setPage('teams')}>
        Back to teams
      </button>
      <article className="nfl-card nfl-detail-hero">
        <div className="nfl-detail-brand">
          <TeamLogo team={detail.team} />
          <div>
            <p className="eyebrow">Team Spotlight</p>
            <h2>{detail.team.displayName}</h2>
            <p>{detail.summary}</p>
          </div>
        </div>
        <div className="nfl-chip-row">
          <span className="nfl-chip">OFF {detail.team.offScore}</span>
          <span className="nfl-chip">DEF {detail.team.defScore}</span>
          <span className="nfl-chip">{detail.team.record}</span>
        </div>
      </article>

      <div className="nfl-overview-grid">
        <article className="nfl-card nfl-panel">
          <div className="nfl-panel-head">
            <div>
              <h3>Top Players</h3>
              <p>Impact names from this roster.</p>
            </div>
          </div>
          <div className="nfl-mini-note-list">
            {detail.roster.map((player) => (
              <button className="nfl-mini-note" key={player.id} type="button" onClick={() => openPlayer(player.id)}>
                <strong>{player.displayName}</strong>
                <span>{player.positionGroup} • {player.rating} OVR</span>
              </button>
            ))}
          </div>
        </article>

        <article className="nfl-card nfl-panel">
          <div className="nfl-panel-head">
            <div>
              <h3>Recent Stretch</h3>
              <p>Last five results and momentum.</p>
            </div>
          </div>
          <div className="nfl-mini-note-list">
            {(detail.recent || []).map((note, index) => (
              <div className="nfl-mini-note static" key={`${note}-${index}`}>
                <strong>Recent</strong>
                <span>{note}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="nfl-card nfl-panel">
          <div className="nfl-panel-head">
            <div>
              <h3>Team News</h3>
              <p>Specific stories that keep the page feeling like that team.</p>
            </div>
          </div>
          <div className="nfl-mini-note-list">
            {(detail.news || []).map((story) => (
              <button className="nfl-mini-note" key={story.id} type="button" onClick={() => openStory(story, 'team-detail')}>
                <strong>{story.headline}</strong>
                <span>{story.source || 'ESPN'}</span>
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
    <section className="nfl-stack">
      <button className="nfl-back-button" type="button" onClick={onBack || (() => setPage('players'))}>
        Back to players
      </button>
      <article className="nfl-card nfl-detail-hero">
        <div className="nfl-player-hero">
          <PlayerVisual player={detail.player} />
          <div>
            <p className="eyebrow">Player Spotlight</p>
            <h2>{detail.player.displayName}</h2>
            <p>{detail.player.team?.displayName} • {detail.player.positionGroup}</p>
          </div>
          <div className="nfl-rating-block">
            <strong>{detail.player.rating}</strong>
            <span>{detail.player.tier}</span>
          </div>
        </div>
        <p className="nfl-body-copy">{detail.analysis}</p>
        <div className="nfl-chip-row">
          <span className="nfl-chip">Hotness {hotnessLabel(detail.hotness)}</span>
          {detail.player.fantasyRank ? <span className="nfl-chip">Fantasy #{detail.player.fantasyRank}</span> : null}
          {detail.player.fantasyValue ? <span className="nfl-chip">Fantasy {detail.player.fantasyValue}</span> : null}
        </div>
      </article>

      <div className="nfl-overview-grid">
        <article className="nfl-card nfl-panel">
          <div className="nfl-panel-head">
            <div>
              <h3>Accolades / Signals</h3>
              <p>Leaderboard and role markers driving this player.</p>
            </div>
          </div>
          <div className="nfl-mini-note-list">
            {(detail.accolades || []).map((item, index) => (
              <div className="nfl-mini-note static" key={`${item}-${index}`}>
                <strong>Signal</strong>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="nfl-card nfl-panel nfl-panel-tall">
          <div className="nfl-panel-head">
            <div>
              <h3>Stat Feed</h3>
              <p>Position-aware stat feed so quarterbacks, skill players, and specialists read correctly.</p>
            </div>
          </div>
          <div className="nfl-mini-note-list">
            {(detail.stats || []).map((stat) => (
              <div className="nfl-mini-note static" key={`${stat.group}-${stat.label}`}>
                <strong>{stat.label}</strong>
                <span>{stat.group} • {stat.value}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function FieldGraphic({ fieldState, away, home }) {
  const yardLine = Math.max(1, Math.min(99, Number(fieldState?.yardLine || 50)));
  return (
    <div className="nfl-field-graphic" aria-hidden="true">
      <div className="nfl-field-lights" />
      <div className="nfl-field-lines" />
      <div className="nfl-field-ball" style={{ left: `${yardLine}%` }} />
      <div className="nfl-field-copy">
        <strong>{fieldState?.possession || `${away?.abbreviation} / ${home?.abbreviation}`}</strong>
        <span>{fieldState?.downDistance || 'Field position'}</span>
      </div>
    </div>
  );
}

function GameDetailView({ detail, setPage }) {
  return (
    <section className="nfl-stack">
      <button className="nfl-back-button" type="button" onClick={() => setPage('scores')}>
        Back to scores
      </button>
      <article className="nfl-card nfl-detail-hero nfl-game-detail-hero">
        <div className="nfl-matchup-strip">
          <div className="nfl-match-team">
            <TeamLogo team={detail.game.away} />
            <div>
              <strong>{detail.game.away.displayName}</strong>
              <span>{detail.game.away.record || detail.game.away.abbreviation}</span>
            </div>
          </div>
          <div className="nfl-match-score">
            <span className={`nfl-status-pill is-${detail.game.state}`}>{detail.game.statusLabel}</span>
            <strong>{detail.game.away.score} - {detail.game.home.score}</strong>
          </div>
          <div className="nfl-match-team">
            <TeamLogo team={detail.game.home} />
            <div>
              <strong>{detail.game.home.displayName}</strong>
              <span>{detail.game.home.record || detail.game.home.abbreviation}</span>
            </div>
          </div>
        </div>
        <FieldGraphic fieldState={detail.fieldState} away={detail.game.away} home={detail.game.home} />
        <div className="nfl-chip-row">
          {detail.venue ? <span className="nfl-chip">{detail.venue}</span> : null}
          {detail.location ? <span className="nfl-chip">{detail.location}</span> : null}
          {detail.broadcast ? <span className="nfl-chip">{detail.broadcast}</span> : null}
        </div>
        <p className="nfl-body-copy">{detail.summary}</p>
      </article>

      <div className="nfl-overview-grid">
        <article className="nfl-card nfl-panel nfl-panel-tall">
          <div className="nfl-panel-head">
            <div>
              <h3>Key Moments</h3>
              <p>Goals are not the sport here, so scoring plays and major swings lead the timeline.</p>
            </div>
          </div>
          <div className="nfl-timeline">
            {(detail.timeline || []).map((item, index) => (
              <div className="nfl-timeline-item" key={`${item.title}-${index}`}>
                <strong>{item.title}</strong>
                <span>{[item.period, item.clock].filter(Boolean).join(' • ') || 'Game moment'}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="nfl-card nfl-panel">
          <div className="nfl-panel-head">
            <div>
              <h3>Man of the Match</h3>
              <p>Best single-game signal from the summary feed.</p>
            </div>
          </div>
          {detail.manOfTheMatch ? (
            <div className="nfl-mini-note static nfl-man-of-match">
              <strong>{detail.manOfTheMatch.displayName}</strong>
              <span>{detail.manOfTheMatch.summary}</span>
            </div>
          ) : (
            <p className="nfl-empty-copy">Man of the match will appear as the summary feed locks in.</p>
          )}
          {detail.predictor ? (
            <PredictorCard predictor={detail.predictor} />
          ) : null}
        </article>

        <article className="nfl-card nfl-panel">
          <div className="nfl-panel-head">
            <div>
              <h3>Box Score</h3>
              <p>Cleaner team totals without every tiny play overwhelming the page.</p>
            </div>
          </div>
          <div className="nfl-mini-note-list">
            {(detail.boxScore || []).map((team) => (
              <div className="nfl-boxscore-team" key={team.teamId}>
                <strong>{team.displayName}</strong>
                {(team.stats || []).map((stat) => (
                  <span key={`${team.teamId}-${stat.label}`}>{stat.label}: {stat.value}</span>
                ))}
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function StoryDetailView({ story, onBack, onOpenRelated }) {
  return <StoryDetailCard story={story} onBack={onBack} backLabel="Back to news" onOpenRelated={onOpenRelated} />;
}

export default function NFLApp({ initialEntry = null, initialBootstrap = null, theme = 'dark', toggleTheme = () => {} }) {
  const apiBase = '/api/nfl';
  const [page, setPage] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bootstrap, setBootstrap] = useState(initialBootstrap);
  const [playersData, setPlayersData] = useState(null);
  const [teamDetail, setTeamDetail] = useState(null);
  const [playerDetail, setPlayerDetail] = useState(null);
  const [gameDetail, setGameDetail] = useState(null);
  const [storyDetail, setStoryDetail] = useState(null);
  const [playersQuery, setPlayersQuery] = useState('');
  const [loadingBootstrap, setLoadingBootstrap] = useState(!hasRenderableBootstrap(initialBootstrap));
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [hubOriginPlayer, setHubOriginPlayer] = useState(false);
  const [selectedHomeTeamId, setSelectedHomeTeamId] = useState('');
  const [selectedAwayTeamId, setSelectedAwayTeamId] = useState('');
  const [customPredictor, setCustomPredictor] = useState([]);
  const [predictorLoading, setPredictorLoading] = useState(false);
  const initialEntryHandledRef = useRef(false);
  const bootstrapRef = useRef(initialBootstrap);

  useEffect(() => {
    bootstrapRef.current = bootstrap;
  }, [bootstrap]);

  async function fetchBootstrap(force = false) {
    try {
      const data = await fetchJsonSafe(`${apiBase}/bootstrap${force ? '?force=1' : ''}`, null);
      if (data) {
        setBootstrap(data);
      }
    } finally {
      setLoadingBootstrap(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    const refresh = () => {
      if (ignore) return;
      const shouldForce = !hasRenderableBootstrap(bootstrapRef.current);
      fetchBootstrap(shouldForce);
    };

    if (!hasRenderableBootstrap(initialBootstrap)) {
      refresh();
    } else {
      const interval = window.setInterval(() => {
        if (!ignore) fetchBootstrap(false);
      }, 60_000);
      return () => {
        ignore = true;
        window.clearInterval(interval);
      };
    }

    const interval = window.setInterval(refresh, 60_000);
    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, [apiBase, initialBootstrap]);

  useEffect(() => {
    if (page !== 'players') return;
    let ignore = false;

    async function fetchPlayers() {
      setLoadingPlayers(true);
      try {
        const query = playersQuery.trim() ? `?q=${encodeURIComponent(playersQuery.trim())}` : '';
        const data = await fetchJsonSafe(`${apiBase}/players${query}`, { players: [] });
        if (!ignore) setPlayersData(data);
      } finally {
        if (!ignore) setLoadingPlayers(false);
      }
    }

    fetchPlayers();
    return () => {
      ignore = true;
    };
  }, [apiBase, page, playersQuery]);

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
        const data = await fetchJsonSafe(
          `${apiBase}/predictor?homeTeamId=${encodeURIComponent(selectedHomeTeamId)}&awayTeamId=${encodeURIComponent(selectedAwayTeamId)}`,
          { predictors: [] },
        );
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
    const data = await fetchJsonSafe(`${apiBase}/teams/${teamId}`, null);
    if (!data) return;
    setTeamDetail(data);
    setPage('team-detail');
    setMobileNavOpen(false);
  }

  async function openPlayer(playerId, options = {}) {
    const data = await fetchJsonSafe(`${apiBase}/players/${playerId}`, null);
    if (!data) return;
    setHubOriginPlayer(Boolean(options.fromHub));
    setPlayerDetail(data);
    setPage('player-detail');
    setMobileNavOpen(false);
  }

  async function openGame(gameId) {
    const data = await fetchJsonSafe(`${apiBase}/games/${gameId}`, null);
    if (!data) return;
    setGameDetail(data);
    setPage('game-detail');
    setMobileNavOpen(false);
  }

  async function openStory(story, fromPage = 'overview') {
    if (!story?.storyId) return;
    const data = await fetchJsonSafe(`${apiBase}/news/${story.storyId}?apiHref=${encodeURIComponent(story.apiHref || '')}`, null);
    if (!data) return;
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
  const fantasyRankings = useMemo(() => bootstrap?.fantasyRankings || [], [bootstrap]);
  const fantasyNews = useMemo(() => bootstrap?.fantasyNews || [], [bootstrap]);

  function renderPage() {
    if (loadingBootstrap) {
      return (
        <section className="nfl-loading">
          <p className="eyebrow">NFL Sync</p>
          <h2>Pulling power board, scores, fantasy signals, and the latest stories.</h2>
        </section>
      );
    }

    if (!hasRenderableBootstrap(bootstrap)) {
      return (
        <section className="nfl-loading">
          <p className="eyebrow">NFL Sync</p>
          <h2>Refreshing the board from the latest stored season snapshot.</h2>
        </section>
      );
    }

    switch (page) {
      case 'scores':
        return <div className="nfl-card-grid">{(bootstrap?.scoreboard || []).map((game) => <GameCard key={game.id} game={game} onOpen={openGame} />)}</div>;
      case 'rankings':
        return <RankingsView rankings={rankings} openTeam={openTeam} />;
      case 'teams':
        return <TeamsView teams={teams} openTeam={openTeam} />;
      case 'players':
        return <PlayersView players={playersData?.players || []} query={playersQuery} setQuery={setPlayersQuery} loading={loadingPlayers} openPlayer={openPlayer} />;
      case 'predictor':
        return (
          <PredictorView
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
      case 'fantasy':
        return <FantasyView rankings={fantasyRankings} news={fantasyNews} openPlayer={openPlayer} openStory={openStory} />;
      case 'settings':
        return (
          <div className="nfl-card-grid">
            <article className="nfl-card nfl-panel">
              <h3>Player OVR Formulas</h3>
              <div className="nfl-mini-note-list">
                <div className="nfl-mini-note static"><strong>QB</strong><span>0.26 Efficiency + 0.22 Production + 0.14 Explosiveness + 0.10 Rushing + 0.10 DecisionMaking + 0.10 SnapShare + 0.08 Consistency</span></div>
                <div className="nfl-mini-note static"><strong>RB / WR / TE</strong><span>Skill positions use efficiency, production, explosive play rate, role share, red-zone usage, snap share, and consistency with position-specific weighting.</span></div>
                <div className="nfl-mini-note static"><strong>OL / EDGE / DL / LB / CB / S / K-P</strong><span>Protection, disruption, coverage, tackling, splash plays, field position, and consistency drive the real-football board rather than fantasy bias.</span></div>
              </div>
            </article>
            <article className="nfl-card nfl-panel">
              <h3>Normalization Rules</h3>
              <div className="nfl-mini-note-list">
                <div className="nfl-mini-note static"><strong>Tiers</strong><span>96-99 generational, 91-95 superstar, 84-90 high-end starter, 78-83 solid starter, 70-77 average, below 70 depth.</span></div>
                <div className="nfl-mini-note static"><strong>Context</strong><span>Position percentiles lead first, then smaller adjustments for role difficulty, team quality, age curve, consistency, and recent form.</span></div>
                <div className="nfl-mini-note static"><strong>Season Cutoff</strong><span>The active board keeps using the prior season until after July 31 so offseason NFL ranks do not jump too early.</span></div>
              </div>
            </article>
            <article className="nfl-card nfl-panel">
              <h3>Fantasy Logic</h3>
              <div className="nfl-mini-note-list">
                <div className="nfl-mini-note static"><strong>Before Week 5</strong><span>Previous-season volume, role share, red-zone usage, team environment, injuries, and fantasy news carry more weight.</span></div>
                <div className="nfl-mini-note static"><strong>After Week 5</strong><span>Current-season fantasy production and trend lines take over more aggressively.</span></div>
              </div>
            </article>
          </div>
        );
      case 'team-detail':
        return teamDetail ? <TeamDetailView detail={teamDetail} openPlayer={openPlayer} openStory={openStory} setPage={setPage} /> : null;
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
        return gameDetail ? <GameDetailView detail={gameDetail} setPage={setPage} /> : null;
      case 'story-detail':
        return storyDetail ? (
          <StoryDetailView
            story={storyDetail}
            onBack={() => setPage(storyDetail.previousPage || 'news')}
            onOpenRelated={(story) => openStory(story, storyDetail.previousPage || 'news')}
          />
        ) : null;
      case 'overview':
      default:
        return <OverviewView bootstrap={bootstrap} openGame={openGame} openTeam={openTeam} openPlayer={openPlayer} openStory={openStory} setPage={setPage} />;
    }
  }

  return (
    <section className="nfl-route-shell" data-theme={theme}>
      <button
        className={`nfl-mobile-overlay ${mobileNavOpen ? 'is-open' : ''}`}
        type="button"
        aria-label="Close navigation"
        onClick={() => setMobileNavOpen(false)}
      />
      <aside className={`nfl-sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="nfl-brand-block">
          <p className="eyebrow">Composite NFL</p>
          <h2>Field Control Room</h2>
        </div>
        <nav className="nfl-nav">
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
        <div className="nfl-sidebar-footer">
          <RouteThemeToggle theme={theme} onToggle={toggleTheme} compact />
          <a href="/" className="nfl-hub-link" target="_top">
            Back To Hub
          </a>
        </div>
      </aside>

      <div className="nfl-stage">
        <header className="nfl-stage-header">
          <div>
            <p className="eyebrow">Composite NFL</p>
            <h1>{NAV_ITEMS.find((item) => item.key === page)?.label || 'Detail View'}</h1>
          </div>
          <div className="nfl-header-actions">
            <span className="nfl-stage-stamp">{bootstrap?.lastUpdated ? `Updated ${new Date(bootstrap.lastUpdated).toLocaleTimeString()}` : 'Syncing...'}</span>
            <div className="nfl-desktop-theme">
              <RouteThemeToggle theme={theme} onToggle={toggleTheme} compact />
            </div>
            <button className="nfl-menu-button" type="button" onClick={() => setMobileNavOpen((value) => !value)}>
              {mobileNavOpen ? '✕' : '☰'}
            </button>
          </div>
        </header>
        {renderPage()}
      </div>
    </section>
  );
}
