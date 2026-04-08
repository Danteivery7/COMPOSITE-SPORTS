'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import RouteSiteMenu from '@/src/components/RouteSiteMenu';
import StoryDetailCard from '@/src/components/StoryDetailCard';
import RouteThemeToggle from '@/src/components/RouteThemeToggle';
import { getFootballLeagueConfig } from '@/src/lib/football';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'scores', label: 'Scores' },
  { key: 'rankings', label: 'Rankings' },
  { key: 'teams', label: 'Teams' },
  { key: 'players', label: 'Players' },
  { key: 'predictor', label: 'Predictor' },
  { key: 'news', label: 'News' },
  { key: 'settings', label: 'Settings' },
];

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

function PlayerVisual({ player }) {
  if (!player?.headshot) {
    return <span className="football-logo-fallback">{player?.displayName?.slice(0, 2)?.toUpperCase() || 'PL'}</span>;
  }
  return (
    <img
      src={player.headshot}
      alt={player.displayName}
      className="football-player-headshot"
      onError={(event) => {
        if (event.currentTarget.dataset.fallbackApplied === '1') return;
        event.currentTarget.dataset.fallbackApplied = '1';
        event.currentTarget.src = 'https://a.espncdn.com/i/headshots/nophoto.png';
      }}
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

function FootballOverview({ bootstrap, openGame, openTeam, openPlayer, openStory, setPage }) {
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
            <span className="football-chip">{bootstrap.rankings?.length || 0} clubs tracked</span>
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
            <h3>Top Club</h3>
            <button type="button" onClick={() => topTeam && openTeam(topTeam.id)}>Open</button>
          </div>
          {topTeam ? (
            <button className="football-top-club" type="button" onClick={() => openTeam(topTeam.id)}>
              <TeamLogo team={topTeam} />
              <div>
                <strong>{topTeam.displayName}</strong>
                <span>#{topTeam.ovrRank} OVR</span>
                <FootballRecordLine record={topTeam.record} fallback={topTeam.abbreviation} />
                <p>{topTeam.recentFormLabel || topTeam.streak}</p>
              </div>
            </button>
          ) : (
            <p className="football-empty-copy">Top club is still syncing.</p>
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
                <span>{topPlayer.position} • {topPlayer.team?.abbreviation || bootstrap.league?.shortLabel}</span>
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
            <h3>Top Clubs</h3>
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
                    <span>{team.recentFormLabel || team.streak}</span>
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

function RankingsView({ rankings, openTeam }) {
  return (
    <div className="football-table-wrap">
      <table className="football-table">
        <thead>
          <tr>
            <th>RK</th>
            <th>Club</th>
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
                    <span>{team.recentFormLabel || team.streak}</span>
                  </div>
                </div>
              </td>
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
            <span className="football-chip">{team.recentFormLabel || team.streak}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function PlayersView({ players, query, setQuery, loading, openPlayer }) {
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
              <th>Club</th>
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

function PredictorView({ predictors }) {
  return (
    <div className="football-card-grid">
      {predictors.map((game) => (
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
            <span className="football-chip">{game.bettingLean || 'Model edge'}</span>
            {game.americanOdds != null ? <span className="football-chip">{game.americanOdds > 0 ? '+' : ''}{game.americanOdds}</span> : null}
          </div>
        </article>
      ))}
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
      backLabel="Back to news"
      onOpenRelated={onOpenRelated}
    />
  );
}

function TeamDetailView({ detail, openPlayer, setPage }) {
  return (
    <section className="football-stack">
      <button className="football-back-button" type="button" onClick={() => setPage('teams')}>
        Back to teams
      </button>
      <article className="football-panel football-detail-hero">
        <div className="football-row-team">
          <TeamLogo team={detail.team} />
          <div>
            <p className="eyebrow">Club Identity</p>
            <h2>{detail.team.displayName}</h2>
            <p>#{detail.team.ovrRank} OVR</p>
            <FootballRecordLine record={detail.team.record} fallback={detail.team.abbreviation} />
          </div>
        </div>
        <div className="football-chip-row">
          <span className="football-chip">OFF {detail.team.offScore}</span>
          <span className="football-chip">DEF {detail.team.defScore}</span>
          <span className="football-chip">{detail.team.recentFormLabel || detail.team.streak}</span>
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
                    <span>{player.position} • {player.tier}</span>
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
            <p>{detail.player.team?.displayName} • {detail.player.position}</p>
          </div>
        </div>
        <div className="football-chip-row">
          <span className="football-chip">{detail.player.rating} OVR</span>
          <span className="football-chip">{detail.player.tier}</span>
        </div>
        <p className="football-detail-copy">{detail.analysis}</p>
      </article>
      <article className="football-panel">
        <div className="football-section-head">
          <h3>Stat Feed</h3>
        </div>
        <div className="football-list">
          {(detail.stats || []).map((stat) => (
            <div className="football-row-button is-static" key={`${stat.group}-${stat.label}`}>
              <div>
                <strong>{stat.label}</strong>
                <span>{stat.group}</span>
              </div>
              <span>{stat.value}</span>
            </div>
          ))}
        </div>
      </article>
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
            <h3>Match Notes</h3>
          </div>
          <div className="football-list">
            {(detail.notes || []).map((note, index) => (
              <div className="football-row-button is-static" key={`${note}-${index}`}>
                <div>
                  <strong>Board Note</strong>
                  <span>{note}</span>
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
      </div>
    </section>
  );
}

export default function FootballLeagueApp({ leagueKey, initialEntry = null, theme = 'dark', toggleTheme = () => {} }) {
  const leagueConfig = getFootballLeagueConfig(leagueKey);
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
          <h2>Pulling match board, club power, player impact, and stories.</h2>
        </section>
      );
    }

    switch (page) {
      case 'scores':
        return <div className="football-card-grid">{(bootstrap?.scoreboard || []).map((game) => <GameCard key={game.id} game={game} onOpen={openGame} />)}</div>;
      case 'rankings':
        return <RankingsView rankings={rankings} openTeam={openTeam} />;
      case 'teams':
        return <TeamsView teams={teams} openTeam={openTeam} />;
      case 'players':
        return <PlayersView players={playersData?.players || []} query={playersQuery} setQuery={setPlayersQuery} loading={loadingPlayers} openPlayer={openPlayer} />;
      case 'predictor':
        return <PredictorView predictors={predictors} />;
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
          </div>
        );
      case 'team-detail':
        return teamDetail ? <TeamDetailView detail={teamDetail} openPlayer={openPlayer} setPage={setPage} /> : null;
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
        return <FootballOverview bootstrap={bootstrap} openGame={openGame} openTeam={openTeam} openPlayer={openPlayer} openStory={openStory} setPage={setPage} />;
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
          <Link href="/football" className="football-hub-link">
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
            <button className="football-refresh football-menu-button" type="button" onClick={() => setMobileNavOpen((value) => !value)}>
              Menu
            </button>
            <RouteSiteMenu theme={theme} onToggleTheme={toggleTheme} />
            <RouteThemeToggle theme={theme} onToggle={toggleTheme} compact />
            <button className="football-refresh" type="button" onClick={fetchBootstrap}>
              Refresh
            </button>
          </div>
        </header>
        {renderPage()}
      </div>
    </section>
  );
}
