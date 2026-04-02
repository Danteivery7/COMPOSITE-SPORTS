import {
  formatGameTime,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatSigned,
  getThemeLogo,
  getRouteMeta,
  round,
  toRouteHash,
} from "./utils.js";
import {
  buildGameProjection,
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
            <p class="team-sub">${awayRank ? `Rank #${awayRank.rank} • ${awayRank.compositeScore} OVR` : away.team.abbreviation}</p>
          </div>
          <div class="team-score">${escapeHtml(away.score || "0")}</div>
        </div>
        <div class="team-row">
          <img src="${escapeHtml(home.team.logo || logoFor(home.team))}" alt="${escapeHtml(home.team.displayName)}" />
          <div>
            <h4 class="team-name">${escapeHtml(home.team.displayName)}</h4>
            <p class="team-sub">${homeRank ? `Rank #${homeRank.rank} • ${homeRank.compositeScore} OVR` : home.team.abbreviation}</p>
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
        ${projection ? `<span class="trend-chip ${projection.marketEdge > 0 ? "up" : "flat"}">Model ${formatPercent(projection.homeWinProbability, 0)}</span>` : ""}
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
          <span>${escapeHtml(team.streakDisplay)} • ${team.overall.displayValue}</span>
        </span>
      </span>
      <span class="rank-copy">
        <strong>${team.compositeScore}</strong>
        <span>${team.trendLabel}</span>
      </span>
    </button>
  `;
}

function renderFeaturedPlayer(player) {
  return `
    <button class="player-card ${player.provisionalOvr >= 88 ? "is-gold" : ""}" data-nav-hash="${toRouteHash("player", player.playerId)}">
      <div class="player-head">
        <div class="player-meta">
          <p class="eyebrow">${escapeHtml(player.team?.abbreviation || "NHL")} • Featured model card</p>
          <h3 class="player-heading">${escapeHtml(player.fullName || player.playerId)}</h3>
          <p class="player-sub">${escapeHtml(
            player.featured.map((entry) => `${entry.label} #${entry.rank}`).join(" • "),
          )}</p>
        </div>
        <span class="rank-chip">${player.provisionalOvr} OVR</span>
      </div>
      <div class="inline-list">
        ${player.featured
          .slice(0, 3)
          .map(
            (entry) =>
              `<span class="stat-chip"><strong>${escapeHtml(entry.label)}</strong> ${escapeHtml(entry.displayValue)}</span>`,
          )
          .join("")}
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
  const players = state.featuredPlayers || [];
  const predictorCards = state.predictorCards || [];
  const news = state.news || [];

  return `
    <section class="dashboard-grid">
      <article class="hero-panel glass-panel">
        <div class="hero-row">
          <div>
            <p class="eyebrow">League Pulse • ${escapeHtml(state.todayLabel)}</p>
            <h3 class="hero-title">Hockey tracking with live market context.</h3>
            <p class="hero-subtitle">${escapeHtml(pulse?.headline || "Syncing the COMPOSITE NHL engine.")}</p>
            <div class="hero-actions">
              ${routeButton("Open Live Slate", toRouteHash("scores"), true)}
              ${routeButton("View Power Rankings", toRouteHash("rankings"))}
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
            <p class="eyebrow">Featured Players</p>
            <h3 class="section-title">Leader-driven OVR board</h3>
          </div>
          ${routeButton("Players view", toRouteHash("players"))}
        </div>
        <div class="player-stack">
          ${players.slice(0, 6).map(renderFeaturedPlayer).join("") || renderEmptyState("Waiting on players", "Season leader categories will seed the player board here.")}
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
                      ${projection.marketEdge === null ? "No line" : `ML ${formatSigned(projection.marketEdge * 100, 1)} pts`}
                    </span>
                  </div>
                  <div class="chip-row">
                    <span class="stat-chip"><strong>Home</strong> ${formatPercent(projection.homeWinProbability, 0)}</span>
                    <span class="stat-chip"><strong>Total</strong> ${projection.projectedTotal}</span>
                    ${projection.totalEdge !== null ? `<span class="stat-chip"><strong>O/U</strong> ${projection.totalEdge > 0 ? "Over" : "Under"} ${round(Math.abs(projection.totalEdge), 1)}</span>` : ""}
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
    return renderEmptyState("No games loaded", "The live scoreboard will appear once ESPN returns the current slate.");
  }

  return `
    <section class="list-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Game Lifecycle</p>
          <h3 class="section-title">Live scores and slate states</h3>
          <p class="section-subtitle">Scheduled, starting soon, live, and final games all stay visible with model overlays and odds context.</p>
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
    return renderEmptyState("Rankings are still building", "Team ratings need standings and team-stat responses to complete.");
  }

  return `
    <section class="two-column-grid">
      <article class="list-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Composite Team Engine</p>
            <h3 class="section-title">League power board</h3>
            <p class="section-subtitle">Weighted from win rate, goal differential, offense, defense, special teams, faceoffs, and goaltending efficiency.</p>
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
            <h3 class="section-title">Top control surfaces</h3>
          </div>
        </div>
        <div class="meter-list">
          ${rankings.slice(0, 8).map(
            (team) => `
              <button class="leader-card" data-nav-hash="${toRouteHash("team", team.id)}">
                <div class="row-between">
                  <span class="leader-copy">
                    <img src="${escapeHtml(logoFor(team.team))}" alt="${escapeHtml(team.team.displayName)}" />
                    <span class="leader-meta">
                      <strong>${escapeHtml(team.team.displayName)}</strong>
                      <span>${team.overall.displayValue}</span>
                    </span>
                  </span>
                  <span class="rank-chip">${team.compositeScore}</span>
                </div>
                <div class="metric-strip">
                  ${renderMiniMetric("Offense", String(team.offenseScore))}
                  ${renderMiniMetric("Defense", String(team.defenseScore))}
                  ${renderMiniMetric("Control", String(team.controlScore))}
                  ${renderMiniMetric("Momentum", formatSigned(team.momentumScore, 1))}
                </div>
              </button>
            `,
          ).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderPlayers(state) {
  const players = state.featuredPlayers || [];
  if (!players.length) {
    return renderEmptyState("Players are still syncing", "Season leaders seed the player board once the core feed returns.");
  }

  return `
    <section class="list-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Player Ratings</p>
          <h3 class="section-title">Featured skaters and goalies</h3>
          <p class="section-subtitle">Leader-driven surfacing now, full player OVR and hotness detail when you open a profile.</p>
        </div>
      </div>
      <div class="cards-grid">
        ${players.map(renderFeaturedPlayer).join("")}
      </div>
    </section>
  `;
}

function renderPredictor(state) {
  const cards = state.predictorCards || [];
  if (!cards.length) {
    return renderEmptyState("Predictor queue is empty", "As soon as upcoming games and team ranks are both ready, the model board will populate.");
  }

  return `
    <section class="list-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Betting Engine</p>
          <h3 class="section-title">Model score vs DraftKings context</h3>
          <p class="section-subtitle">Moneyline and totals are compared against the internal win-probability and scoring model to surface directional edges.</p>
        </div>
      </div>
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
                  ${renderMiniMetric("Home Win", formatPercent(projection.homeWinProbability, 0), projection.homeMoneyline ? `DK ${projection.homeMoneyline}` : "No ML")}
                  ${renderMiniMetric("Away Win", formatPercent(projection.awayWinProbability, 0), projection.awayMoneyline ? `DK ${projection.awayMoneyline}` : "No ML")}
                  ${renderMiniMetric("Projected Total", String(projection.projectedTotal), projection.odds?.overUnder ? `Line ${projection.odds.overUnder}` : "No total")}
                  ${renderMiniMetric("Margin", formatSigned(projection.projectedMargin, 1), projection.totalEdge === null ? "Shadow edge" : projection.totalEdge > 0 ? `Over by ${round(projection.totalEdge, 1)}` : `Under by ${round(Math.abs(projection.totalEdge), 1)}`)}
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
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
          <p class="section-subtitle">A fast skim of the stories affecting line combinations, playoff races, and tonight's narrative board.</p>
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
            <p class="settings-copy">Instant switching with the global glassmorphism variable system.</p>
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
            <p class="eyebrow">Density</p>
            <h3 class="section-title">Compact mode</h3>
            <p class="settings-copy">Tightens card layouts for heavier stat browsing on laptop-sized screens.</p>
          </div>
          <span class="settings-value">${settings.compactMode ? "Compact" : "Standard"}</span>
        </div>
        <div class="button-row">
          <button class="toggle-button ${!settings.compactMode ? "is-active" : ""}" data-setting="compactMode" data-value="false">Standard</button>
          <button class="toggle-button ${settings.compactMode ? "is-active" : ""}" data-setting="compactMode" data-value="true">Compact</button>
        </div>
      </article>

      <article class="setting-card">
        <div class="settings-head">
          <div>
            <p class="eyebrow">Data Cadence</p>
            <h3 class="section-title">Cache model</h3>
            <p class="settings-copy">Players cache for an hour, live scoreboard for ten seconds, and rankings for twelve hours with snapshot-based trend arrows.</p>
          </div>
        </div>
        <div class="list-stack">
          ${renderMiniMetric("Players", "1h", "career + season profiles")}
          ${renderMiniMetric("Scores", "10s", "live slate polling")}
          ${renderMiniMetric("Rankings", "12h", "snapshot-based trends")}
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
  const leaders = summary?.leaders || [];
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
                ${renderMiniMetric("Home Win", formatPercent(projection.homeWinProbability, 0), projection.homeMoneyline ? `DK ${projection.homeMoneyline}` : "Shadow line")}
                ${renderMiniMetric("Model Score", projection.modelScoreLabel, "Projected final")}
                ${renderMiniMetric("Total", String(projection.projectedTotal), lines?.overUnder ? `Market ${lines.overUnder}` : "No total")}
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
          ${
            summary?.standings?.length
              ? summary.standings
                  .map(
                    (block) => `
                      <div class="leader-card">
                        <h4 class="panel-title">${escapeHtml(block.header || "Standings Snapshot")}</h4>
                        <p class="small-note">${escapeHtml(block.href || "")}</p>
                      </div>
                    `,
                  )
                  .join("")
              : ""
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
            <p class="eyebrow">Top Performers</p>
            <h3 class="section-title">Leaders and boxscore edges</h3>
          </div>
        </div>
        <div class="list-stack">
          ${
            leaders.length
              ? leaders
                  .map(
                    (block) => `
                      <div class="leader-card">
                        <div class="row-between">
                          <span class="leader-copy">
                            <img src="${escapeHtml(block.team?.logo || "")}" alt="${escapeHtml(block.team?.displayName || "")}" />
                            <span class="leader-meta">
                              <strong>${escapeHtml(block.team?.displayName || "Team")}</strong>
                              <span>${escapeHtml(block.team?.abbreviation || "")}</span>
                            </span>
                          </span>
                        </div>
                        <div class="inline-list">
                          ${(block.leaders || [])
                            .map(
                              (leaderGroup) =>
                                `<span class="stat-chip"><strong>${escapeHtml(leaderGroup.displayName)}</strong> ${escapeHtml(
                                  leaderGroup.leaders?.[0]?.athlete?.displayName || "--",
                                )} ${escapeHtml(leaderGroup.leaders?.[0]?.displayValue || "")}</span>`,
                            )
                            .join("")}
                        </div>
                      </div>
                    `,
                  )
                  .join("")
              : '<p class="small-note">Team leaders will appear here once the summary feed fills in.</p>'
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

  const history = player.statisticsLog?.entries || [];
  return `
    <section class="detail-grid">
      <article class="detail-card detail-hero">
        <div class="detail-head">
          <div class="leader-copy">
            ${player.headshot ? `<img class="mini-logo" src="${escapeHtml(player.headshot)}" alt="${escapeHtml(player.fullName)}" />` : ""}
            <div>
              <p class="eyebrow">${escapeHtml(player.team?.displayName || "NHL")} • #${escapeHtml(player.jersey)} • ${escapeHtml(player.position)}</p>
              <h3 class="section-title">${escapeHtml(player.fullName)}</h3>
              <p class="detail-meta">Age ${player.age || "--"} • ${escapeHtml(player.profile.birthPlace?.city || "")}${player.profile.birthCountry?.abbreviation ? `, ${escapeHtml(player.profile.birthCountry.abbreviation)}` : ""}</p>
            </div>
          </div>
          <span class="rank-chip">${player.overall} OVR</span>
        </div>
        <div class="chip-row">
          <span class="tone-chip ${player.tone.className}">${escapeHtml(player.tone.label)} ${player.hotnessScore}/5</span>
          <span class="status-pill">Trust ${formatPercent(player.sampleTrust, 0)}</span>
        </div>
        <div class="metric-strip">
          ${renderMiniMetric("Games", String(player.games))}
          ${renderMiniMetric("PPG", String(player.seasonPpg), `Career ${player.careerPpg}`)}
          ${player.position === "G" ? renderMiniMetric("SV%", player.savePct) : renderMiniMetric("Points", String(player.seasonPoints))}
          ${player.position === "G" ? renderMiniMetric("GAA", player.gaa) : renderMiniMetric("Shooting", player.shootingPct)}
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
            .filter((stat) => ["games", "goals", "assists", "points", "plusMinus", "shootingPct", "savePct", "avgGoalsAgainst", "shutouts", "wins"].includes(stat.name))
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
            <h3 class="section-title">Season log references</h3>
          </div>
        </div>
        <div class="timeline-stack">
          ${
            history.length
              ? history
                  .map(
                    (entry) => `
                      <div class="timeline-item">
                        <div class="timeline-time">${escapeHtml(entry.season?.$ref?.match(/seasons\/(\d+)/)?.[1] || "Season")}</div>
                        <div>
                          <strong>${escapeHtml(entry.statistics?.[0]?.type || "Total")}</strong>
                          <p class="small-note">${escapeHtml(entry.statistics?.[0]?.statistics?.$ref || "Career line attached")}</p>
                        </div>
                      </div>
                    `,
                  )
                  .join("")
              : '<p class="small-note">Career references are still loading.</p>'
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
          ${renderMiniMetric("Hotness", `${player.tone.label} ${player.hotnessScore}/5`, "Season vs career splits")}
          ${renderMiniMetric("Sample Trust", formatPercent(player.sampleTrust, 0), player.sampleTrust < 1 ? "Regressed toward baseline" : "Full confidence")}
          ${renderMiniMetric("Age Adjustment", player.age > 34 ? `${player.age - 34} yrs over peak` : "None", player.age > 34 ? "2.5% penalty per year" : "No decay applied")}
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
  const rosterCount = (teamBundle.roster?.athletes || []).reduce((total, bucket) => total + (bucket.items?.length || 0), 0);

  return `
    <section class="detail-grid">
      <article class="detail-card detail-hero">
        <div class="detail-head">
          <div class="leader-copy">
            <img src="${escapeHtml(logoFor(team))}" alt="${escapeHtml(team.displayName)}" />
            <div>
              <p class="eyebrow">${escapeHtml(team.location)} • ${escapeHtml(team.abbreviation)}</p>
              <h3 class="section-title">${escapeHtml(team.displayName)}</h3>
              <p class="detail-meta">${escapeHtml(ranking.overall.displayValue)} • Rank #${ranking.rank} • ${ranking.trendLabel}</p>
            </div>
          </div>
          <span class="rank-chip">${ranking.compositeScore} OVR</span>
        </div>
        <div class="metric-strip">
          ${renderMiniMetric("Offense", String(ranking.offenseScore))}
          ${renderMiniMetric("Defense", String(ranking.defenseScore))}
          ${renderMiniMetric("Control", String(ranking.controlScore))}
          ${renderMiniMetric("Roster", String(rosterCount), "active players")}
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
          <span class="stat-chip"><strong>Win%</strong> ${formatPercent(ranking.winPct, 1)}</span>
          <span class="stat-chip"><strong>GF/G</strong> ${ranking.goalsForPerGame}</span>
          <span class="stat-chip"><strong>GA/G</strong> ${ranking.goalsAgainstPerGame}</span>
          <span class="stat-chip"><strong>PP%</strong> ${ranking.powerPlayPct}</span>
          <span class="stat-chip"><strong>PK%</strong> ${ranking.penaltyKillPct}</span>
          <span class="stat-chip"><strong>SV%</strong> ${ranking.savePct}</span>
          <span class="stat-chip"><strong>FO%</strong> ${ranking.faceoffPct}</span>
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
                  .map(
                    (category) => `
                      <div class="timeline-item">
                        <div class="timeline-time">${escapeHtml(category.displayName)}</div>
                        <div>
                          <strong>${escapeHtml(category.leaders?.[0]?.displayValue || "--")}</strong>
                          <p class="small-note">${escapeHtml(category.leaders?.[0]?.athlete?.displayName || "No leader")}</p>
                        </div>
                      </div>
                    `,
                  )
                  .join("")
              : '<p class="small-note">Team leaders are still syncing.</p>'
          }
        </div>
      </article>

      <article class="detail-card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Stat Feed</p>
            <h3 class="section-title">Raw categories</h3>
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
