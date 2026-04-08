'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import StoryDetailCard from '@/src/components/StoryDetailCard';

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

function TeamLogo({ team }) {
  if (!team?.logo) {
    return <span className="generic-logo-fallback">{team?.abbreviation?.slice(0, 3) || 'TM'}</span>;
  }
  return <img src={team.logo} alt={team.displayName} className="generic-team-logo" />;
}

function PlayerHeadshot({ player }) {
  if (!player?.headshot) {
    return <span className="generic-logo-fallback">{player?.displayName?.slice(0, 2)?.toUpperCase() || 'PL'}</span>;
  }
  return <img src={player.headshot} alt={player.displayName} className="generic-player-headshot" />;
}

function formatUpdateTime(value) {
  if (!value) return 'Sync pending';
  return `Updated ${new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function ResumePill({ label, value, accent = false }) {
  return (
    <span className={`cbb-pill ${accent ? 'is-accent' : ''}`}>
      <strong>{label}</strong>
      <span>{value}</span>
    </span>
  );
}

function NewsCard({ story, onOpen, fromPage = 'news' }) {
  return (
    <button className="generic-card cbb-news-card" type="button" onClick={() => onOpen(story, fromPage)}>
      {story?.image ? <img src={story.image} alt={story.headline} className="cbb-news-image" /> : null}
      <div className="cbb-news-copy">
        <span>{story?.source || 'ESPN'} • {story?.published ? new Date(story.published).toLocaleDateString() : 'Live'}</span>
        <strong>{story.headline}</strong>
        <p>{story.description || story.summary || 'Open story'}</p>
      </div>
    </button>
  );
}

function ScoreCard({ game, prediction, onOpen }) {
  return (
    <button className="generic-card cbb-score-card" type="button" onClick={() => onOpen(game.id)}>
      <div className="cbb-score-card-top">
        <span className={`generic-status-pill is-${game.state}`}>{game.statusLabel}</span>
        <span>{game.broadcast || game.startLabel || 'ESPN'}</span>
      </div>
      <div className="cbb-score-card-teams">
        {[game.away, game.home].map((team) => (
          <div className="cbb-score-row" key={`${game.id}-${team.teamId}`}>
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
        <div className="cbb-card-footer">
          <ResumePill label="Proj" value={`${prediction.projectedAwayScore}-${prediction.projectedHomeScore}`} accent />
          <ResumePill label="Win %" value={`${prediction.home.abbreviation} ${prediction.homeWinProbability}%`} />
        </div>
      ) : null}
    </button>
  );
}

function HeroScoreTile({ game, prediction, onOpen }) {
  return (
    <button className="cbb-hero-score-tile" type="button" onClick={() => onOpen(game.id)}>
      <div className="cbb-hero-score-top">
        <span className={`generic-status-pill is-${game.state}`}>{game.statusLabel}</span>
        <span>{game.startLabel || game.broadcast || 'Today'}</span>
      </div>
      {[game.away, game.home].map((team) => (
        <div className="cbb-hero-score-row" key={`${game.id}-${team.teamId}`}>
          <div className="generic-score-team">
            <TeamLogo team={team} />
            <div>
              <strong>{team.abbreviation || team.displayName}</strong>
              <span>{team.record || team.displayName}</span>
            </div>
          </div>
          <strong className="sportview-score-number">{team.score ?? '-'}</strong>
        </div>
      ))}
      {prediction ? (
        <div className="cbb-hero-score-foot">
          <span>Proj {prediction.projectedAwayScore}-{prediction.projectedHomeScore}</span>
          <strong>{prediction.bettingLean}</strong>
        </div>
      ) : null}
    </button>
  );
}

function RankingsTable({ rankings, onOpenTeam }) {
  return (
    <div className="generic-table-wrap">
      <table className="generic-table cbb-rankings-table">
        <thead>
          <tr>
            <th>RK</th>
            <th>Team</th>
            <th>Avg</th>
            <th>OFF</th>
            <th>DEF</th>
            <th>AP</th>
            <th>NET</th>
            <th>Record</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((team) => (
            <tr key={team.id} onClick={() => onOpenTeam(team.id)}>
              <td>{team.compositeRank}</td>
              <td>
                <div className="generic-table-team">
                  <TeamLogo team={team} />
                  <div>
                    <strong>{team.displayName}</strong>
                    <span>{team.conference}</span>
                  </div>
                </div>
              </td>
              <td>{team.avgRank}</td>
              <td>{team.offRank}</td>
              <td>{team.defRank}</td>
              <td>{team.apRank <= 25 ? team.apRank : 'UR'}</td>
              <td>{team.netRank}</td>
              <td>{team.record}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamDirectory({ teams, query, onQueryChange, onOpen }) {
  const filtered = query
    ? teams.filter((team) => {
        const haystack = [team.displayName, team.abbreviation, team.conference].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query.toLowerCase());
      })
    : teams;

  return (
    <section className="generic-stack">
      <div className="generic-controls">
        <input
          className="generic-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search every school"
        />
        <span>{filtered.length} schools</span>
      </div>
      <div className="cbb-team-grid">
        {filtered.map((team) => (
          <button className="generic-card cbb-team-card" key={team.id} type="button" onClick={() => onOpen(team.id)}>
            <div className="cbb-team-card-head">
              <TeamLogo team={team} />
              <div>
                <h3>{team.displayName}</h3>
                <p>{team.conference}</p>
              </div>
            </div>
            <div className="cbb-card-footer">
              <ResumePill label="Avg" value={team.avgRank} accent />
              <ResumePill label="Record" value={team.record} />
              <ResumePill label="Trend" value={team.trend} />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function PlayerBoard({ players, query, onQueryChange, loading, onOpen }) {
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
              <th>Profile</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id} onClick={() => onOpen(player.id)}>
                <td>{player.rank}</td>
                <td>
                  <div className="generic-player-cell">
                    <PlayerHeadshot player={player} />
                    <div>
                      <strong>{player.displayName}</strong>
                      <span>{player.classYear || player.team?.conference || 'CBB'}</span>
                    </div>
                  </div>
                </td>
                <td>{player.team?.abbreviation || '-'}</td>
                <td>{player.position || '-'}</td>
                <td>{player.rating}</td>
                <td>{player.usageSummary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PredictorView({ teams, predictors, manualPrediction, loading, selection, onSelect, onRun }) {
  return (
    <section className="cbb-predictor-layout">
      <article className="generic-card cbb-predictor-builder">
        <div className="sportview-panel-head">
          <div>
            <h3>Ivery-Simmons Predictor</h3>
            <p>Select any two schools for a projected winner, score, and edge.</p>
          </div>
        </div>
        <div className="cbb-predictor-form">
          <label>
            Away
            <select value={selection.awayTeamId} onChange={(event) => onSelect('awayTeamId', event.target.value)}>
              <option value="">Select away team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Home
            <select value={selection.homeTeamId} onChange={(event) => onSelect('homeTeamId', event.target.value)}>
              <option value="">Select home team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.displayName}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={onRun} disabled={loading || !selection.awayTeamId || !selection.homeTeamId}>
            {loading ? 'Running model...' : 'Run matchup'}
          </button>
        </div>
        {manualPrediction ? (
          <div className="cbb-manual-result">
            <div className="cbb-manual-scoreline">
              <strong>{manualPrediction.away.displayName}</strong>
              <span>{manualPrediction.projectedAwayScore}</span>
            </div>
            <div className="cbb-manual-scoreline">
              <strong>{manualPrediction.home.displayName}</strong>
              <span>{manualPrediction.projectedHomeScore}</span>
            </div>
            <div className="cbb-card-footer">
              <ResumePill label="Winner" value={manualPrediction.winnerTeamId === manualPrediction.home.teamId ? manualPrediction.home.abbreviation : manualPrediction.away.abbreviation} accent />
              <ResumePill label="Win %" value={`${manualPrediction.home.abbreviation} ${manualPrediction.homeWinProbability}%`} />
              <ResumePill label="Lean" value={manualPrediction.bettingLean} />
            </div>
            <div className="sportview-note-list">
              {(manualPrediction.explanation || []).map((line, index) => (
                <div className="sportview-note-link static" key={`${line}-${index}`}>
                  <strong>Model read</strong>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </article>
      <article className="generic-card sportview-panel">
        <div className="sportview-panel-head">
          <div>
            <h3>Today’s predictor slate</h3>
            <p>Composite leans for the live and upcoming board.</p>
          </div>
        </div>
        <div className="sportview-note-list">
          {predictors.slice(0, 8).map((game) => (
            <div className="sportview-note-link static" key={game.gameId}>
              <strong>
                {game.away.abbreviation} at {game.home.abbreviation}
              </strong>
              <span>
                {game.projectedAwayScore}-{game.projectedHomeScore} • {game.bettingLean} • {game.confidence}
              </span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function Overview({
  bootstrap,
  openGame,
  openTeam,
  openPlayer,
  openStory,
  setPage,
}) {
  const scoreboard = bootstrap.scoreboard || [];
  const predictions = bootstrap.predictors || [];
  const predictionMap = Object.fromEntries(predictions.map((entry) => [entry.gameId, entry]));
  const topPlayers = bootstrap.topPlayers || bootstrap.featuredPlayers?.slice(0, 3) || [];
  const leadStory = bootstrap.news?.[0] || null;
  const heroGames = scoreboard.slice(0, 2);

  return (
    <section className="cbb-shell">
      <article className="generic-card cbb-hero">
        <div className="cbb-hero-copy">
          <p className="eyebrow">Campus Court</p>
          <h2>{bootstrap.headline || 'Composite College Basketball'}</h2>
          <div className="cbb-card-footer">
            <ResumePill label="Teams" value={bootstrap.meta?.teamCount || 0} accent />
            <ResumePill label="Players" value={bootstrap.playersCatalog?.players?.length || 0} />
            <ResumePill label="Sources" value="6" />
          </div>
          {heroGames.length ? (
            <div className="cbb-hero-score-grid">
              {heroGames.map((game) => (
                <HeroScoreTile key={game.id} game={game} prediction={predictionMap[game.id]} onOpen={openGame} />
              ))}
            </div>
          ) : null}
        </div>
        <div className="cbb-hero-side">
          {leadStory?.image ? (
            <button className="cbb-hero-visual" type="button" onClick={() => openStory(leadStory, 'overview')}>
              <img src={leadStory.image} alt={leadStory.headline} className="cbb-hero-visual-image" />
              <div className="cbb-hero-visual-copy">
                <span>{leadStory.source || 'CBB News'}</span>
                <strong>{leadStory.headline}</strong>
              </div>
            </button>
          ) : null}
          <button className="cbb-hero-note" type="button" onClick={() => setPage('rankings')}>
            <span>Resume Board</span>
            <strong>AP, NET, Haslametrics, and the live six-source composite when the dedicated backend feed is available.</strong>
          </button>
          <button className="cbb-hero-note" type="button" onClick={() => setPage('predictor')}>
            <span>Upset Watch</span>
            <strong>Model reads built from scoring shape, defensive pressure, and real resume context.</strong>
          </button>
        </div>
      </article>

      <article className="generic-card sportview-panel">
        <div className="sportview-panel-head">
          <div>
            <h3>Top 3 Players In The Sport Right Now</h3>
            <p>Live board leaders based on the current CBB overall model.</p>
          </div>
          <button type="button" onClick={() => setPage('players')}>
            Full player board
          </button>
        </div>
        <div className="cbb-top-player-grid">
          {topPlayers.map((player) => (
            <button className="cbb-top-player-card" key={player.id} type="button" onClick={() => openPlayer(player.id)}>
              <PlayerHeadshot player={player} />
              <div>
                <span>{player.team?.abbreviation || 'CBB'} • {player.position || 'Player'}</span>
                <strong>{player.displayName}</strong>
                <p>{player.usageSummary}</p>
              </div>
              <b>{player.rating}</b>
            </button>
          ))}
        </div>
      </article>

      <div className="cbb-overview-grid">
        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>Campus Pulse</h3>
              <p>Live, starting soon, and finals from the full D-I board.</p>
            </div>
            <button type="button" onClick={() => setPage('scores')}>
              Open scores
            </button>
          </div>
          <div className="cbb-score-grid">
            {scoreboard.slice(0, 4).map((game) => (
              <ScoreCard key={game.id} game={game} prediction={predictionMap[game.id]} onOpen={openGame} />
            ))}
          </div>
        </article>

        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>Resume Board</h3>
              <p>Top teams with real source rank context and current record.</p>
            </div>
            <button type="button" onClick={() => setPage('rankings')}>
              Rankings
            </button>
          </div>
          <div className="sportview-note-list">
            {bootstrap.rankings.slice(0, 8).map((team) => (
              <button className="sportview-row" key={team.id} type="button" onClick={() => openTeam(team.id)}>
                <div className="sportview-row-head">
                  <strong>#{team.compositeRank} {team.displayName}</strong>
                  <span>{team.conference} • {team.record}</span>
                </div>
                <div className="sportview-row-value">{team.avgRank}</div>
              </button>
            ))}
          </div>
        </article>

        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>News Desk</h3>
              <p>The biggest live CBB stories, with art and in-site reading.</p>
            </div>
            <button type="button" onClick={() => setPage('news')}>
              News
            </button>
          </div>
          <div className="cbb-news-grid compact">
            {(bootstrap.news || []).slice(0, 2).map((story) => (
              <NewsCard key={story.id} story={story} onOpen={openStory} fromPage="overview" />
            ))}
          </div>
        </article>
      </div>

      <div className="cbb-lower-grid">
        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>Bubble Watch</h3>
              <p>Resume pressure, at-large texture, and schools moving fastest.</p>
            </div>
          </div>
          <div className="sportview-note-list">
            {bootstrap.rankings.slice(18, 24).map((team) => (
              <div className="sportview-note-link static" key={team.id}>
                <strong>{team.displayName}</strong>
                <span>
                  Avg {team.avgRank} • OFF {team.offRank} • DEF {team.defRank} • {team.trend}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>Tournament Risers</h3>
              <p>The strongest player board movers right now.</p>
            </div>
          </div>
          <div className="cbb-player-feature-grid">
            {bootstrap.featuredPlayers.slice(0, 4).map((player) => (
              <button className="sportview-feature-card" key={player.id} type="button" onClick={() => openPlayer(player.id)}>
                <div className="generic-player-cell">
                  <PlayerHeadshot player={player} />
                  <div>
                    <strong>{player.displayName}</strong>
                    <span>{player.team?.abbreviation} • {player.position || 'Player'}</span>
                  </div>
                </div>
                <p>{player.rating} OVR • {player.usageSummary}</p>
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function TeamDetail({ teamDetail, openPlayer, onBack }) {
  return (
    <section className="cbb-shell">
      <button className="generic-back-button sportview-back" type="button" onClick={onBack}>
        Back to teams
      </button>
      <article className="generic-card cbb-detail-hero">
        <div className="sportview-detail-brand">
          <TeamLogo team={teamDetail.team} />
          <div>
            <p className="eyebrow">Resume Read</p>
            <h2>{teamDetail.team.displayName}</h2>
            <p>{teamDetail.team.conference} • {teamDetail.team.record} • Avg {teamDetail.team.avgRank}</p>
          </div>
        </div>
        <div className="cbb-card-footer">
          <ResumePill label="OFF" value={teamDetail.team.offRank} accent />
          <ResumePill label="DEF" value={teamDetail.team.defRank} />
          <ResumePill label="Trend" value={teamDetail.team.trend} />
          <ResumePill label="Streak" value={teamDetail.team.streak} />
        </div>
      </article>

      <div className="cbb-detail-grid">
        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>Composite profile</h3>
              <p>Source-by-source resume context.</p>
            </div>
          </div>
          <div className="cbb-source-grid">
            {Object.entries(teamDetail.compositeProfile.sourceRanks || {}).map(([key, value]) => (
              <div className="cbb-source-card" key={key}>
                <strong>{key.toUpperCase()}</strong>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>Last 5 games</h3>
              <p>Fresh from the ESPN schedule feed.</p>
            </div>
          </div>
          <div className="sportview-note-list">
            {(teamDetail.recent || []).length ? (
              teamDetail.recent.map((item) => (
                <div className="sportview-note-link static" key={`${item.date}-${item.label}`}>
                  <strong>{item.result} vs {item.opponentName}</strong>
                  <span>{item.score} • {new Date(item.date).toLocaleDateString()}</span>
                </div>
              ))
            ) : (
              <p className="generic-empty-copy">Recent results are still syncing for this team.</p>
            )}
          </div>
        </article>

        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>Team leaders</h3>
              <p>Highest-rated names in the current board.</p>
            </div>
          </div>
          <div className="sportview-note-list">
            {(teamDetail.leaders || []).length ? (
              teamDetail.leaders.map((player) => (
                <button className="sportview-row" key={player.id} type="button" onClick={() => openPlayer(player.id)}>
                  <div className="sportview-row-head">
                    <strong>{player.displayName}</strong>
                    <span>{player.position || 'Player'} • {player.usageSummary}</span>
                  </div>
                  <div className="sportview-row-value">{player.rating}</div>
                </button>
              ))
            ) : (
              <p className="generic-empty-copy">Leader board is still syncing for this roster.</p>
            )}
          </div>
        </article>

        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>Rotation board</h3>
              <p>Official roster with player ratings.</p>
            </div>
          </div>
          <div className="sportview-note-list">
            {teamDetail.roster.slice(0, 16).map((player) => (
              <button className="sportview-row" key={player.id} type="button" onClick={() => openPlayer(player.id)}>
                <div className="sportview-row-head">
                  <strong>{player.displayName}</strong>
                  <span>{player.position || 'Player'} • {player.tier}</span>
                </div>
                <div className="sportview-row-value">{player.rating}</div>
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function PlayerDetail({ playerDetail, onBack }) {
  return (
    <section className="cbb-shell">
      <button className="generic-back-button sportview-back" type="button" onClick={onBack}>
        Back to players
      </button>
      <article className="generic-card cbb-detail-hero">
        <div className="generic-player-hero">
          <PlayerHeadshot player={playerDetail.player} />
          <div>
            <p className="eyebrow">Prospect Pulse</p>
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

      <div className="cbb-detail-grid">
        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>Usage profile</h3>
              <p>Role and board context.</p>
            </div>
          </div>
          <div className="cbb-card-footer">
            <ResumePill label="Team" value={playerDetail.player.team?.abbreviation || 'CBB'} accent />
            <ResumePill label="Pos" value={playerDetail.player.position || 'Player'} />
            <ResumePill label="Profile" value={playerDetail.player.usageSummary} />
          </div>
        </article>

        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>Season stat lines</h3>
              <p>Latest athlete stat feed.</p>
            </div>
          </div>
          <div className="sportview-note-list">
            {(playerDetail.stats || []).length ? (
              playerDetail.stats.map((stat) => (
                <div className="sportview-note-link static" key={`${stat.group}-${stat.label}`}>
                  <strong>{stat.label}</strong>
                  <span>{stat.group} • {stat.value}</span>
                </div>
              ))
            ) : (
              <p className="generic-empty-copy">Detailed athlete stats are still syncing.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

function GameDetail({ gameDetail, predictor, onBack }) {
  return (
    <section className="cbb-shell">
      <button className="generic-back-button sportview-back" type="button" onClick={onBack}>
        Back to scores
      </button>
      <article className="generic-card cbb-detail-hero">
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
        <div className="cbb-card-footer">
          {gameDetail.venue ? <ResumePill label="Venue" value={gameDetail.venue} accent /> : null}
          {gameDetail.broadcast ? <ResumePill label="TV" value={gameDetail.broadcast} /> : null}
          {predictor ? <ResumePill label="Proj" value={`${predictor.projectedAwayScore}-${predictor.projectedHomeScore}`} /> : null}
        </div>
      </article>
      <div className="cbb-detail-grid">
        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>Game notes</h3>
              <p>{gameDetail.summary}</p>
            </div>
          </div>
          <div className="sportview-note-list">
            {(gameDetail.notes || []).length ? (
              gameDetail.notes.map((note, index) => (
                <div className="sportview-note-link static" key={`${note}-${index}`}>
                  <strong>Board note</strong>
                  <span>{note}</span>
                </div>
              ))
            ) : (
              <p className="generic-empty-copy">No additional notes are available yet.</p>
            )}
          </div>
        </article>
        <article className="generic-card sportview-panel">
          <div className="sportview-panel-head">
            <div>
              <h3>Prediction context</h3>
              <p>The same predictor logic powers the matchup board.</p>
            </div>
          </div>
          {predictor ? (
            <div className="sportview-note-list">
              <div className="sportview-note-link static">
                <strong>{predictor.bettingLean}</strong>
                <span>
                  {predictor.home.abbreviation} {predictor.homeWinProbability}% • {predictor.away.abbreviation} {predictor.awayWinProbability}%
                </span>
              </div>
              {(predictor.explanation || []).map((line, index) => (
                <div className="sportview-note-link static" key={`${line}-${index}`}>
                  <strong>Why</strong>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="generic-empty-copy">This matchup does not have a predictor card attached yet.</p>
          )}
        </article>
      </div>
    </section>
  );
}

export default function CBBApp({ initialEntry = null }) {
  const apiBase = '/api/cbb';
  const [page, setPage] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bootstrap, setBootstrap] = useState(null);
  const [playersData, setPlayersData] = useState(null);
  const [teamDetail, setTeamDetail] = useState(null);
  const [playerDetail, setPlayerDetail] = useState(null);
  const [gameDetail, setGameDetail] = useState(null);
  const [storyDetail, setStoryDetail] = useState(null);
  const [teamsQuery, setTeamsQuery] = useState('');
  const [playersQuery, setPlayersQuery] = useState('');
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadingPredictor, setLoadingPredictor] = useState(false);
  const [manualPrediction, setManualPrediction] = useState(null);
  const [selection, setSelection] = useState({ awayTeamId: '', homeTeamId: '' });
  const [hubOriginPlayer, setHubOriginPlayer] = useState(false);
  const initialEntryHandledRef = useRef(false);

  async function fetchBootstrap(force = false) {
    try {
      const response = await fetch(`${apiBase}/bootstrap${force ? '?force=1' : ''}`);
      const data = await response.json();
      setBootstrap(data);
    } finally {
      setLoadingBootstrap(false);
    }
  }

  useEffect(() => {
    fetchBootstrap();
    const timer = setInterval(() => fetchBootstrap(), 30_000);
    return () => clearInterval(timer);
  }, []);

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
  }, [page, playersQuery, bootstrap]);

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

  async function runManualPredictor() {
    if (!selection.awayTeamId || !selection.homeTeamId) return;
    setLoadingPredictor(true);
    try {
      const response = await fetch(
        `${apiBase}/predictor?awayTeamId=${encodeURIComponent(selection.awayTeamId)}&homeTeamId=${encodeURIComponent(selection.homeTeamId)}`,
      );
      const data = await response.json();
      setManualPrediction(data);
    } finally {
      setLoadingPredictor(false);
    }
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
  const scoreboard = useMemo(() => bootstrap?.scoreboard || [], [bootstrap]);
  const news = useMemo(() => bootstrap?.news || [], [bootstrap]);

  function renderPage() {
    if (loadingBootstrap) {
      return (
        <section className="generic-loading">
          <p className="eyebrow">CBB Sync</p>
          <h2>Syncing the campus board and the latest composite snapshot.</h2>
        </section>
      );
    }

    switch (page) {
      case 'scores': {
        const predictionMap = Object.fromEntries(predictors.map((entry) => [entry.gameId, entry]));
        return (
          <section className="cbb-score-grid">
            {scoreboard.map((game) => (
              <ScoreCard key={game.id} game={game} prediction={predictionMap[game.id]} onOpen={openGame} />
            ))}
          </section>
        );
      }
      case 'rankings':
        return <RankingsTable rankings={rankings} onOpenTeam={openTeam} />;
      case 'teams':
        return <TeamDirectory teams={teams} query={teamsQuery} onQueryChange={setTeamsQuery} onOpen={openTeam} />;
      case 'players':
        return (
          <PlayerBoard
            players={playersData?.players || []}
            query={playersQuery}
            onQueryChange={setPlayersQuery}
            loading={loadingPlayers}
            onOpen={openPlayer}
          />
        );
      case 'predictor':
        return (
          <PredictorView
            teams={teams}
            predictors={predictors}
            manualPrediction={manualPrediction}
            loading={loadingPredictor}
            selection={selection}
            onSelect={(field, value) => setSelection((current) => ({ ...current, [field]: value }))}
            onRun={runManualPredictor}
          />
        );
      case 'news':
        return (
          <section className="cbb-news-grid">
            {news.map((story) => (
              <NewsCard key={story.id} story={story} onOpen={openStory} fromPage="news" />
            ))}
          </section>
        );
      case 'settings':
        return (
          <section className="cbb-settings-grid">
            <article className="generic-card">
              <h3>Ranking inputs</h3>
              <p>AP, NET, Torvik, KenPom, Haslametrics, and EvanMiya feed the composite Avg board, with missing live sources excluded instead of fabricated.</p>
            </article>
            <article className="generic-card">
              <h3>Refresh model</h3>
              <p>Scores refresh every 30 seconds, the main snapshot stays hot, and team/player detail rehydrates live ESPN context on demand.</p>
            </article>
            <article className="generic-card">
              <h3>Current status</h3>
              <p>{formatUpdateTime(bootstrap?.lastUpdated)} • {bootstrap?.playersCatalog?.players?.length || 0} players • {bootstrap?.rankings?.length || 0} teams.</p>
            </article>
            <article className="generic-card">
              <h3>Source health</h3>
              <p>
                AP {bootstrap?.sourceState?.apPoll || 'unknown'} • NET {bootstrap?.sourceState?.net || 'unknown'} • Torvik {bootstrap?.sourceState?.torvik || 'unknown'} • Haslam {bootstrap?.sourceState?.haslametrics || 'unknown'}
              </p>
            </article>
          </section>
        );
      case 'team-detail':
        return teamDetail ? <TeamDetail teamDetail={teamDetail} openPlayer={openPlayer} onBack={() => setPage('teams')} /> : null;
      case 'player-detail':
        return playerDetail ? (
          <PlayerDetail
            playerDetail={playerDetail}
            onBack={() => {
              if (hubOriginPlayer) {
                window.location.assign('/');
                return;
              }
              setPage('players');
            }}
          />
        ) : null;
      case 'game-detail': {
        const predictor = predictors.find((entry) => entry.gameId === gameDetail?.game?.id);
        return gameDetail ? <GameDetail gameDetail={gameDetail} predictor={predictor} onBack={() => setPage('scores')} /> : null;
      }
      case 'story-detail':
        return storyDetail ? (
          <StoryDetailCard
            story={storyDetail}
            onBack={() => setPage(storyDetail.previousPage || 'overview')}
            backLabel="Back to CBB"
            onOpenRelated={(story) => openStory(story, storyDetail.previousPage || 'overview')}
          />
        ) : null;
      case 'overview':
      default:
        return (
          <Overview
            bootstrap={bootstrap}
            openGame={openGame}
            openTeam={openTeam}
            openPlayer={openPlayer}
            openStory={openStory}
            setPage={setPage}
          />
        );
    }
  }

  return (
    <section
      className="generic-sport-shell sport-shell-cbb cbb-app-shell"
      style={{
        '--sport-accent': '#f5a623',
        '--sport-accent-alt': '#ffe88f',
      }}
    >
      <button
        className={`generic-mobile-overlay ${mobileNavOpen ? 'is-open' : ''}`}
        type="button"
        aria-label="Close navigation"
        onClick={() => setMobileNavOpen(false)}
      />
      <aside className={`generic-sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="generic-brand cbb-brand">
          <span>Composite CBB</span>
          <h2>Campus Board</h2>
          <p>365 teams, real resume context, and a live player board.</p>
        </div>
        <nav className="generic-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={page === item.key ? 'is-active' : ''}
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
            <p className="eyebrow">Composite CBB</p>
            <h1>{NAV_ITEMS.find((item) => item.key === page)?.label || 'Detail View'}</h1>
          </div>
          <div className="generic-inline-stats">
            <span>{formatUpdateTime(bootstrap?.lastUpdated)}</span>
            <button className="generic-menu-button" type="button" onClick={() => setMobileNavOpen((value) => !value)}>
              Menu
            </button>
            <button type="button" onClick={() => fetchBootstrap(true)}>
              Refresh
            </button>
          </div>
        </header>
        {renderPage()}
      </div>
    </section>
  );
}
