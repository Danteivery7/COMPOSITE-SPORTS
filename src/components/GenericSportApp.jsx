'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import RouteThemeToggle from '@/src/components/RouteThemeToggle';
import { getSportConfig } from '@/src/data/sports';
import StoryDetailCard from '@/src/components/StoryDetailCard';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'scores', label: 'Scores' },
  { key: 'rankings', label: 'Rankings' },
  { key: 'teams', label: 'Teams' },
  { key: 'players', label: 'Players' },
  { key: 'predictor', label: 'Predictor' },
  { key: 'settings', label: 'Settings' },
];

const SPORT_VIEW_COPY = {
  cbb: {
    heroEyebrow: 'Selection Room',
    heroTitle: 'Bubble pressure, upset watch, and the full campus board in one place.',
    heroSummary:
      'The CBB route leans into bracket energy, hot mid-major storylines, and a top-down resume view so the board feels like March even on an ordinary slate.',
    scoresTitle: 'Campus Pulse',
    rankingsTitle: 'Resume Board',
    playersTitle: 'Tournament Risers',
    edgesTitle: 'Upset Watch',
    teamStoryLabel: 'Resume Read',
    playerStoryLabel: 'Prospect Pulse',
    gameStoryLabel: 'Bracket Pressure',
  },
  nfl: {
    heroEyebrow: 'Broadcast Window',
    heroTitle: 'Field-level atmosphere, kickoff context, and the best edges on the slate.',
    heroSummary:
      'The NFL route now reads more like a broadcast board: field-green context, matchup framing, and clean Sunday-style power signals.',
    scoresTitle: 'Kickoff Board',
    rankingsTitle: 'Power Index',
    playersTitle: 'Impact Board',
    edgesTitle: 'Sunday Edges',
    teamStoryLabel: 'Game Tape',
    playerStoryLabel: 'Sunday Role',
    gameStoryLabel: 'Game Script',
  },
  mls: {
    heroEyebrow: 'Match Night',
    heroTitle: 'Pitch-side boards, goal threats, and the floodlit match context that matters.',
    heroSummary:
      'The MLS route pushes into a more football-first feel with match-night presentation, club form, and attacking danger front and center.',
    scoresTitle: 'Fixtures & Live Matches',
    rankingsTitle: 'Supporters Shield Race',
    playersTitle: 'Goal Threats',
    edgesTitle: 'Match Edges',
    teamStoryLabel: 'Club Identity',
    playerStoryLabel: 'Match Influence',
    gameStoryLabel: 'Match Rhythm',
  },
};

function metricChip(label, value) {
  return (
    <div className="generic-metric-chip" key={label}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TeamLogo({ team }) {
  if (!team?.logo) {
    return <span className="generic-logo-fallback">{team?.abbreviation?.slice(0, 3) || 'TM'}</span>;
  }

  return <img src={team.logo} alt={team.displayName} className="generic-team-logo" />;
}

function PlayerVisual({ player }) {
  if (!player?.headshot) {
    return <span className="generic-logo-fallback">{player?.displayName?.slice(0, 2)?.toUpperCase() || 'PL'}</span>;
  }

  return <img src={player.headshot} alt={player.displayName} className="generic-player-headshot" />;
}

function GameCard({ game, onOpen }) {
  return (
    <button className="generic-card generic-game-card" type="button" onClick={() => onOpen(game.id)}>
      <div className="generic-card-head">
        <span className={`generic-status-pill is-${game.state}`}>{game.statusLabel || game.state}</span>
        <span>{game.broadcast || game.startLabel || 'ESPN'}</span>
      </div>
      <div className="generic-score-rows">
        {[game.away, game.home].map((team) => (
          <div className="generic-score-row" key={`${game.id}-${team?.teamId}`}>
            <div className="generic-score-team">
              <TeamLogo team={team} />
              <div>
                <strong>{team?.displayName || 'Team'}</strong>
                <span>{team?.record || team?.abbreviation || ''}</span>
              </div>
            </div>
            <strong className="generic-score-value">{team?.score ?? '-'}</strong>
          </div>
        ))}
      </div>
    </button>
  );
}

function RankingsTable({ rankings, onOpenTeam }) {
  return (
    <div className="generic-table-wrap">
      <table className="generic-table">
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
            <tr key={team.id} onClick={() => onOpenTeam(team.id)}>
              <td>{team.ovrRank}</td>
              <td>
                <div className="generic-table-team">
                  <TeamLogo team={team} />
                  <div>
                    <strong>{team.displayName}</strong>
                    <span>{team.groupLabel || team.abbreviation}</span>
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

function TeamGrid({ teams, onOpen }) {
  return (
    <div className="generic-grid generic-team-grid">
      {teams.map((team) => (
        <button className="generic-card generic-team-card" key={team.id} type="button" onClick={() => onOpen(team.id)}>
          <div className="generic-team-card-head">
            <TeamLogo team={team} />
            <div>
              <h3>{team.displayName}</h3>
              <p>{team.groupLabel || team.abbreviation}</p>
            </div>
          </div>
          <div className="generic-inline-stats">
            <span>{team.record}</span>
            <span>#{team.ovrRank} OVR</span>
            <span>{team.streak || 'Even'}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function PlayersTable({ players, onOpen, query, onQueryChange, loading }) {
  return (
    <section className="generic-stack">
      <div className="generic-controls">
        <input
          className="generic-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search all players"
        />
        <span>{loading ? 'Syncing player board...' : `${players.length} players`}</span>
      </div>
      <div className="generic-table-wrap">
        <table className="generic-table">
          <thead>
            <tr>
              <th>RK</th>
              <th>Player</th>
              <th>Team</th>
              <th>POS</th>
              <th>OVR</th>
              <th>Tier</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id} onClick={() => onOpen(player.id)}>
                <td>{player.rank}</td>
                <td>
                  <div className="generic-player-cell">
                    <PlayerVisual player={player} />
                    <div>
                      <strong>{player.displayName}</strong>
                      <span>{player.leaderSummary || player.shortName || 'Roster board'}</span>
                    </div>
                  </div>
                </td>
                <td>{player.team?.abbreviation || '-'}</td>
                <td>{player.position || '-'}</td>
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

function PredictorRail({ predictors }) {
  if (!predictors.length) {
    return <p className="generic-empty-copy">Predictor cards will populate as soon as the live slate or upcoming fixtures are available.</p>;
  }

  return (
    <div className="generic-grid generic-predictor-grid">
      {predictors.map((game) => (
        <article className="generic-card generic-predictor-card" key={game.gameId}>
          <div className="generic-card-head">
            <span>{game.away.abbreviation} at {game.home.abbreviation}</span>
            <strong>{game.confidence}</strong>
          </div>
          <div className="generic-prob-bar">
            <div className="generic-prob-fill" style={{ width: `${game.homeWinProbability}%` }} />
          </div>
          <div className="generic-inline-stats">
            <span>{game.home.abbreviation} {game.homeWinProbability}%</span>
            <span>{game.away.abbreviation} {100 - game.homeWinProbability}%</span>
          </div>
          <p className="generic-predictor-score">
            {game.projectedAwayScore} - {game.projectedHomeScore}
          </p>
          <div className="sportview-chip-row">
            <span className="sportview-chip">{game.bettingLean || 'Model edge'}</span>
            {game.odds?.overUnder ? <span className="sportview-chip">O/U {game.odds.overUnder}</span> : null}
            {game.americanOdds != null ? <span className="sportview-chip">{game.americanOdds > 0 ? '+' : ''}{game.americanOdds}</span> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function SportRow({ title, subtitle, value, onClick, children }) {
  return (
    <button className="sportview-row" type="button" onClick={onClick}>
      <div className="sportview-row-head">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {children || (value ? <div className="sportview-row-value">{value}</div> : null)}
    </button>
  );
}

function SportPanel({ title, subtitle, actionLabel, onAction, children, className = '' }) {
  return (
    <article className={`generic-card sportview-panel ${className}`.trim()}>
      <div className="sportview-panel-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children}
    </article>
  );
}

function SportOverviewView({
  sportKey,
  config,
  bootstrap,
  rankings,
  scoreboard,
  featuredPlayers,
  predictors,
  news,
  openTeam,
  openPlayer,
  openGame,
  openStory,
  setPage,
}) {
  const copy = SPORT_VIEW_COPY[sportKey];
  const headlineGame = scoreboard[0] || null;
  const leadPredictor = predictors[0] || null;
  const leadStory = news[0] || null;

  if (!copy) {
    return (
      <section className="generic-stack">
        <article className="generic-card generic-overview-hero">
          <div>
            <p className="eyebrow">{config.label} Composite</p>
            <h2>{bootstrap?.headline || config.cardBlurb}</h2>
            <p>{config.introCopy}</p>
          </div>
          <div className="generic-metric-row">
            {metricChip('Live', bootstrap?.meta?.liveGames ?? 0)}
            {metricChip('Teams', bootstrap?.meta?.teamCount ?? rankings.length)}
            {metricChip('Players', bootstrap?.meta?.playerCountLabel ?? 'Roster crawl ready')}
          </div>
        </article>
        <div className="generic-overview-columns">
          <SportPanel title="Live Board" actionLabel="Open all" onAction={() => setPage('scores')}>
            <div className="generic-stack">
              {scoreboard.length ? (
                scoreboard.slice(0, 4).map((game) => (
                  <GameCard key={game.id} game={game} onOpen={openGame} />
                ))
              ) : (
                <p className="generic-empty-copy">No live or scheduled games are currently flowing through this board.</p>
              )}
            </div>
          </SportPanel>
          <SportPanel title="Top 10" actionLabel="Rankings" onAction={() => setPage('rankings')}>
            <div className="generic-rank-list">
              {rankings.length ? (
                rankings.slice(0, 10).map((team) => (
                  <button className="generic-rank-row" key={team.id} type="button" onClick={() => openTeam(team.id)}>
                    <span>#{team.ovrRank}</span>
                    <div className="generic-rank-team">
                      <TeamLogo team={team} />
                      <strong>{team.displayName}</strong>
                    </div>
                    <span>{team.ovrScore}</span>
                  </button>
                ))
              ) : (
                <p className="generic-empty-copy">Rankings are still syncing from the current standings and team metrics.</p>
              )}
            </div>
          </SportPanel>
        </div>
      </section>
    );
  }

  return (
    <section className={`sportview-shell sportview-shell-${sportKey}`}>
      <article className={`generic-card sportview-hero sportview-hero-${sportKey}`}>
        <div className="sportview-hero-copy">
          <p className="eyebrow">{copy.heroEyebrow}</p>
          <h2>{copy.heroTitle}</h2>
          <p>{copy.heroSummary}</p>
          <div className="sportview-chip-row">
            {metricChip('Live', bootstrap?.meta?.liveGames ?? 0)}
            {metricChip('Teams', bootstrap?.meta?.teamCount ?? rankings.length)}
            {metricChip('Players', bootstrap?.meta?.playerCountLabel ?? 'Roster crawl ready')}
          </div>
        </div>
        <div className="sportview-hero-side">
          {leadPredictor ? (
            <button className="sportview-spotlight" type="button" onClick={() => openGame(leadPredictor.gameId)}>
              <span className="sportview-spotlight-label">{copy.edgesTitle}</span>
              <strong>{leadPredictor.away.abbreviation} at {leadPredictor.home.abbreviation}</strong>
              <p>{leadPredictor.projectedAwayScore} - {leadPredictor.projectedHomeScore} • {leadPredictor.confidence}</p>
            </button>
          ) : null}
          {headlineGame ? (
            <button className="sportview-spotlight muted" type="button" onClick={() => openGame(headlineGame.id)}>
              <span className="sportview-spotlight-label">{copy.scoresTitle}</span>
              <strong>{headlineGame.away.abbreviation} at {headlineGame.home.abbreviation}</strong>
              <p>{headlineGame.statusLabel} • {headlineGame.broadcast || headlineGame.startLabel}</p>
            </button>
          ) : null}
          {leadStory ? (
            <button className="sportview-spotlight thin" type="button" onClick={() => openStory(leadStory, 'overview')}>
              <span className="sportview-spotlight-label">Storyline</span>
              <strong>{leadStory.headline}</strong>
              <p>{leadStory.description || 'Open ESPN story'}</p>
            </button>
          ) : null}
        </div>
      </article>

      <div className={`sportview-grid sportview-grid-${sportKey}`}>
        <SportPanel title={copy.scoresTitle} subtitle="Live board and scheduled slate" actionLabel="Open scores" onAction={() => setPage('scores')}>
          <div className="sportview-list">
            {scoreboard.length ? (
              scoreboard.slice(0, 5).map((game) => (
                <SportRow
                  key={game.id}
                  title={`${game.away.abbreviation} @ ${game.home.abbreviation}`}
                  subtitle={game.statusLabel}
                  onClick={() => openGame(game.id)}
                  value={<span className="sportview-scoreline">{game.away.score ?? '-'} : {game.home.score ?? '-'}</span>}
                >
                  <div className="sportview-scoreline">{game.away.score ?? '-'} : {game.home.score ?? '-'}</div>
                </SportRow>
              ))
            ) : (
              <p className="generic-empty-copy">The board is waiting on live or scheduled games.</p>
            )}
          </div>
        </SportPanel>

        <SportPanel title={copy.rankingsTitle} subtitle="Composite team order" actionLabel="Rankings" onAction={() => setPage('rankings')}>
          <div className="sportview-list">
            {rankings.length ? (
              rankings.slice(0, 8).map((team) => (
                <SportRow
                  key={team.id}
                  title={`#${team.ovrRank} ${team.displayName}`}
                  subtitle={`${team.record} • ${team.streak || 'Even'}`}
                  onClick={() => openTeam(team.id)}
                >
                  <div className="sportview-row-value">{team.ovrScore} OVR</div>
                </SportRow>
              ))
            ) : (
              <p className="generic-empty-copy">Rankings are still syncing.</p>
            )}
          </div>
        </SportPanel>

        <SportPanel title={copy.playersTitle} subtitle="Featured movers and leaders" actionLabel="Players" onAction={() => setPage('players')}>
          <div className="sportview-feature-grid">
            {featuredPlayers.length ? (
              featuredPlayers.slice(0, 6).map((player) => (
                <button className="sportview-feature-card" key={player.id} type="button" onClick={() => openPlayer(player.id)}>
                  <div className="generic-player-cell">
                    <PlayerVisual player={player} />
                    <div>
                      <strong>{player.displayName}</strong>
                      <span>{player.team?.abbreviation || player.position || config.label}</span>
                    </div>
                  </div>
                  <p>{player.leaderSummary || `${player.rating} OVR`}</p>
                </button>
              ))
            ) : (
              <p className="generic-empty-copy">Player features will populate after the roster crawl completes.</p>
            )}
          </div>
        </SportPanel>
      </div>

      <div className={`sportview-lower sportview-lower-${sportKey}`}>
        <SportPanel title={copy.edgesTitle} subtitle="Model leans" actionLabel="Predictor" onAction={() => setPage('predictor')} className="sportview-panel-wide">
          <PredictorRail predictors={predictors.slice(0, 4)} />
        </SportPanel>

        <SportPanel title="Trending News" subtitle="Latest ESPN feed">
          <div className="sportview-note-list">
            {news.length ? (
              news.slice(0, 4).map((story) => (
                <button className="sportview-note-link" type="button" onClick={() => openStory(story, 'overview')} key={story.id}>
                  <strong>{story.headline}</strong>
                  <span>{story.description || 'Open story'}</span>
                </button>
              ))
            ) : (
              <p className="generic-empty-copy">News feed is quiet right now.</p>
            )}
          </div>
        </SportPanel>
      </div>
    </section>
  );
}

function SportStoryDetailView({ story, onBack, onOpenRelated }) {
  return (
    <StoryDetailCard
      story={story}
      onBack={onBack}
      backLabel="Back to news"
      onOpenRelated={onOpenRelated}
    />
  );
}

function SportScoresView({ sportKey, scoreboard, predictors, openGame }) {
  const predictorMap = Object.fromEntries((predictors || []).map((game) => [game.gameId, game]));

  return (
    <section className={`sportview-shell sportview-scores-shell sportview-scores-shell-${sportKey}`}>
      <div className={`sportview-score-grid sportview-score-grid-${sportKey}`}>
        {scoreboard.length ? (
          scoreboard.map((game) => {
            const prediction = predictorMap[game.id];
            return (
              <button className={`generic-card sportview-score-card sportview-score-card-${sportKey}`} key={game.id} type="button" onClick={() => openGame(game.id)}>
                <div className="sportview-score-topline">
                  <span className={`generic-status-pill is-${game.state}`}>{game.statusLabel}</span>
                  <span>{game.broadcast || game.startLabel || 'ESPN'}</span>
                </div>
                <div className="sportview-score-teams">
                  {[game.away, game.home].map((team) => (
                    <div className="sportview-score-team" key={`${game.id}-${team.teamId}`}>
                      <div className="generic-score-team">
                        <TeamLogo team={team} />
                        <div>
                          <strong>{team.displayName}</strong>
                          <span>{team.record || team.abbreviation}</span>
                        </div>
                      </div>
                      <strong className="sportview-score-number">{team.score ?? '-'}</strong>
                    </div>
                  ))}
                </div>
                {prediction ? (
                  <div className="sportview-chip-row">
                    <span className="sportview-chip">Proj {prediction.projectedAwayScore}-{prediction.projectedHomeScore}</span>
                    <span className="sportview-chip">{prediction.confidence}</span>
                    <span className="sportview-chip">{prediction.home.abbreviation} {prediction.homeWinProbability}%</span>
                  </div>
                ) : null}
              </button>
            );
          })
        ) : (
          <article className="generic-card sportview-panel">
            <p className="generic-empty-copy">No live or scheduled games are currently available for this route.</p>
          </article>
        )}
      </div>
    </section>
  );
}

function SportTeamDetailView({ sportKey, config, teamDetail, openPlayer, setPage }) {
  const copy = SPORT_VIEW_COPY[sportKey];
  const recentLabel = sportKey === 'cbb' ? 'Recent Campus Run' : sportKey === 'nfl' ? 'Recent Sundays' : 'Recent Fixtures';
  const rosterLabel = sportKey === 'cbb' ? 'Rotation Board' : sportKey === 'nfl' ? 'Impact Depth Chart' : 'Matchday Core';

  return (
    <section className={`sportview-shell sportview-detail-shell sportview-detail-shell-${sportKey}`}>
      <button className="generic-back-button sportview-back" type="button" onClick={() => setPage('teams')}>
        Back to teams
      </button>
      <article className={`generic-card sportview-hero sportview-detail-hero sportview-detail-hero-${sportKey}`}>
        <div className="sportview-detail-brand">
          <TeamLogo team={teamDetail.team} />
          <div>
            <p className="eyebrow">{copy.teamStoryLabel}</p>
            <h2>{teamDetail.team.displayName}</h2>
            <p>{teamDetail.team.record} • #{teamDetail.team.ovrRank} OVR</p>
          </div>
        </div>
        <div className="sportview-chip-row">
          <span className="sportview-chip">OFF {teamDetail.team.offScore}</span>
          <span className="sportview-chip">DEF {teamDetail.team.defScore}</span>
          <span className="sportview-chip">{teamDetail.team.streak || 'Even'}</span>
        </div>
      </article>

      <div className="sportview-detail-grid">
        <SportPanel title={rosterLabel} subtitle="Top composite names on this team" className="sportview-panel-tall">
          <div className="sportview-list">
            {teamDetail.roster.slice(0, 16).map((player) => (
              <SportRow
                key={player.id}
                title={player.displayName}
                subtitle={`${player.position || 'Player'} • ${player.tier}`}
                onClick={() => openPlayer(player.id)}
              >
                <div className="sportview-row-value">{player.rating}</div>
              </SportRow>
            ))}
          </div>
        </SportPanel>

        <SportPanel title={recentLabel} subtitle="What the last stretch looks like">
          <div className="sportview-note-list">
            {(teamDetail.recent || []).length ? (
              teamDetail.recent.map((item, index) => (
                <div className="sportview-note-link static" key={`${item}-${index}`}>
                  <strong>{item}</strong>
                  <span>{config.label} board context</span>
                </div>
              ))
            ) : (
              <p className="generic-empty-copy">Recent results will appear once ESPN returns the team schedule payload.</p>
            )}
          </div>
        </SportPanel>

        <SportPanel title={copy.teamStoryLabel} subtitle="Composite summary">
          <p className="generic-empty-copy">
            {teamDetail.team.displayName} is sitting at #{teamDetail.team.ovrRank} on the {config.label} board with a {teamDetail.team.record} line,
            {` ${teamDetail.team.offScore} offense, ${teamDetail.team.defScore} defense, and ${teamDetail.team.streak || 'steady'} recent form.`}
          </p>
        </SportPanel>
      </div>
    </section>
  );
}

function SportPlayerDetailView({ sportKey, config, playerDetail, setPage, onBack }) {
  const copy = SPORT_VIEW_COPY[sportKey];

  return (
    <section className={`sportview-shell sportview-detail-shell sportview-detail-shell-${sportKey}`}>
      <button className="generic-back-button sportview-back" type="button" onClick={onBack || (() => setPage('players'))}>
        Back to players
      </button>
      <article className={`generic-card sportview-hero sportview-detail-hero sportview-detail-hero-${sportKey}`}>
        <div className="generic-player-hero">
          <PlayerVisual player={playerDetail.player} />
          <div>
            <p className="eyebrow">{copy.playerStoryLabel}</p>
            <h2>{playerDetail.player.displayName}</h2>
            <p>{playerDetail.player.team?.displayName} • {playerDetail.player.position || 'Player'}</p>
          </div>
          <div className="generic-player-rating-block">
            <strong>{playerDetail.player.rating}</strong>
            <span>{playerDetail.player.tier}</span>
          </div>
        </div>
        <p className="sportview-body-copy">{playerDetail.analysis}</p>
      </article>

      <div className="sportview-detail-grid">
        <SportPanel title="Signals" subtitle="Leaderboard context">
          <div className="sportview-chip-row">
            {(playerDetail.player.leaders || []).slice(0, 6).map((leader) => (
              <span className="sportview-chip" key={`${leader.label}-${leader.rank}`}>{leader.label} #{leader.rank}</span>
            ))}
          </div>
        </SportPanel>

        <SportPanel title="Stat Lines" subtitle="Latest athlete stat feed" className="sportview-panel-tall">
          <div className="sportview-note-list">
            {(playerDetail.stats || []).length ? (
              playerDetail.stats.map((stat) => (
                <div className="sportview-note-link static" key={`${stat.group}-${stat.label}`}>
                  <strong>{stat.label}</strong>
                  <span>{stat.group} • {stat.value}</span>
                </div>
              ))
            ) : (
              <p className="generic-empty-copy">Detailed athlete stats are still syncing from the ESPN endpoint.</p>
            )}
          </div>
        </SportPanel>
      </div>
    </section>
  );
}

function SportGameDetailView({ sportKey, gameDetail, setPage, predictors }) {
  const copy = SPORT_VIEW_COPY[sportKey];
  const predictor = (predictors || []).find((entry) => entry.gameId === gameDetail.game.id);

  return (
    <section className={`sportview-shell sportview-detail-shell sportview-detail-shell-${sportKey}`}>
      <button className="generic-back-button sportview-back" type="button" onClick={() => setPage('scores')}>
        Back to scores
      </button>
      <article className={`generic-card sportview-hero sportview-detail-hero sportview-detail-hero-${sportKey}`}>
        <div className="sportview-matchup">
          <div className="sportview-match-side">
            <TeamLogo team={gameDetail.game.away} />
            <div>
              <strong>{gameDetail.game.away.displayName}</strong>
              <span>{gameDetail.game.away.record || gameDetail.game.away.abbreviation}</span>
            </div>
          </div>
          <div className="sportview-match-center">
            <span className={`generic-status-pill is-${gameDetail.game.state}`}>{gameDetail.game.statusLabel}</span>
            <strong>{gameDetail.game.away.score ?? '-'} - {gameDetail.game.home.score ?? '-'}</strong>
          </div>
          <div className="sportview-match-side">
            <TeamLogo team={gameDetail.game.home} />
            <div>
              <strong>{gameDetail.game.home.displayName}</strong>
              <span>{gameDetail.game.home.record || gameDetail.game.home.abbreviation}</span>
            </div>
          </div>
        </div>
        <div className="sportview-chip-row">
          {gameDetail.venue ? <span className="sportview-chip">{gameDetail.venue}</span> : null}
          {gameDetail.location ? <span className="sportview-chip">{gameDetail.location}</span> : null}
          {gameDetail.broadcast ? <span className="sportview-chip">{gameDetail.broadcast}</span> : null}
          {predictor ? <span className="sportview-chip">Proj {predictor.projectedAwayScore}-{predictor.projectedHomeScore}</span> : null}
        </div>
        <p className="sportview-body-copy">{gameDetail.summary || `${copy.gameStoryLabel} is still syncing.`}</p>
      </article>

      <div className="sportview-detail-grid">
        <SportPanel title={copy.gameStoryLabel} subtitle="Live context and notes" className="sportview-panel-tall">
          <div className="sportview-note-list">
            {(gameDetail.notes || []).length ? (
              gameDetail.notes.map((note, index) => (
                <div className="sportview-note-link static" key={`${note}-${index}`}>
                  <strong>Board Note</strong>
                  <span>{note}</span>
                </div>
              ))
            ) : (
              <p className="generic-empty-copy">No additional match notes are available yet for this event.</p>
            )}
          </div>
        </SportPanel>

        <SportPanel title="Prediction Context" subtitle="If the board has a model read">
          {predictor ? (
            <div className="sportview-note-list">
              <div className="sportview-note-link static">
                <strong>{predictor.bettingLean || 'Model edge'}</strong>
                <span>{predictor.home.abbreviation} {predictor.homeWinProbability}% • {predictor.away.abbreviation} {predictor.awayWinProbability}%</span>
              </div>
              <div className="sportview-note-link static">
                <strong>Projected Score</strong>
                <span>{predictor.projectedAwayScore} - {predictor.projectedHomeScore} • Total {predictor.projectedTotal}</span>
              </div>
              {predictor.odds ? (
                <div className="sportview-note-link static">
                  <strong>{predictor.odds.provider || 'Market Context'}</strong>
                  <span>
                    {predictor.odds.homeMoneyline != null ? `ML ${predictor.odds.homeMoneyline > 0 ? '+' : ''}${predictor.odds.homeMoneyline}` : 'No ML'}
                    {predictor.odds.overUnder ? ` • O/U ${predictor.odds.overUnder}` : ''}
                  </span>
                </div>
              ) : null}
              {(predictor.explanation || []).slice(0, 2).map((note, index) => (
                <div className="sportview-note-link static" key={`${note}-${index}`}>
                  <strong>Why</strong>
                  <span>{note}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="generic-empty-copy">No current predictor card is attached to this matchup.</p>
          )}
        </SportPanel>
      </div>
    </section>
  );
}

export default function GenericSportApp({ sportKey, initialEntry = null, theme = 'dark', toggleTheme = () => {} }) {
  const config = getSportConfig(sportKey);
  const apiBase = `/api/${sportKey}`;
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
  const initialEntryHandledRef = useRef(false);

  async function fetchBootstrap() {
    try {
      const response = await fetch(`${apiBase}/bootstrap`);
      const data = await response.json();
      setBootstrap(data);
    } finally {
      setLoadingBootstrap(false);
    }
  }

  useEffect(() => {
    fetchBootstrap();
    const timer = setInterval(fetchBootstrap, 45000);
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
        const response = await fetch(`${apiBase}/players${query}`);
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

  async function openTeam(teamId) {
    const response = await fetch(`${apiBase}/teams/${teamId}`);
    const data = await response.json();
    setTeamDetail(data);
    setPage('team-detail');
    setMobileNavOpen(false);
  }

  async function openPlayer(playerId, options = {}) {
    const response = await fetch(`${apiBase}/players/${playerId}`);
    const data = await response.json();
    setHubOriginPlayer(Boolean(options.fromHub));
    setPlayerDetail(data);
    setPage('player-detail');
    setMobileNavOpen(false);
  }

  async function openGame(gameId) {
    const response = await fetch(`${apiBase}/games/${gameId}`);
    const data = await response.json();
    setGameDetail(data);
    setPage('game-detail');
    setMobileNavOpen(false);
  }

  async function openStory(story, fromPage = 'overview') {
    if (!story?.storyId) return;
    const response = await fetch(`${apiBase}/news/${story.storyId}?apiHref=${encodeURIComponent(story.apiHref || '')}`);
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
  const featuredPlayers = useMemo(() => bootstrap?.featuredPlayers || [], [bootstrap]);
  const scoreboard = useMemo(() => bootstrap?.scoreboard || [], [bootstrap]);
  const predictors = useMemo(() => bootstrap?.predictors || [], [bootstrap]);
  const news = useMemo(() => bootstrap?.news || [], [bootstrap]);

  function renderPage() {
    if (loadingBootstrap) {
      return (
        <section className="generic-loading">
          <p className="eyebrow">{config.label} Sync</p>
          <h2>Pulling live boards, standings, teams, and player signals.</h2>
        </section>
      );
    }

    switch (page) {
      case 'scores':
        return <SportScoresView sportKey={sportKey} scoreboard={scoreboard} predictors={predictors} openGame={openGame} />;
      case 'rankings':
        return <RankingsTable rankings={rankings} onOpenTeam={openTeam} />;
      case 'teams':
        return <TeamGrid teams={teams} onOpen={openTeam} />;
      case 'players':
        return (
          <PlayersTable
            players={playersData?.players || []}
            onOpen={openPlayer}
            query={playersQuery}
            onQueryChange={setPlayersQuery}
            loading={loadingPlayers}
          />
        );
      case 'predictor':
        return <PredictorRail predictors={predictors} />;
      case 'settings':
        return (
          <section className="generic-grid generic-settings-grid">
            <article className="generic-card">
              <h3>Route Notes</h3>
              <p>This first-pass {config.label} composite uses ESPN data, cached roster crawls, and leader-driven player ratings.</p>
            </article>
            <article className="generic-card">
              <h3>Refresh Window</h3>
              <p>Live boards repoll every 45 seconds. Player crawls reuse cached roster data to reduce overlap across sports.</p>
            </article>
          </section>
        );
      case 'team-detail':
        return teamDetail ? (
          <SportTeamDetailView sportKey={sportKey} config={config} teamDetail={teamDetail} openPlayer={openPlayer} setPage={setPage} />
        ) : null;
      case 'player-detail':
        return playerDetail ? (
          <SportPlayerDetailView
            sportKey={sportKey}
            config={config}
            playerDetail={playerDetail}
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
        return gameDetail ? (
          <SportGameDetailView sportKey={sportKey} gameDetail={gameDetail} setPage={setPage} predictors={predictors} />
        ) : null;
      case 'story-detail':
        return storyDetail ? (
          <SportStoryDetailView
            story={storyDetail}
            onBack={() => setPage(storyDetail.previousPage || 'overview')}
            onOpenRelated={(story) => openStory(story, storyDetail.previousPage || 'overview')}
          />
        ) : null;
      case 'overview':
      default:
        return (
          <SportOverviewView
            sportKey={sportKey}
            config={config}
            bootstrap={bootstrap}
            rankings={rankings}
            scoreboard={scoreboard}
            featuredPlayers={featuredPlayers}
            predictors={predictors}
            news={news}
            openTeam={openTeam}
            openPlayer={openPlayer}
            openGame={openGame}
            openStory={openStory}
            setPage={setPage}
          />
        );
    }
  }

  return (
    <section
      className={`generic-sport-shell sport-shell-${sportKey}`}
      style={{
        '--sport-accent': config.accent,
        '--sport-accent-alt': config.accentAlt,
        '--sport-surface': config.surface,
      }}
    >
      <button
        className={`generic-mobile-overlay ${mobileNavOpen ? 'is-open' : ''}`}
        type="button"
        aria-label="Close navigation"
        onClick={() => setMobileNavOpen(false)}
      />
      <aside className={`generic-sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="generic-brand">
          <span>{config.label}</span>
          <h2>{config.name}</h2>
        </div>
        <nav className="generic-nav">
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
        <div className="generic-sidebar-footer">
          <a href="/" className="generic-hub-link" target="_top">
            Back To Hub
          </a>
        </div>
      </aside>
      <div className="generic-stage">
        <header className="generic-stage-header">
          <div>
            <p className="eyebrow">{config.label} Composite</p>
            <h1>{NAV_ITEMS.find((item) => item.key === page)?.label || 'Detail View'}</h1>
          </div>
          <div className="generic-inline-stats">
            <span>{bootstrap?.lastUpdated ? `Updated ${new Date(bootstrap.lastUpdated).toLocaleTimeString()}` : 'Sync pending'}</span>
            <RouteThemeToggle theme={theme} onToggle={toggleTheme} compact />
            <button className="generic-menu-button" type="button" onClick={() => setMobileNavOpen((value) => !value)}>
              Menu
            </button>
            <button className="generic-refresh-button" type="button" onClick={fetchBootstrap}>
              Refresh
            </button>
          </div>
        </header>
        {renderPage()}
      </div>
    </section>
  );
}
