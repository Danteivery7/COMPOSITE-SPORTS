'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSportConfig } from '@/src/data/sports';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'scores', label: 'Scores' },
  { key: 'rankings', label: 'Rankings' },
  { key: 'teams', label: 'Teams' },
  { key: 'players', label: 'Players' },
  { key: 'predictor', label: 'Predictor' },
  { key: 'settings', label: 'Settings' },
];

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
                    {player.headshot ? (
                      <img src={player.headshot} alt={player.displayName} className="generic-player-headshot" />
                    ) : (
                      <span className="generic-logo-fallback">{player.displayName.slice(0, 2).toUpperCase()}</span>
                    )}
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
        </article>
      ))}
    </div>
  );
}

export default function GenericSportApp({ sportKey }) {
  const config = getSportConfig(sportKey);
  const apiBase = `/api/${sportKey}`;
  const [page, setPage] = useState('overview');
  const [bootstrap, setBootstrap] = useState(null);
  const [playersData, setPlayersData] = useState(null);
  const [teamDetail, setTeamDetail] = useState(null);
  const [playerDetail, setPlayerDetail] = useState(null);
  const [gameDetail, setGameDetail] = useState(null);
  const [playersQuery, setPlayersQuery] = useState('');
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

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
  }, [apiBase, page, playersQuery]);

  async function openTeam(teamId) {
    const response = await fetch(`${apiBase}/teams/${teamId}`);
    const data = await response.json();
    setTeamDetail(data);
    setPage('team-detail');
  }

  async function openPlayer(playerId) {
    const response = await fetch(`${apiBase}/players/${playerId}`);
    const data = await response.json();
    setPlayerDetail(data);
    setPage('player-detail');
  }

  async function openGame(gameId) {
    const response = await fetch(`${apiBase}/games/${gameId}`);
    const data = await response.json();
    setGameDetail(data);
    setPage('game-detail');
  }

  const rankings = useMemo(() => bootstrap?.rankings || [], [bootstrap]);
  const teams = useMemo(() => bootstrap?.teams || [], [bootstrap]);
  const featuredPlayers = useMemo(() => bootstrap?.featuredPlayers || [], [bootstrap]);
  const scoreboard = useMemo(() => bootstrap?.scoreboard || [], [bootstrap]);
  const predictors = useMemo(() => bootstrap?.predictors || [], [bootstrap]);

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
        return (
          <div className="generic-grid generic-score-grid">
            {scoreboard.map((game) => (
              <GameCard key={game.id} game={game} onOpen={openGame} />
            ))}
          </div>
        );
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
          <section className="generic-detail">
            <button className="generic-back-button" type="button" onClick={() => setPage('teams')}>
              Back to teams
            </button>
            <article className="generic-card generic-detail-hero">
              <div className="generic-detail-head">
                <TeamLogo team={teamDetail.team} />
                <div>
                  <h2>{teamDetail.team.displayName}</h2>
                  <p>{teamDetail.team.record} • #{teamDetail.team.ovrRank} OVR</p>
                </div>
              </div>
              <div className="generic-inline-stats">
                <span>OFF {teamDetail.team.offScore}</span>
                <span>DEF {teamDetail.team.defScore}</span>
                <span>{teamDetail.team.streak || 'Even'}</span>
              </div>
            </article>
            <article className="generic-card">
              <h3>Roster Board</h3>
              <div className="generic-detail-list">
                {teamDetail.roster.slice(0, 24).map((player) => (
                  <button className="generic-detail-row" key={player.id} type="button" onClick={() => openPlayer(player.id)}>
                    <span>{player.displayName}</span>
                    <span>{player.position || '-'}</span>
                    <strong>{player.rating}</strong>
                  </button>
                ))}
              </div>
            </article>
          </section>
        ) : null;
      case 'player-detail':
        return playerDetail ? (
          <section className="generic-detail">
            <button className="generic-back-button" type="button" onClick={() => setPage('players')}>
              Back to players
            </button>
            <article className="generic-card generic-detail-hero">
              <div className="generic-player-hero">
                {playerDetail.player.headshot ? (
                  <img
                    src={playerDetail.player.headshot}
                    alt={playerDetail.player.displayName}
                    className="generic-player-hero-img"
                  />
                ) : (
                  <span className="generic-logo-fallback">{playerDetail.player.displayName.slice(0, 2).toUpperCase()}</span>
                )}
                <div>
                  <h2>{playerDetail.player.displayName}</h2>
                  <p>{playerDetail.player.team?.displayName} • {playerDetail.player.position || 'Player'}</p>
                </div>
                <div className="generic-player-rating-block">
                  <strong>{playerDetail.player.rating}</strong>
                  <span>{playerDetail.player.tier}</span>
                </div>
              </div>
              <p>{playerDetail.analysis}</p>
            </article>
            <article className="generic-card">
              <h3>Signals</h3>
              <div className="generic-inline-stats">
                {(playerDetail.player.leaders || []).slice(0, 6).map((leader) => (
                  <span key={`${leader.label}-${leader.rank}`}>{leader.label} #{leader.rank}</span>
                ))}
              </div>
            </article>
            <article className="generic-card">
              <h3>Stat Lines</h3>
              <div className="generic-detail-list">
                {(playerDetail.stats || []).map((stat) => (
                  <div className="generic-detail-row static" key={`${stat.group}-${stat.label}`}>
                    <span>{stat.group}</span>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null;
      case 'game-detail':
        return gameDetail ? (
          <section className="generic-detail">
            <button className="generic-back-button" type="button" onClick={() => setPage('scores')}>
              Back to scores
            </button>
            <article className="generic-card generic-detail-hero">
              <div className="generic-matchup-head">
                <div>
                  <strong>{gameDetail.game.away.displayName}</strong>
                  <span>{gameDetail.game.away.score ?? '-'}</span>
                </div>
                <span className={`generic-status-pill is-${gameDetail.game.state}`}>{gameDetail.game.statusLabel}</span>
                <div>
                  <strong>{gameDetail.game.home.displayName}</strong>
                  <span>{gameDetail.game.home.score ?? '-'}</span>
                </div>
              </div>
              <p>{gameDetail.summary || 'Live matchup summary unavailable.'}</p>
            </article>
            <article className="generic-card">
              <h3>Leaders & Notes</h3>
              <div className="generic-detail-list">
                {(gameDetail.notes || []).map((note, index) => (
                  <div className="generic-detail-row static" key={`${note}-${index}`}>
                    <span>Note</span>
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null;
      case 'overview':
      default:
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
                {metricChip('Teams', bootstrap?.meta?.teamCount ?? teams.length)}
                {metricChip('Players', bootstrap?.meta?.playerCountLabel ?? 'Roster crawl ready')}
              </div>
            </article>
            <div className="generic-overview-columns">
              <article className="generic-card">
                <div className="generic-card-head">
                  <h3>Live Board</h3>
                  <button type="button" onClick={() => setPage('scores')}>
                    Open all
                  </button>
                </div>
                <div className="generic-stack">
                  {scoreboard.length ? (
                    scoreboard.slice(0, 4).map((game) => (
                      <GameCard key={game.id} game={game} onOpen={openGame} />
                    ))
                  ) : (
                    <p className="generic-empty-copy">No live or scheduled games are currently flowing through this board.</p>
                  )}
                </div>
              </article>
              <article className="generic-card">
                <div className="generic-card-head">
                  <h3>Top 10</h3>
                  <button type="button" onClick={() => setPage('rankings')}>
                    Rankings
                  </button>
                </div>
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
              </article>
            </div>
            <article className="generic-card">
              <div className="generic-card-head">
                <h3>Featured Players</h3>
                <button type="button" onClick={() => setPage('players')}>
                  Full board
                </button>
              </div>
              <div className="generic-grid generic-feature-grid">
                {featuredPlayers.length ? (
                  featuredPlayers.map((player) => (
                    <button className="generic-card generic-feature-card" key={player.id} type="button" onClick={() => openPlayer(player.id)}>
                      <div className="generic-player-cell">
                        {player.headshot ? (
                          <img src={player.headshot} alt={player.displayName} className="generic-player-headshot" />
                        ) : (
                          <span className="generic-logo-fallback">{player.displayName.slice(0, 2).toUpperCase()}</span>
                        )}
                        <div>
                          <strong>{player.displayName}</strong>
                          <span>{player.team?.abbreviation || player.position || config.label}</span>
                        </div>
                      </div>
                      <p>{player.leaderSummary || `${player.rating} OVR`}</p>
                    </button>
                  ))
                ) : (
                  <p className="generic-empty-copy">Open the full players board to kick off the roster-wide crawl for this sport.</p>
                )}
              </div>
            </article>
            <article className="generic-card">
              <div className="generic-card-head">
                <h3>Predictor Rail</h3>
                <button type="button" onClick={() => setPage('predictor')}>
                  Open predictor
                </button>
              </div>
              <PredictorRail predictors={predictors.slice(0, 4)} />
            </article>
          </section>
        );
    }
  }

  return (
    <section
      className="generic-sport-shell"
      style={{
        '--sport-accent': config.accent,
        '--sport-accent-alt': config.accentAlt,
        '--sport-surface': config.surface,
      }}
    >
      <aside className="generic-sidebar">
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
              onClick={() => setPage(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="generic-stage">
        <header className="generic-stage-header">
          <div>
            <p className="eyebrow">{config.label} Composite</p>
            <h1>{NAV_ITEMS.find((item) => item.key === page)?.label || 'Detail View'}</h1>
          </div>
          <div className="generic-inline-stats">
            <span>{bootstrap?.lastUpdated ? `Updated ${new Date(bootstrap.lastUpdated).toLocaleTimeString()}` : 'Sync pending'}</span>
            <button type="button" onClick={fetchBootstrap}>
              Refresh
            </button>
          </div>
        </header>
        {renderPage()}
      </div>
    </section>
  );
}
