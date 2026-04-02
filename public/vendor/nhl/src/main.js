import { DEFAULT_SETTINGS } from "./config.js";
import { readCachedSettings, writeCachedSettings } from "./cache.js";
import {
  extractSeasonLeaderPlayers,
  getAllRosters,
  getAllTeamStatistics,
  getGameSummary,
  getLeagueStandings,
  getNews,
  getNewsStory,
  getPlayerBundle,
  getScoreboardWindow,
  getSeasonLeaders,
  getTeamBundle,
  getTeams,
  pickSeasonYear,
} from "./api.js";
import {
  buildFeaturedPlayers,
  buildFilteredSearchIndex,
  buildGameProjection,
  buildPlayerCard,
  buildPredictorCards,
  buildRankingsLookup,
  buildSpotlightCards,
  buildTeamRankings,
  getGameLifecycle,
  suggestedPollInterval,
  summarizeLeaguePulse,
} from "./analytics.js";
import { renderApp, renderSearchResults, syncRouteChrome } from "./views.js";
import {
  buildTeamLookup,
  formatRelativeTime,
  getLocalTodayLabel,
  parseRoute,
  toRouteHash,
} from "./utils.js";
import { createImmersiveLayer } from "./immersive.js";

const dom = {
  app: document.querySelector("#app-content"),
  navLinks: Array.from(document.querySelectorAll("[data-route]")),
  searchInput: document.querySelector("#global-search"),
  searchResults: document.querySelector("#search-results"),
  refreshButton: document.querySelector("#refresh-button"),
  themeButton: document.querySelector("#theme-button"),
  menuButton: document.querySelector("#menu-button"),
  navOverlay: document.querySelector("#nav-overlay"),
  routeTitle: document.querySelector("#route-title"),
  routeEyebrow: document.querySelector("#route-eyebrow"),
  sidebarStatus: document.querySelector("#sidebar-status"),
  lastUpdated: document.querySelector("#last-updated"),
  fxCanvas: document.querySelector("#ice-fx-layer"),
  introScreen: document.querySelector("#intro-screen"),
  enterRinkButton: document.querySelector("#enter-rink-button"),
};

const state = {
  route: parseRoute(location.hash),
  settings: {
    ...DEFAULT_SETTINGS,
    ...readCachedSettings("settings", {}),
  },
  scoreboard: null,
  teams: [],
  teamsById: {},
  standings: [],
  seasonLeaders: [],
  teamStatsById: {},
  rosters: {},
  teamRankings: [],
  rankingsById: {},
  featuredPlayers: [],
  predictorCards: [],
  news: [],
  newsStories: {},
  teamBundles: {},
  playerCards: {},
  gameSummaries: {},
  leaguePulse: null,
  spotlights: [],
  searchIndex: [],
  searchQuery: "",
  seasonYear: null,
  todayLabel: getLocalTodayLabel(),
  lastSync: {},
  loading: {
    bootstrap: false,
    teamStats: false,
    rosters: false,
  },
  mobileNavOpen: false,
};

let pollTimer = null;
const immersiveLayer = createImmersiveLayer({
  canvas: dom.fxCanvas,
  introScreen: dom.introScreen,
  enterButton: dom.enterRinkButton,
});

function saveSettings() {
  writeCachedSettings("settings", state.settings);
}

function applyTheme() {
  document.body.dataset.theme = state.settings.theme;
}

function markActiveNav() {
  const active = ["game", "team", "player"].includes(state.route.view)
    ? "overview"
    : state.route.view === "story"
      ? "news"
      : state.route.view;
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.route === active);
  });
}

function updateSidebarStatus() {
  const liveCount = (state.scoreboard?.events || []).filter(
    (event) => getGameLifecycle(event).key === "live",
  ).length;
  const soonCount = (state.scoreboard?.events || []).filter((event) => {
    const lifecycle = getGameLifecycle(event);
    return lifecycle.key === "soon" || lifecycle.key === "fire";
  }).length;
  const topTeam = state.teamRankings?.[0];

  dom.sidebarStatus.innerHTML = [
    `<span class="status-pill ${liveCount ? "is-live" : ""}">${liveCount ? '<span class="live-dot"></span>' : ""}${liveCount} live</span>`,
    `<span class="status-pill ${soonCount ? "is-soon" : ""}">${soonCount} soon</span>`,
    topTeam
      ? `<span class="status-pill ${topTeam.rank <= 10 ? "is-fire" : ""}">#${topTeam.rank} ${topTeam.team.abbreviation}</span>`
      : `<span class="status-pill">Rankings loading</span>`,
  ].join("");

  dom.lastUpdated.textContent = state.lastSync.scoreboard
    ? formatRelativeTime(state.lastSync.scoreboard)
    : "Awaiting first sync";
}

function updateRouteChrome() {
  const chrome = syncRouteChrome(state);
  dom.routeTitle.textContent = chrome.title;
  dom.routeEyebrow.textContent = chrome.eyebrow;
}

function syncMobileNav() {
  document.body.classList.toggle("nav-open", state.mobileNavOpen);
}

function recomputeDerivedState() {
  if (state.standings.length && Object.keys(state.teamStatsById).length && state.teams.length) {
    state.teamRankings = buildTeamRankings(state.standings, state.teamStatsById, state.teamsById);
    state.rankingsById = buildRankingsLookup(state.teamRankings);
  }

  if (state.seasonLeaders.length) {
    const leaderEntries = extractSeasonLeaderPlayers(state.seasonLeaders);
    state.featuredPlayers = buildFeaturedPlayers(leaderEntries, state.teamsById)
      .map((player) => {
        const fullCard = state.playerCards[player.playerId];
        return fullCard
          ? {
              ...player,
              fullName: fullCard.fullName,
              shortName: fullCard.shortName,
              headshot: fullCard.headshot,
              provisionalOvr: fullCard.overall,
              tone: fullCard.tone,
            }
          : player;
      })
      .slice(0, 30);
  }

  if (state.scoreboard && state.teamRankings.length) {
    state.predictorCards = buildPredictorCards(state.scoreboard, state.teamRankings);
  }

  state.leaguePulse = summarizeLeaguePulse(
    state.scoreboard,
    state.teamRankings,
    state.featuredPlayers,
  );

  state.spotlights = buildSpotlightCards(
    state.teamRankings,
    state.featuredPlayers,
    state.predictorCards,
    state.scoreboard,
  );

  state.searchIndex = buildFilteredSearchIndex(state.teams, state.rosters, state.featuredPlayers);
}

function prefetchFeaturedPlayerCards(limit = 6) {
  state.featuredPlayers.slice(0, limit).forEach((player) => {
    if (!state.playerCards[player.playerId]) {
      void ensurePlayerCard(player.playerId);
    }
  });
}

function render() {
  applyTheme();
  updateRouteChrome();
  markActiveNav();
  updateSidebarStatus();
  dom.app.innerHTML = renderApp(state);
}

function navigate(hash) {
  state.mobileNavOpen = false;
  syncMobileNav();
  if (location.hash === hash) {
    state.route = parseRoute(hash);
    ensureRouteData();
    render();
    return;
  }
  location.hash = hash;
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  saveSettings();
  render();
}

async function loadBaseData(force = false) {
  state.loading.bootstrap = true;
  render();

  const [scoreboard, teams, news] = await Promise.all([
    getScoreboardWindow(force),
    getTeams(force),
    getNews(force),
  ]);

  state.scoreboard = scoreboard;
  state.teams = teams;
  state.teamsById = buildTeamLookup(teams);
  state.news = news;
  state.seasonYear = pickSeasonYear(scoreboard);
  state.lastSync.scoreboard = Date.now();
  state.lastSync.teams = Date.now();
  state.lastSync.news = Date.now();
  recomputeDerivedState();
  state.loading.bootstrap = false;
  render();

  const [standings, seasonLeaders] = await Promise.all([
    getLeagueStandings(state.seasonYear, force),
    getSeasonLeaders(state.seasonYear, force),
  ]);

  state.standings = standings;
  state.seasonLeaders = seasonLeaders;
  state.lastSync.rankings = Date.now();
  state.lastSync.players = Date.now();
  recomputeDerivedState();
  render();
  prefetchFeaturedPlayerCards();

  void ensureTeamStats(force);
}

async function ensureTeamStats(force = false) {
  if (state.loading.teamStats || !state.teams.length) return;
  if (!force && Object.keys(state.teamStatsById).length) return;

  state.loading.teamStats = true;
  render();
  const teamIds = state.teams.map((team) => team.id);
  state.teamStatsById = await getAllTeamStatistics(teamIds, force);
  state.lastSync.rankings = Date.now();
  state.loading.teamStats = false;
  recomputeDerivedState();
  render();
  ensureRouteData();
}

async function ensureRosters(force = false) {
  if (state.loading.rosters || !state.teams.length) return;
  if (!force && Object.keys(state.rosters).length) return;

  state.loading.rosters = true;
  const teamIds = state.teams.map((team) => team.id);
  state.rosters = await getAllRosters(teamIds, force);
  state.lastSync.players = Date.now();
  state.loading.rosters = false;
  recomputeDerivedState();
  render();
}

async function ensureGameSummary(eventId, force = false) {
  if (!eventId) return;
  if (!force && state.gameSummaries[eventId]) return;
  state.gameSummaries[eventId] = await getGameSummary(eventId, force);
  state.lastSync.scoreboard = Date.now();
  render();
}

async function ensureTeamBundle(teamId, force = false) {
  if (!teamId || !state.seasonYear) return;
  if (!force && state.teamBundles[teamId]) return;
  state.teamBundles[teamId] = await getTeamBundle(teamId, state.seasonYear, force);
  render();
}

async function ensurePlayerCard(playerId, force = false) {
  if (!playerId || !state.seasonYear) return;
  if (!force && state.playerCards[playerId]) return;
  const bundle = await getPlayerBundle(playerId, state.seasonYear, force);
  state.playerCards[playerId] = buildPlayerCard(bundle, state.teamsById);
  recomputeDerivedState();
  render();
}

async function ensureNewsStory(storyId, force = false) {
  if (!storyId) return;
  if (!force && state.newsStories[storyId]) return;
  const storyMeta = (state.news || []).find((entry) => String(entry.storyId || entry.id) === String(storyId));
  state.newsStories[storyId] = await getNewsStory(storyId, storyMeta?.apiHref || "", force);
  render();
}

async function ensureRouteData(force = false) {
  if (state.route.view === "game" && state.route.id) {
    void ensureGameSummary(state.route.id, force);
  }

  if (state.route.view === "team" && state.route.id) {
    void ensureTeamBundle(state.route.id, force);
  }

  if (state.route.view === "player" && state.route.id) {
    void ensurePlayerCard(state.route.id, force);
  }

  if (state.route.view === "story" && state.route.id) {
    void ensureNewsStory(state.route.id, force);
  }

  if (state.route.view === "players" || state.searchQuery.length >= 2) {
    prefetchFeaturedPlayerCards(30);
    void ensureRosters();
  }
}

async function refreshScoreboard(force = true) {
  state.scoreboard = await getScoreboardWindow(force);
  state.lastSync.scoreboard = Date.now();
  if (state.route.view === "game" && state.route.id) {
    void ensureGameSummary(state.route.id, true);
  }
  recomputeDerivedState();
  render();
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function schedulePolling() {
  stopPolling();
  if (!state.settings.autoRefresh || !state.scoreboard) return;
  pollTimer = setTimeout(async () => {
    try {
      await refreshScoreboard(true);
    } catch (_error) {
      return null;
    }
    schedulePolling();
  }, suggestedPollInterval(state.scoreboard));
}

function updateSearchResults() {
  const query = state.searchQuery.trim().toLowerCase();
  if (query.length < 2) {
    dom.searchResults.classList.add("hidden");
    dom.searchResults.innerHTML = "";
    return;
  }

  const results = state.searchIndex
    .filter((entry) => entry.title.toLowerCase().includes(query))
    .slice(0, 8);

  dom.searchResults.innerHTML = renderSearchResults(results);
  dom.searchResults.classList.remove("hidden");
}

function handleSettingClick(button) {
  const key = button.dataset.setting;
  const raw = button.dataset.value;
  if (!key) return;
  state.settings[key] = raw === "true" ? true : raw === "false" ? false : raw;
  saveSettings();
  render();
  schedulePolling();
}

function handleAppClick(event) {
  const routeTarget = event.target.closest("[data-route]");
  if (routeTarget?.dataset.route) {
    event.preventDefault();
    dom.searchResults.classList.add("hidden");
    state.mobileNavOpen = false;
    syncMobileNav();
    navigate(toRouteHash(routeTarget.dataset.route));
    return;
  }

  const navTarget = event.target.closest("[data-nav-hash]");
  if (navTarget) {
    event.preventDefault();
    dom.searchResults.classList.add("hidden");
    state.mobileNavOpen = false;
    syncMobileNav();
    navigate(navTarget.dataset.navHash);
    return;
  }

  const settingTarget = event.target.closest("[data-setting]");
  if (settingTarget) {
    event.preventDefault();
    handleSettingClick(settingTarget);
    return;
  }
}

function wireEvents() {
  window.addEventListener("hashchange", () => {
    state.route = parseRoute(location.hash);
    ensureRouteData();
    render();
  });

  document.addEventListener("click", (event) => {
    handleAppClick(event);
    if (!event.target.closest(".search-shell") && !event.target.closest("#search-results")) {
      dom.searchResults.classList.add("hidden");
    }
  });

  dom.refreshButton.addEventListener("click", async () => {
    await loadBaseData(true);
    await refreshScoreboard(true);
    ensureRouteData(true);
    schedulePolling();
  });

  dom.themeButton.addEventListener("click", toggleTheme);

  dom.menuButton?.addEventListener("click", () => {
    state.mobileNavOpen = !state.mobileNavOpen;
    syncMobileNav();
  });

  dom.navOverlay?.addEventListener("click", () => {
    state.mobileNavOpen = false;
    syncMobileNav();
  });

  dom.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value || "";
    updateSearchResults();
    if (state.searchQuery.trim().length >= 2) {
      void ensureRosters();
    }
  });

  dom.searchInput.addEventListener("focus", () => {
    updateSearchResults();
  });
}

async function bootstrap() {
  immersiveLayer.mount();
  wireEvents();
  render();
  await loadBaseData(false);
  ensureRouteData();
  schedulePolling();
}

bootstrap();
