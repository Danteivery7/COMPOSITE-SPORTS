import {
  extractIdFromRef,
  formatGameTime,
  formatPercent,
  formatRelativeTime,
  formatSigned,
  getThemeLogo,
  getRouteMeta,
  resolveNhlHeadshot,
  toRouteHash,
} from "./utils.js";
import {
  buildGameProjection,
  buildTeamMatchupProjection,
  explainTeamSignals,
  getGameLifecycle,
} from "./analytics.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function logoFor(team) {
  return team ? getThemeLogo(team) : "";
}

function routeButton(label, hash, primary = false) {
  return `
    <button class="pill-action ${primary ? "is-primary" : ""}" data-nav-hash="${hash}">
      ${escapeHtml(label)}
    </button>
  `;
}

function leaderPlayerId(entry = {}) {
  return (
    entry?.leaders?.[0]?.athlete?.id ||
    extractIdFromRef(entry?.leaders?.[0]?.athlete?.$ref) ||
    null
  );
}

function flattenTeamRoster(teamBundle = {}) {
  return (teamBundle.roster?.athletes || []).flatMap((bucket) =>
    (bucket.items || []).map((player) => ({
      id: String(player.id),
      displayName: player.displayName || player.fullName || player.shortName || "Player",
      position:
        player.resolvedPosition ||
        player.position?.abbreviation ||
        player.position?.displayName ||
        player.position?.name ||
        "",
      jersey: player.jersey || "--",
      headshot: player.headshot?.href || player.headshot || resolveNhlHeadshot(player.id),
    })),
  );
}

function renderEmptyState(title = "Still syncing", subtitle = "That panel is waiting on the live feeds.") {
  return `
    <section class="glass-panel empty-state">
      <p class="eyebrow">No Data Yet</p>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(subtitle)}</p>
    </section>
  `;
}

function renderLifecycleBadge(lifecycle) {
  if (!lifecycle) return "";
  const classes = [
    "live-badge",
    lifecycle.key === "live" ? "is-live" : "",
    lifecycle.key === "fire" ? "is-fire" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const dot = lifecycle.key === "live" ? '<span class="live-dot"></span>' : "";
  return `<span class="${classes}">${dot}${escapeHtml(lifecycle.label)}</span>`;
}

function renderMiniMetric(label, value, foot = "") {
  return `
    <div class="mini-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${foot ? `<span>${escapeHtml(foot)}</span>` : ""}
    </div>
  `;
}

function formatMetricValue(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? "--");
  return numeric.toFixed(digits);
}

function renderPlayerStatChips(player) {
  if (!player) return "";
  if (player.resolvedPosition === "G") {
    return `
      <span class="stat-chip"><strong>W</strong> ${escapeHtml(String(player.statLine?.wins ?? "--"))}</span>
      <span class="stat-chip"><strong>SV%</strong> ${escapeHtml(String(player.statLine?.savePct ?? "--"))}</span>
      <span class="stat-chip"><strong>GAA</strong> ${escapeHtml(String(player.statLine?.gaa ?? "--"))}</span>
    `;
  }
  return `
    <span class="stat-chip"><strong>PTS</strong> ${escapeHtml(String(player.statLine?.points ?? "--"))}</span>
    <span class="stat-chip"><strong>G</strong> ${escapeHtml(String(player.statLine?.goals ?? "--"))}</span>
    <span class="stat-chip"><strong>A</strong> ${escapeHtml(String(player.statLine?.assists ?? "--"))}</span>
  `;
}

function renderGameCard(entry, rankingsById = {}, summary = null) {
  const event = entry?.event || entry;
  const competition = event?.competitions?.[0];
  if (!competition) return "";
  const home = competition.competitors.find((item) => item.homeAway === "home");
  const away = competition.competitors.find((item) => item.homeAway === "away");
  const homeRank = rankingsById[home?.team?.id];
  const awayRank = rankingsById[away?.team?.id];
  const lifecycle = entry.lifecycle || getGameLifecycle(event);
  const projection = entry.projection || buildGameProjection(event, rankingsById, summary);

  const classes = [
    "game-card",
    lifecycle.dim ? "is-dimmed" : "",
    lifecycle.key === "soon" || lifecycle.key === "fire" ? "is-gold" : "",
    lifecycle.horn ? "is-horn-final" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <article class="${classes}" data-nav-hash="${toRouteHash("game", event.id)}">
      <div class="game-head">
        <div>
          <p class="eyebrow">${escapeHtml(event.shortName || event.name || "NHL Matchup")}</p>
          <h3 class="panel-title">${escapeHtml(event.name || "Game")}</h3>
        </div>
        ${renderLifecycleBadge(lifecycle)}
      </div>

      <div class="teams-vs">
        <div class="team-row">
          <img src="${escapeHtml(away.team.logo || logoFor(away.team))}" alt="${escapeHtml(away.team.displayName)}" />
          <div>
            <h4 class="team-name">${escapeHtml(away.team.displayName)}</h4>
            <p class="team-sub">${awayRank ? `#${awayRank.rank} • ${awayRank.compositeScore} OVR • ${awayRank.recordDisplay}` : away.team.abbreviation}</p>
          </div>
          <div class="team-score">${escapeHtml(away.score || "0")}</div>
        </div>
        <div class="team-row">
          <img src="${escapeHtml(home.team.logo || logoFor(home.team))}" alt="${escapeHtml(home.team.displayName)}" />
          <div>
            <h4 class="team-name">${escapeHtml(home.team.displayName)}</h4>
            <p class="team-sub">${homeRank ? `#${homeRank.rank} • ${homeRank.compositeScore} OVR • ${homeRank.recordDisplay}` : home.team.abbreviation}</p>
          </div>
          <div class="team-score">${escapeHtml(home.score || "0")}</div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="score-footer">
        <div class="line-items">
          <span>${escapeHtml(formatGameTime(event.date))}</span>
          ${competition.broadcasts?.[0]?.names?.[0] ? `<span>${escapeHtml(competition.broadcasts[0].names[0])}</span>` : ""}
        </div>
        ${
          projection
            ? `<span class="trend-chip ${projection.marketEdge > 0 ? "up" : "flat"}">${escapeHtml(projection.modelScoreLabel)} • ${formatPercent(projection.homeWinProbability, 0)}</span>`
            : ""
        }
      </div>
    </article>
  `;
}

function renderRankRow(team) {
  return `
    <button class="rank-row ${team.rank <= 10 ? "is-top" : ""}" data-nav-hash="${toRouteHash("team", team.id)}">
      <span class="rank-index">${team.rank}</span>
      <span class="rank-team">
        <img src="${escapeHtml(logoFor(team.team))}" alt="${escapeHtml(team.team.displayName)}" />
        <span class="rank-meta">
          <strong>${escapeHtml(team.team.displayName)}</strong>
          <span>${escapeHtml(`${team.recordDisplay} • ${team.streakDisplay}`)}</span>
        </span>
      </span>
      <span class="rank-copy">
        <strong>${team.compositeScore}</strong>
        <span>${escapeHtml(team.trendLabel)}</span>
      </span>
    </button>
  `;
}

function renderFeaturedPlayer(player) {
  return `
    <button class="player-card ${player.overall >= 91 ? "is-gold" : ""}" data-nav-hash="${toRouteHash("player", player.playerId)}">
      <div class="player-head">
        <span class="leader-copy">
          ${player.headshot ? `<img src="${escapeHtml(player.headshot)}" alt="${escapeHtml(player.fullName)}" />` : ""}
          <span class="player-meta">
            <p class="eyebrow">${escapeHtml(`${player.team?.abbreviation || "NHL"} • ${player.resolvedPosition}`)}</p>
            <h3 class="player-heading">${escapeHtml(player.fullName || player.playerId)}</h3>
            <p class="player-sub">${escapeHtml(player.modelReasons?.join(" • ") || `${player.resolvedPosition} impact model`)}</p>
          </span>
        </span>
        <span class="rank-chip">${player.overall} OVR</span>
      </div>
      <div class="inline-list">
        ${renderPlayerStatChips(player)}
      </div>
    </button>
  `;
}

function renderArticle(article) {
  const image = article.image || article.images?.find((item) => item.url)?.url || "";
  const storyId = article.storyId || article.id;
  return `
    <article class="article-card" data-nav-hash="${toRouteHash("story", storyId)}">
      ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(article.headline)}" />` : ""}
      <div class="article-head">
        <div>
          <p class="eyebrow">${escapeHtml(article.source || "ESPN Wire")}</p>
          <h3 class="article-title">${escapeHtml(article.headline)}</h3>
        </div>
      </div>
      <p class="article-desc">${escapeHtml(article.description || "No summary available.")}</p>
      <p class="article-meta">${escapeHtml(formatGameTime(article.published || article.lastModified))}</p>
    </article>
  `;
}

function renderStoryDetail(state) {
  const story = state.newsStories?.[state.route.id];

  if (!story) {
    return renderEmptyState("Story syncing", "The ESPN story body is still loading inside the NHL route.");
  }

  return `
    <section class="list-panel story-detail-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">${escapeHtml(story.source || "ESPN")}</p>
          <h3 class="section-title">${escapeHtml(story.headline || "Story")}</h3>
          <p class="section-subtitle">${escapeHtml([story.byline, formatGameTime(story.published)].filter(Boolean).join(" • "))}</p>
        </div>
        ${routeButton("Back to news", toRouteHash("news"))}
      </div>
      ${story.image ? `<img class="story-detail-image" src="${escapeHtml(story.image)}" alt="${escapeHtml(story.headline || "Story image")}" />` : ""}
      ${story.dek ? `<p class="story-detail-dek">${escapeHtml(story.dek)}</p>` : ""}
      <div class="story-detail-body">${story.body || "<p>No story body is available yet.</p>"}</div>
      ${story.related?.length ? `
        <div class="story-related-list">
          ${story.related.slice(0, 4).map((item) => `
            <button class="leader-card" data-nav-hash="${toRouteHash("story", item.storyId || item.id)}">
              <div class="row-between">
                <div>
                  <h3 class="matchup-heading">${escapeHtml(item.headline)}</h3>
                  <p class="small-note">${escapeHtml(item.source || "ESPN")}</p>
                </div>
                <span class="trend-chip flat">Open</span>
              </div>
            </button>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderOverview(state) {
  const pulse = state.leaguePulse;
  const rankings = state.teamRankings || [];
  const players = (state.playerDirectory?.length ? state.playerDirectory : state.featuredPlayers || []).slice(0, 6);
  const predictorCards = state.predictorCards || [];
  const news = state.news || [];

  return `
    <section class="dashboard-grid">
      <article class="hero-panel glass-panel">
        <div class="hero-row">
          <div>
            <p class="eyebrow">League Pulse • ${escapeHtml(state.todayLabel)}</p>
            <h3 class="hero-title">Live NHL board with real player and team impact ratings.</h3>
            <p class="hero-subtitle">${escapeHtml(pulse?.headline || "Syncing the live COMPOSITE NHL engine.")}</p>
            <div class="hero-actions">
              ${routeButton("Open Live Slate", toRouteHash("scores"), true)}
              ${routeButton("View Teams", toRouteHash("teams"))}
              ${routeButton("Check Predictor", toRouteHash("predictor"))}
            </div>
          </div>
          <div class="inline-list">
            ${renderLifecycleBadge({ key: "live", label: `${pulse?.liveGames || 0} Live` })}
            ${pulse?.hotTeam ? `<span class="status-pill is-soon">${escapeHtml(pulse.hotTeam.team.displayName)} #${pulse.hotTeam.rank}</span>` : ""}
          </div>
        </div>

        <div class="metric-strip">
          ${state.spotlights.map((spotlight) => renderMiniMetric(spotlight.label, spotlight.value, spotlight.foot)).join("")}
        </div>
      </article>

      <article class="list-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">At A Glance</p>
            <h3 class="section-title">Tonight's live board</h3>
          </div>
          ${routeButton("Full scores", toRouteHash("scores"))}
        </div>
        <div class="game-stack">
          ${(state.scoreboard?.events || []).slice(0, 4).map((event) => renderGameCard(event, state.rankingsById)).join("") || renderEmptyState("Scoreboard still syncing", "The live slate will appear here once the first pull returns.")}
        </div>
      </article>
    </section>

    <section class="two-column-grid">
      <article class="list-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Power Index</p>
            <h3 class="section-title">Top 10 teams</h3>
          </div>
          ${routeButton("Full rankings", toRouteHash("rankings"))}
        </div>
        <div class="rank-list">
          ${rankings.slice(0, 10).map(renderRankRow).join("")}
        </div>
      </article>

      <article class="list-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Top Players</p>
            <h3 class="section-title">Best OVRs right now</h3>
          </div>
          ${routeButton("Players view", toRouteHash("players"))}
        </div>
        <div class="player-stack">
          ${players.map(renderFeaturedPlayer).join("") || renderEmptyState("Waiting on players", "The full NHL player directory is still filling in.")}
        </div>
      </article>
    </section>

    <section class="two-column-grid">
      <article class="list-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Model vs Market</p>
            <h3 class="section-title">Best edges on the slate</h3>
          </div>
          ${routeButton("Predictor page", toRouteHash("predictor"))}
        </div>
        <div class="list-stack">
          ${predictorCards
            .slice(0, 5)
            .map(
              ({ event, projection }) => `
                <button class="leader-card" data-nav-hash="${toRouteHash("game", event.id)}">
                  <div class="row-between">
                    <div>
                      <h3 class="matchup-heading">${escapeHtml(event.shortName || event.name)}</h3>
                      <p class="small-note">${escapeHtml(projection.modelScoreLabel)}</p>
                    </div>
                    <span class="trend-chip ${projection.marketEdge > 0 ? "up" : projection.marketEdge < 0 ? "down" : "flat"}">
                      ${projection.marketEdge === null ? "No line" : `Edge ${formatSigned(projection.marketEdge * 100, 1)} pts`}
                    </span>
                  </div>
                  <div class="chip-row">
                    <span class="stat-chip"><strong>Home</strong> ${formatPercent(projection.homeWinProbability, 0)}</span>
                    <span class="stat-chip"><strong>Projected</strong> ${escapeHtml(projection.modelScoreLabel)}</span>
                    ${projection.reasoning.map((reason) => `<span class="stat-chip"><strong>Why</strong> ${escapeHtml(reason)}</span>`).join("")}
                  </div>
                </button>
              `,
            )
            .join("")}
        </div>
      </article>

      <article class="list-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">News Feed</p>
            <h3 class="section-title">Stories shaping the slate</h3>
          </div>
          ${routeButton("News page", toRouteHash("news"))}
        </div>
        <div class="article-stack">
          ${news.slice(0, 4).map(renderArticle).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderScores(state) {
  const events = state.scoreboard?.events || [];
  if (!events.length) {
    return renderEmptyState("No games loaded", "The live scoreboard will appear once the NHL slate returns.");
  }

  return `
    <section class="list-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Game Lifecycle</p>
          <h3 class="section-title">Live scores and slate states</h3>
          <p class="section-subtitle">Games reset with the 6:00 AM ET slate and finals age off after the shorter of 12 hours or the next reset.</p>
        </div>
        <span class="status-pill">${escapeHtml(formatRelativeTime(state.lastSync.scoreboard))}</span>
      </div>
      <div class="cards-grid">
        ${events.map((event) => renderGameCard(event, state.rankingsById)).join("")}
      </div>
    </section>
  `;
}

function renderRankings(state) {
  const rankings = state.teamRankings || [];
  if (!rankings.length) {
    return renderEmptyState("Rankings are still building", "Team ratings need the official NHL stat pulls to complete.");
  }

  return `
    <section class="two-column-grid">
      <article class="list-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Composite Team Engine</p>
            <h3 class="section-title">League power board</h3>
            <p class="section-subtitle">Top-six strength, blue-line quality, goaltending, depth, special teams, recent form, and underlying control all feed this board.</p>
          </div>
        </div>
        <div class="rank-list">
          ${rankings.map(renderRankRow).join("")}
        </div>
      </article>

      <article class="list-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Ratings Breakdown</p>
            <h3 class="section-title">Why these teams rate here</h3>
          </div>
        </div>
        <div class="meter-list">
          ${rankings.slice(0, 10).map(
            (team) => `
              <button class="leader-card" data-nav-hash="${toRouteHash("team", team.id)}">
                <div class="row-between">
                  <span class="leader-copy">
                    <img src="${escapeHtml(logoFor(team.team))}" alt="${escapeHtml(team.team.displayName)}" />
                    <span class="leader-meta">
                      <strong>${escapeHtml(team.team.displayName)}</strong>
                      <span>${escapeHtml(`${team.recordDisplay} • ${team.streakDisplay}`)}</span>
                    </span>
                  </span>
                  <span class="rank-chip">${team.compositeScore}</span>
                </div>
                <div class="metric-strip">
                  ${renderMiniMetric("Top Six", String(team.forwardCore))}
                  ${renderMiniMetric("Blue Line", String(team.defenseCore))}
                  ${renderMiniMetric("Goalies", String(team.goaltending))}
                  ${renderMiniMetric("Special Teams", String(team.specialTeams))}
                </div>
              </button>
            `,
          ).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderTeams(state) {
  const rankings = state.teamRankings || [];
  if (!rankings.length) {
    return renderEmptyState("Teams are still syncing", "The club directory needs the current NHL ranking board to finish.");
  }

  return `
    <section class="list-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Club Directory</p>
          <h3 class="section-title">All NHL teams</h3>
          <p class="section-subtitle">Logo-first team cards with OVR, record, streak, and a direct path into each club page.</p>
        </div>
      </div>
      <div class="team-directory-grid">
        ${rankings.map((team) => `
          <button class="team-directory-card" data-nav-hash="${toRouteHash("team", team.id)}">
            <div class="row-between">
              <span class="leader-copy">
                <img src="${escapeHtml(logoFor(team.team))}" alt="${escapeHtml(team.team.displayName)}" />
                <span class="leader-meta">
                  <strong>${escapeHtml(team.team.displayName)}</strong>
                  <span>${escapeHtml(`${team.recordDisplay} • ${team.streakDisplay}`)}</span>
                </span>
              </span>
              <span class="rank-chip">#${team.rank}</span>
            </div>
            <div class="chip-row">
              <span class="stat-chip"><strong>OVR</strong> ${team.compositeScore}</span>
              <span class="stat-chip"><strong>Top Six</strong> ${team.forwardCore}</span>
              <span class="stat-chip"><strong>Goalies</strong> ${team.goaltending}</span>
            </div>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderPlayers(state) {
  const players = state.playerDirectory?.length ? state.playerDirectory : state.featuredPlayers || [];
  if (!players.length) {
    return renderEmptyState("Players are still syncing", "The full NHL player directory is still filling from official roster and advanced stat data.");
  }

  const filter = state.playerFilter.trim().toLowerCase();
  const filtered = filter
    ? players.filter((player) => {
        const haystack = `${player.fullName} ${player.shortName} ${player.team?.displayName || ""} ${player.team?.abbreviation || ""}`.toLowerCase();
        return haystack.includes(filter);
      })
    : players;

  return `
    <section class="list-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Player Ratings</p>
          <h3 class="section-title">Full NHL directory</h3>
          <p class="section-subtitle">Sorted best OVR to worst, with the full rostered player pool searchable right here.</p>
        </div>
      </div>
      <div class="player-directory-toolbar">
        <label class="player-filter">
          <input type="search" data-player-filter value="${escapeHtml(state.playerFilter)}" placeholder="Filter any NHL player" />
        </label>
        <span class="status-pill">${filtered.length} shown</span>
      </div>
      <div class="player-directory-list">
        ${filtered.map((player) => `
          <button class="player-directory-row" data-nav-hash="${toRouteHash("player", player.playerId)}">
            <span class="leader-copy">
              ${player.headshot ? `<img src="${escapeHtml(player.headshot)}" alt="${escapeHtml(player.fullName)}" />` : ""}
              <span class="leader-meta">
                <strong>${escapeHtml(player.fullName)}</strong>
                <span>${escapeHtml(`${player.team?.abbreviation || "NHL"} • ${player.resolvedPosition} • #${player.jersey || "--"}`)}</span>
              </span>
            </span>
            <span class="player-row-metrics">
              ${renderPlayerStatChips(player)}
            </span>
            <span class="rank-chip">${player.overall}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderPredictor(state) {
  const cards = state.predictorCards || [];
  const teams = state.teamRankings || [];
  const manual = buildTeamMatchupProjection(
    state.predictorSelection.homeTeamId,
    state.predictorSelection.awayTeamId,
    state.rankingsById,
  );

  return `
    <section class="list-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Betting Engine</p>
          <h3 class="section-title">Any-two-team predictor</h3>
          <p class="section-subtitle">Whole-score projections, clear win probabilities, spread-style margin, and reasoning chips from the team model.</p>
        </div>
      </div>

      <article class="detail-card predictor-builder">
        <div class="predictor-select-row">
          <label class="predictor-select">
            <span>Home Team</span>
            <select data-predictor-home>
              ${teams.map((team) => `<option value="${team.id}" ${String(state.predictorSelection.homeTeamId) === String(team.id) ? "selected" : ""}>${escapeHtml(team.team.displayName)}</option>`).join("")}
            </select>
          </label>
          <label class="predictor-select">
            <span>Away Team</span>
            <select data-predictor-away>
              ${teams.map((team) => `<option value="${team.id}" ${String(state.predictorSelection.awayTeamId) === String(team.id) ? "selected" : ""}>${escapeHtml(team.team.displayName)}</option>`).join("")}
            </select>
          </label>
        </div>
        ${
          manual
            ? `
              <div class="metric-strip">
                ${renderMiniMetric("Projected Score", manual.modelScoreLabel, "Whole-number model")}
                ${renderMiniMetric("Home Win", formatPercent(manual.homeWinProbability, 0), "Probability")}
                ${renderMiniMetric("Margin", formatSigned(manual.projectedMargin, 0), manual.projectedMargin > 0 ? "Home lean" : "Away lean")}
                ${renderMiniMetric("Total", String(manual.projectedTotal), manual.totalEdge === null ? "Shadow total" : manual.totalEdge > 0 ? `Over by ${manual.totalEdge}` : `Under by ${Math.abs(manual.totalEdge)}`)}
              </div>
              <div class="chip-row">
                ${manual.reasoning.map((reason) => `<span class="stat-chip"><strong>Reason</strong> ${escapeHtml(reason)}</span>`).join("")}
              </div>
            `
            : renderEmptyState("Pick two teams", "The manual predictor will populate once both sides are selected.")
        }
      </article>

      ${cards.length ? `
        <div class="cards-grid">
          ${cards
            .map(
              ({ event, projection, lifecycle }) => `
                <article class="leader-card ${lifecycle.key === "fire" || lifecycle.key === "soon" ? "is-gold" : ""}" data-nav-hash="${toRouteHash("game", event.id)}">
                  <div class="matchup-top">
                    <div>
                      <p class="eyebrow">${escapeHtml(event.shortName || event.name)}</p>
                      <h3 class="matchup-heading">${escapeHtml(projection.modelScoreLabel)}</h3>
                      <p class="small-note">${escapeHtml(lifecycle.label)}</p>
                    </div>
                    ${renderLifecycleBadge(lifecycle)}
                  </div>
                  <div class="metric-strip">
                    ${renderMiniMetric("Home Win", formatPercent(projection.homeWinProbability, 0), projection.homeMoneyline ? `DK ${projection.homeMoneyline}` : "Shadow line")}
                    ${renderMiniMetric("Projected", projection.modelScoreLabel, "Model final")}
                    ${renderMiniMetric("Margin", formatSigned(projection.projectedMargin, 0), projection.projectedMargin > 0 ? "Home lean" : "Away lean")}
                    ${renderMiniMetric("Total", String(projection.projectedTotal), projection.totalEdge === null ? "No total line" : projection.totalEdge > 0 ? `Over by ${projection.totalEdge}` : `Under by ${Math.abs(projection.totalEdge)}`)}
                  </div>
                  <div class="chip-row">
                    ${projection.reasoning.map((reason) => `<span class="stat-chip"><strong>Reason</strong> ${escapeHtml(reason)}</span>`).join("")}
                  </div>
                </article>
              `,
            )
            .join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderNews(state) {
  const news = state.news || [];
  return `
    <section class="list-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">ESPN Feed</p>
          <h3 class="section-title">Latest NHL reporting</h3>
          <p class="section-subtitle">Current stories affecting players, teams, and the slate.</p>
        </div>
      </div>
      <div class="news-grid">
        ${news.map(renderArticle).join("")}
      </div>
    </section>
  `;
}

function renderSettings(state) {
  const settings = state.settings;
  return `
    <section class="settings-grid">
      <article class="setting-card">
        <div class="settings-head">
          <div>
            <p class="eyebrow">Theme Engine</p>
            <h3 class="section-title">Dark / Light shell</h3>
            <p class="settings-copy">Switches the NHL experience between the shared light and dark route themes.</p>
          </div>
          <span class="settings-value">${escapeHtml(settings.theme)}</span>
        </div>
        <div class="button-row">
          <button class="toggle-button ${settings.theme === "dark" ? "is-active" : ""}" data-setting="theme" data-value="dark">Dark</button>
          <button class="toggle-button ${settings.theme === "light" ? "is-active" : ""}" data-setting="theme" data-value="light">Light</button>
        </div>
      </article>

      <article class="setting-card">
        <div class="settings-head">
          <div>
            <p class="eyebrow">Polling</p>
            <h3 class="section-title">Live refresh control</h3>
            <p class="settings-copy">Scores poll faster for in-progress games and relax when the slate is quiet.</p>
          </div>
          <span class="settings-value">${settings.autoRefresh ? "On" : "Off"}</span>
        </div>
        <div class="button-row">
          <button class="toggle-button ${settings.autoRefresh ? "is-active" : ""}" data-setting="autoRefresh" data-value="true">Enabled</button>
          <button class="toggle-button ${!settings.autoRefresh ? "is-active" : ""}" data-setting="autoRefresh" data-value="false">Paused</button>
        </div>
      </article>

      <article class="setting-card">
        <div class="settings-head">
          <div>
            <p class="eyebrow">Player OVR Formula</p>
            <h3 class="section-title">Position-first percentiles</h3>
            <p class="settings-copy">The player board uses position-specific percentile buckets first, then small context adjustments. Team strength is damped so elite clubs do not inflate mediocre skaters.</p>
          </div>
        </div>
        <div class="list-stack">
          <p class="small-note"><strong>Goalies:</strong> 0.24 SV% + 0.24 GSAX/60 proxy + 0.18 quality-start proxy + 0.12 rebound control + 0.08 workload + 0.06 puck handling proxy + 0.08 consistency.</p>
          <p class="small-note"><strong>Defense:</strong> 0.30 suppression + 0.22 transition + 0.18 puck movement + 0.12 gap/stick work + 0.10 physicality + 0.08 offensive contribution.</p>
          <p class="small-note"><strong>Centers:</strong> 0.26 two-way impact + 0.20 playmaking + 0.18 scoring + 0.14 transition + 0.12 faceoffs + 0.10 chance generation.</p>
          <p class="small-note"><strong>Wings:</strong> 0.26 scoring/finishing + 0.20 chance generation + 0.18 play driving + 0.14 forecheck/battles + 0.12 defensive impact + 0.10 playmaking.</p>
        </div>
      </article>

      <article class="setting-card">
        <div class="settings-head">
          <div>
            <p class="eyebrow">Team OVR Formula</p>
            <h3 class="section-title">Deployment + environment</h3>
            <p class="settings-copy">Team overalls use top-six and pair quality, goalie split, depth, special teams, recent form, and official underlying metrics with the same capped OVR curve.</p>
          </div>
        </div>
        <div class="list-stack">
          <p class="small-note"><strong>Forward core:</strong> 0.45 Line 1 + 0.30 Line 2 + 0.15 Line 3 + 0.10 Line 4.</p>
          <p class="small-note"><strong>Defense core:</strong> 0.50 Pair 1 + 0.32 Pair 2 + 0.18 Pair 3.</p>
          <p class="small-note"><strong>Final team base:</strong> 0.26 forwards + 0.22 defense + 0.18 goalies + 0.10 depth + 0.10 special teams + 0.08 underlying + 0.06 recent.</p>
          <p class="small-note"><strong>Normalization:</strong> Same percentile-to-OVR curve as players, capped at 99 with very few 95+ and almost no 99s.</p>
        </div>
      </article>
    </section>
  `;
}

function renderGameDetail(state) {
  const eventId = state.route.id;
  const event = (state.scoreboard?.events || []).find((item) => String(item.id) === String(eventId));
  if (!event) {
    return renderEmptyState("Game not found", "That event is not present in the current scoreboard window.");
  }

  const summary = state.gameSummaries[eventId];
  const projection = buildGameProjection(event, state.rankingsById, summary);
  const competition = event.competitions[0];
  const home = competition.competitors.find((item) => item.homeAway === "home");
  const away = competition.competitors.find((item) => item.homeAway === "away");
  const lifecycle = getGameLifecycle(event);
  const plays = (summary?.plays || []).filter((play) => play.scoringPlay).slice(-10).reverse();
  const lines = competition.odds?.[0] || summary?.pickcenter?.[0] || null;
  const venue = summary?.gameInfo?.venue;

  return `
    <section class="detail-grid">
      <article class="detail-card detail-hero">
        <div class="detail-head">
          <div>
            <p class="eyebrow">Game Detail</p>
            <h3 class="section-title">${escapeHtml(event.name)}</h3>
            <p class="detail-meta">${escapeHtml(formatGameTime(event.date))}${venue ? ` • ${escapeHtml(venue.fullName)}` : ""}</p>
          </div>
          ${renderLifecycleBadge(lifecycle)}
        </div>

        <div class="detail-vs">
          <div class="detail-team-row">
            <img src="${escapeHtml(away.team.logo)}" alt="${escapeHtml(away.team.displayName)}" />
            <div>
              <h4 class="detail-name">${escapeHtml(away.team.displayName)}</h4>
              <p class="detail-sub">${state.rankingsById[away.team.id] ? `Rank #${state.rankingsById[away.team.id].rank}` : away.team.abbreviation}</p>
            </div>
            <div class="detail-score">${escapeHtml(away.score || "0")}</div>
          </div>
          <div class="detail-team-row">
            <img src="${escapeHtml(home.team.logo)}" alt="${escapeHtml(home.team.displayName)}" />
            <div>
              <h4 class="detail-name">${escapeHtml(home.team.displayName)}</h4>
              <p class="detail-sub">${state.rankingsById[home.team.id] ? `Rank #${state.rankingsById[home.team.id].rank}` : home.team.abbreviation}</p>
            </div>
            <div class="detail-score">${escapeHtml(home.score || "0")}</div>
          </div>
        </div>

        ${
          projection
            ? `
              <div class="divider"></div>
              <div class="detail-model">
                ${renderMiniMetric("Projected Score", projection.modelScoreLabel, "Whole-number model")}
                ${renderMiniMetric("Home Win", formatPercent(projection.homeWinProbability, 0), projection.homeMoneyline ? `DK ${projection.homeMoneyline}` : "Shadow line")}
                ${renderMiniMetric("Total", String(projection.projectedTotal), lines?.overUnder ? `Line ${lines.overUnder}` : "No total")}
              </div>
              <div class="chip-row">
                ${projection.reasoning.map((reason) => `<span class="stat-chip"><strong>Reason</strong> ${escapeHtml(reason)}</span>`).join("")}
              </div>
            `
            : ""
        }
      </article>

      <article class="detail-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Market + Context</p>
            <h3 class="section-title">Odds and team snapshot</h3>
          </div>
        </div>
        <div class="list-stack">
          ${
            lines
              ? `
                ${renderMiniMetric("Moneyline", lines.details || "Live", "DraftKings via ESPN")}
                ${renderMiniMetric("Total", String(lines.overUnder || "--"), lines.spread ? `Puck line ${lines.spread}` : "No puck line")}
              `
              : renderMiniMetric("Market", "No public line", "Shadow projection only")
          }
        </div>
      </article>
    </section>

    <section class="two-column-grid">
      <article class="detail-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Scoring Timeline</p>
            <h3 class="section-title">Impact plays</h3>
          </div>
        </div>
        <div class="timeline-stack">
          ${
            plays.length
              ? plays
                  .map(
                    (play) => `
                      <div class="timeline-item">
                        <div class="timeline-time">${escapeHtml(play.period?.displayValue || "")} • ${escapeHtml(play.clock?.displayValue || "0:00")}</div>
                        <div>
                          <strong>${escapeHtml(play.text)}</strong>
                          <p class="small-note">${play.awayScore}-${play.homeScore}</p>
                        </div>
                      </div>
                    `,
                  )
                  .join("")
              : '<p class="small-note">Scoring timeline will populate for live or completed games.</p>'
          }
        </div>
      </article>

      <article class="detail-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Team Signals</p>
            <h3 class="section-title">Why the projection leans here</h3>
          </div>
        </div>
        <div class="list-stack">
          ${
            projection
              ? projection.reasoning.map((reason) => `<div class="leader-card"><p class="small-note">${escapeHtml(reason)}</p></div>`).join("")
              : '<p class="small-note">The team model will populate once both rating cards are available.</p>'
          }
        </div>
      </article>
    </section>
  `;
}

function renderPlayerDetail(state) {
  const player = state.playerCards[state.route.id];
  if (!player) {
    return renderEmptyState("Player profile is loading", "Open this card again in a moment if the profile bundle is still arriving.");
  }

  const history = player.seasonHistory || [];
  const statNames = player.resolvedPosition === "G"
    ? ["games", "wins", "savePct", "avgGoalsAgainst", "shutouts"]
    : ["games", "goals", "assists", "points", "plusMinus", "shootingPct", ...(player.resolvedPosition === "C" ? ["faceoffPercent"] : [])];

  return `
    <section class="detail-grid">
      <article class="detail-card detail-hero">
        <div class="detail-head">
          <div class="leader-copy">
            ${player.headshot ? `<img class="mini-logo" src="${escapeHtml(player.headshot)}" alt="${escapeHtml(player.fullName)}" />` : ""}
            <div>
              <p class="eyebrow">${escapeHtml(player.team?.displayName || "NHL")} • #${escapeHtml(player.jersey)} • ${escapeHtml(player.resolvedPosition)}</p>
              <h3 class="section-title">${escapeHtml(player.fullName)}</h3>
              <p class="detail-meta">Age ${player.age || "--"} • ${escapeHtml(player.profile.birthPlace?.city || "")}${player.profile.birthCountry?.abbreviation ? `, ${escapeHtml(player.profile.birthCountry.abbreviation)}` : ""}</p>
            </div>
          </div>
          <div class="inline-list">
            ${
              state.openedFromHub
                ? '<a class="pill-action is-primary" href="/" target="_top">Back to main menu</a>'
                : routeButton("Back to players", toRouteHash("players"), true)
            }
            <span class="rank-chip">${player.overall} OVR</span>
          </div>
        </div>
        <div class="chip-row">
          <span class="tone-chip ${player.tone.className}">${escapeHtml(player.tone.label)} ${player.hotnessScore}/5</span>
          <span class="status-pill">Trust ${formatPercent(player.sampleTrust, 0)}</span>
        </div>
        <div class="metric-strip">
          ${renderMiniMetric("Games", String(player.games))}
          ${renderMiniMetric("PPG", String(player.seasonPpg), `Career ${player.careerPpg}`)}
          ${player.resolvedPosition === "G" ? renderMiniMetric("SV%", player.savePct) : renderMiniMetric("Points", String(player.seasonPoints))}
          ${player.resolvedPosition === "G" ? renderMiniMetric("GAA", player.gaa) : renderMiniMetric("Shooting", player.shootingPct)}
        </div>
      </article>

      <article class="detail-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Season Lens</p>
            <h3 class="section-title">Current production</h3>
          </div>
        </div>
        <div class="inline-list">
          ${Object.values(player.seasonStats)
            .filter((stat) => statNames.includes(stat.name))
            .map((stat) => `<span class="stat-chip"><strong>${escapeHtml(stat.abbreviation)}</strong> ${escapeHtml(stat.displayValue || String(stat.value))}</span>`)
            .join("")}
        </div>
      </article>
    </section>

    <section class="two-column-grid">
      <article class="detail-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Career Track</p>
            <h3 class="section-title">Season history</h3>
          </div>
        </div>
        <div class="timeline-stack">
          ${
            history.length
              ? history
                  .map(
                    (entry) => `
                      <div class="timeline-item">
                        <div class="timeline-time">${escapeHtml(entry.seasonLabel || "Season")}</div>
                        <div>
                          <strong>${escapeHtml(entry.type || "Totals")}</strong>
                          <p class="small-note">${escapeHtml([entry.team, entry.line].filter(Boolean).join(" • "))}</p>
                        </div>
                      </div>
                    `,
                  )
                  .join("")
              : '<p class="small-note">Season history is still syncing.</p>'
          }
        </div>
      </article>

      <article class="detail-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Model Notes</p>
            <h3 class="section-title">What drove this OVR</h3>
          </div>
        </div>
        <div class="list-stack">
          ${(player.modelReasons || []).length
            ? player.modelReasons.map((reason) => `<div class="leader-card"><p class="small-note">${escapeHtml(reason)}</p></div>`).join("")
            : '<p class="small-note">The model reasons are still syncing.</p>'}
        </div>
      </article>
    </section>
  `;
}

function renderTeamDetail(state) {
  const teamBundle = state.teamBundles[state.route.id];
  const ranking = state.rankingsById[state.route.id];
  if (!teamBundle || !ranking) {
    return renderEmptyState("Team page is loading", "Detailed team stats, leaders, and roster cards are still syncing.");
  }

  const team = teamBundle.team;
  const teamStats = teamBundle.statistics?.results?.stats?.categories || [];
  const leaders = teamBundle.leaders?.categories || [];
  const roster = flattenTeamRoster(teamBundle);
  const teamNews = state.teamNewsById?.[state.route.id] || [];

  return `
    <section class="detail-grid">
      <article class="detail-card detail-hero">
        <div class="detail-head">
          <div class="leader-copy">
            <img src="${escapeHtml(logoFor(team))}" alt="${escapeHtml(team.displayName)}" />
            <div>
              <p class="eyebrow">${escapeHtml(team.location)} • ${escapeHtml(team.abbreviation)}</p>
              <h3 class="section-title">${escapeHtml(team.displayName)}</h3>
              <p class="detail-meta">${escapeHtml(`${ranking.recordDisplay} • Rank #${ranking.rank} • ${ranking.trendLabel}`)}</p>
            </div>
          </div>
          <span class="rank-chip">${ranking.compositeScore} OVR</span>
        </div>
        <div class="metric-strip">
          ${renderMiniMetric("Top Six", formatMetricValue(ranking.forwardCore))}
          ${renderMiniMetric("Blue Line", formatMetricValue(ranking.defenseCore))}
          ${renderMiniMetric("Goalies", formatMetricValue(ranking.goaltending))}
          ${renderMiniMetric("Special Teams", formatMetricValue(ranking.specialTeams))}
        </div>
      </article>

      <article class="detail-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Team Model Inputs</p>
            <h3 class="section-title">Why the rating landed here</h3>
          </div>
        </div>
        <div class="inline-list">
          ${explainTeamSignals(ranking).map((signal) => `<span class="stat-chip"><strong>${escapeHtml(signal.label)}</strong> ${escapeHtml(formatMetricValue(signal.diff))}</span>`).join("")}
        </div>
      </article>
    </section>

    <section class="two-column-grid">
      <article class="detail-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Season Leaders</p>
            <h3 class="section-title">Top internal producers</h3>
          </div>
        </div>
        <div class="timeline-stack">
          ${
            leaders.length
              ? leaders
                  .slice(0, 6)
                  .map((category) => {
                    const playerId = leaderPlayerId(category);
                    const inner = `
                      <div class="timeline-time">${escapeHtml(category.displayName)}</div>
                      <div>
                        <strong>${escapeHtml(category.leaders?.[0]?.displayValue || "--")}</strong>
                        <p class="small-note">${escapeHtml(category.leaders?.[0]?.athlete?.displayName || "No leader")}</p>
                      </div>
                    `;
                    return playerId
                      ? `<button class="timeline-item" data-nav-hash="${toRouteHash("player", playerId)}">${inner}</button>`
                      : `<div class="timeline-item">${inner}</div>`;
                  })
                  .join("")
              : '<p class="small-note">Team leaders are still syncing.</p>'
          }
        </div>

        <div class="section-head team-subsection-head">
          <div>
            <p class="eyebrow">Raw Categories</p>
            <h3 class="section-title">Official stat feed</h3>
          </div>
        </div>
        <div class="list-stack">
          ${teamStats
            .map(
              (category) => `
                <div class="leader-card">
                  <h4 class="panel-title">${escapeHtml(category.displayName)}</h4>
                  <div class="inline-list">
                    ${(category.stats || [])
                      .slice(0, 6)
                      .map(
                        (stat) =>
                          `<span class="stat-chip"><strong>${escapeHtml(stat.abbreviation)}</strong> ${escapeHtml(
                            stat.displayValue || String(stat.value || "--"),
                          )}</span>`,
                      )
                      .join("")}
                  </div>
                </div>
              `,
            )
            .join("")}
        </div>

        <div class="section-head team-subsection-head">
          <div>
            <p class="eyebrow">Team News</p>
            <h3 class="section-title">Club-specific stories</h3>
          </div>
        </div>
        <div class="article-stack">
          ${teamNews.length ? teamNews.map(renderArticle).join("") : '<p class="small-note">No current team-specific stories matched the NHL feed yet.</p>'}
        </div>
      </article>

      <article class="detail-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Official Roster</p>
            <h3 class="section-title">Active player board</h3>
          </div>
        </div>
        <div class="list-stack">
          ${
            roster.length
              ? roster
                  .map(
                    (player) => `
                      <button class="leader-card" data-nav-hash="${toRouteHash("player", player.id)}">
                        <div class="row-between">
                          <span class="leader-copy">
                            ${player.headshot ? `<img src="${escapeHtml(player.headshot)}" alt="${escapeHtml(player.displayName)}" />` : ""}
                            <span class="leader-meta">
                              <strong>${escapeHtml(player.displayName)}</strong>
                              <span>${escapeHtml(`${player.position || "--"} • #${player.jersey}`)}</span>
                            </span>
                          </span>
                          <span class="trend-chip flat">Profile</span>
                        </div>
                      </button>
                    `,
                  )
                  .join("")
              : '<p class="small-note">Roster entries are still syncing.</p>'
          }
        </div>
      </article>
    </section>
  `;
}

export function renderSearchResults(results = []) {
  if (!results.length) {
    return `<div class="search-result"><div class="search-copy"><strong>No matches</strong><span>Try a team, player, or matchup name.</span></div></div>`;
  }

  return results
    .map(
      (result) => `
        <button class="search-result" data-nav-hash="${toRouteHash(result.type, result.id)}">
          <span class="search-copy">
            <strong>${escapeHtml(result.title)}</strong>
            <span>${escapeHtml(result.subtitle)}</span>
          </span>
          <span class="search-type">${escapeHtml(result.type)}</span>
        </button>
      `,
    )
    .join("");
}

export function renderApp(state) {
  const route = state.route;

  if (route.view === "game") return renderGameDetail(state);
  if (route.view === "team") return renderTeamDetail(state);
  if (route.view === "player") return renderPlayerDetail(state);
  if (route.view === "story") return renderStoryDetail(state);
  if (route.view === "scores") return renderScores(state);
  if (route.view === "rankings") return renderRankings(state);
  if (route.view === "teams") return renderTeams(state);
  if (route.view === "players") return renderPlayers(state);
  if (route.view === "predictor") return renderPredictor(state);
  if (route.view === "news") return renderNews(state);
  if (route.view === "settings") return renderSettings(state);
  return renderOverview(state);
}

export function syncRouteChrome(state) {
  const meta = getRouteMeta(
    ["game", "team", "player"].includes(state.route.view) ? "overview" : state.route.view,
  );

  let title = meta.title;
  let eyebrow = meta.eyebrow;

  if (state.route.view === "game") {
    const event = (state.scoreboard?.events || []).find((item) => String(item.id) === String(state.route.id));
    title = event?.shortName || event?.name || "Game Detail";
    eyebrow = "Tale Of The Tape";
  }

  if (state.route.view === "team") {
    const team = state.teamsById?.[state.route.id];
    title = team?.displayName || "Team Detail";
    eyebrow = "Composite Team Card";
  }

  if (state.route.view === "player") {
    const player = state.playerCards?.[state.route.id];
    title = player?.fullName || "Player Detail";
    eyebrow = "Consensus Player Card";
  }

  if (state.route.view === "story") {
    const story = state.newsStories?.[state.route.id];
    title = story?.headline || "Story Detail";
    eyebrow = story?.source || "ESPN Wire";
  }

  return { title, eyebrow };
}
