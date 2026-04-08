import { DEFAULT_SETTINGS } from "./config.js";
import { readCachedSettings, writeCachedSettings } from "./cache.js";
import {
  getAdvancedLeagueSnapshot,
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
  buildPlayerDirectory,
  buildPlayerCard,
  buildPredictorCards,
  buildRankingsLookup,
  buildSpotlightCards,
  buildTeamNewsMap,
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
  themeButton: document.querySelector("#theme-button"),
  sidebarThemeButton: document.querySelector("#sidebar-theme-button"),
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
  openedFromHub: new URLSearchParams(location.search).get("from") === "hub",
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
  advancedSnapshot: null,
  teamRankings: [],
  rankingsById: {},
  featuredPlayers: [],
  playerDirectory: [],
  playerDirectoryById: {},
  predictorCards: [],
  teamNewsById: {},
  news: [],
  newsStories: {},
  teamBundles: {},
  playerCards: {},
  gameSummaries: {},
  leaguePulse: null,
  spotlights: [],
  searchIndex: [],
  searchQuery: "",
  playerFilter: "",
  predictorSelection: {
    homeTeamId: "",
    awayTeamId: "",
  },
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

function settledValue(result, fallback) {
  return result?.status === "fulfilled" ? result.value : fallback;
}

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
  if (state.advancedSnapshot && state.teams.length) {
    state.playerDirectory = buildPlayerDirectory(
      state.advancedSnapshot,
      state.rosters,
      state.teamsById,
      state.standings,
    );
    state.playerDirectoryById = Object.fromEntries(
      state.playerDirectory.map((player) => [player.playerId, player]),
    );
  }

  if (state.standings.length && state.teams.length) {
    state.teamRankings = buildTeamRankings(
      state.standings,
      state.teamStatsById,
      state.teamsById,
      state.advancedSnapshot,
      state.playerDirectory,
    );
    state.rankingsById = buildRankingsLookup(state.teamRankings);
  }

  if (state.playerDirectory.length) {
    state.featuredPlayers = state.playerDirectory.slice(0, 30);
  } else if (state.seasonLeaders.length) {
    const leaderEntries = extractSeasonLeaderPlayers(state.seasonLeaders);
    state.featuredPlayers = buildFeaturedPlayers(
      leaderEntries,
      state.teamsById,
      state.advancedSnapshot,
      state.rosters,
      state.standings,
    )
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

  state.teamNewsById = buildTeamNewsMap(state.news, state.teams);

  state.leaguePulse = summarizeLeaguePulse(
    state.scoreboard,
    state.teamRankings,
    state.featuredPlayers,
  );

  state.spotlights = buildSpotlightCards(
    state.teamRankings,
    state.playerDirectory.length ? state.playerDirectory : state.featuredPlayers,
    state.predictorCards,
    state.scoreboard,
  );

  state.searchIndex = buildFilteredSearchIndex(state.teams, state.rosters, state.playerDirectory);

  if ((!state.predictorSelection.homeTeamId || !state.predictorSelection.awayTeamId) && state.teamRankings.length >= 2) {
    state.predictorSelection = {
      homeTeamId: state.teamRankings[0].id,
      awayTeamId: state.teamRankings[1].id,
    };
  }
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
  broadcastTheme();
}

function setTheme(theme) {
  if (theme !== "dark" && theme !== "light") return;
  if (state.settings.theme === theme) return;
  state.settings.theme = theme;
  saveSettings();
  render();
  broadcastTheme();
}

function broadcastTheme() {
  try {
    window.parent.postMessage(
      {
        type: "composite-theme-changed",
        sport: "nhl",
        theme: state.settings.theme,
      },
      window.location.origin,
    );
  } catch (_error) {
    return null;
  }
}

async function loadBaseData(force = false) {
  state.loading.bootstrap = true;
  render();

  const [scoreboardResult, teamsResult, newsResult] = await Promise.allSettled([
    getScoreboardWindow(force),
    getTeams(force),
    getNews(force),
  ]);

  const scoreboard = settledValue(scoreboardResult, state.scoreboard || { events: [] });
  const teams = settledValue(teamsResult, state.teams || []);
  const news = settledValue(newsResult, state.news || []);

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

  const [standingsResult, seasonLeadersResult, rostersResult] = await Promise.allSettled([
    getLeagueStandings(state.seasonYear, force),
    getSeasonLeaders(state.seasonYear, force),
    getAllRosters(teams.map((team) => team.id), force),
  ]);

  state.standings = settledValue(standingsResult, state.standings || []);
  state.seasonLeaders = settledValue(seasonLeadersResult, state.seasonLeaders || []);
  state.rosters = settledValue(rostersResult, state.rosters || {});
  if (state.standings.length) {
    state.lastSync.rankings = Date.now();
  }
  if (state.seasonLeaders.length || Object.keys(state.rosters).length) {
    state.lastSync.players = Date.now();
  }
  recomputeDerivedState();
  render();
  prefetchFeaturedPlayerCards();

  void loadAdvancedSnapshot(force);
  void ensureTeamStats(force);
}

async function loadAdvancedSnapshot(force = false) {
  if (!state.seasonYear || !state.teams.length) return;
  try {
    const advancedSnapshot = await getAdvancedLeagueSnapshot(state.seasonYear, state.teams, force);
    if (!advancedSnapshot) return;
    state.advancedSnapshot = advancedSnapshot;
    state.lastSync.players = Date.now();
    state.lastSync.rankings = Date.now();
    recomputeDerivedState();
    render();
    prefetchFeaturedPlayerCards();
  } catch (_error) {
    return null;
  }
}

async function ensureTeamStats(force = false) {
  if (state.loading.teamStats || !state.teams.length) return;
  if (!force && Object.keys(state.teamStatsById).length) return;

  state.loading.teamStats = true;
  render();
  try {
    const teamIds = state.teams.map((team) => team.id);
    state.teamStatsById = await getAllTeamStatistics(teamIds, force);
    state.lastSync.rankings = Date.now();
    recomputeDerivedState();
    render();
    ensureRouteData();
  } catch (_error) {
    return null;
  } finally {
    state.loading.teamStats = false;
    render();
  }
}

async function ensureRosters(force = false) {
  if (state.loading.rosters || !state.teams.length) return;
  if (!force && Object.keys(state.rosters).length) return;

  state.loading.rosters = true;
  try {
    const teamIds = state.teams.map((team) => team.id);
    state.rosters = await getAllRosters(teamIds, force);
    state.lastSync.players = Date.now();
    recomputeDerivedState();
  } catch (_error) {
    return null;
  } finally {
    state.loading.rosters = false;
    render();
  }
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
  state.playerCards[playerId] = buildPlayerCard(bundle, state.teamsById, {
    playerDirectoryById: state.playerDirectoryById,
    rankingsById: state.rankingsById,
  });
  recomputeDerivedState();
  render();
}

async function ensureNewsStory(storyId, force = false) {
  if (!storyId) return;
  if (!force && state.newsStories[storyId]) return;
  const storyMeta = (state.news || []).find((entry) => String(entry.storyId || entry.id) === String(storyId));
  try {
    const story = await getNewsStory(storyId, storyMeta?.apiHref || "", force);
    state.newsStories[storyId] = story?.headline
      ? story
      : {
          storyId,
          headline: storyMeta?.headline || "Story",
          source: storyMeta?.source || "NHL Feed",
          published: storyMeta?.published || storyMeta?.lastModified || null,
          image: storyMeta?.image || "",
          dek: storyMeta?.description || storyMeta?.summary || "",
          body: `<p>${storyMeta?.description || storyMeta?.summary || "Story details are still syncing inside COMPOSITE NHL."}</p>`,
          related: [],
        };
  } catch (_error) {
    state.newsStories[storyId] = {
      storyId,
      headline: storyMeta?.headline || "Story",
      source: storyMeta?.source || "NHL Feed",
      published: storyMeta?.published || storyMeta?.lastModified || null,
      image: storyMeta?.image || "",
      dek: storyMeta?.description || storyMeta?.summary || "",
      body: `<p>${storyMeta?.description || storyMeta?.summary || "Story details are still syncing inside COMPOSITE NHL."}</p>`,
      related: [],
    };
  }
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

  if (state.route.view === "players" || state.route.view === "teams" || state.searchQuery.length >= 2) {
    prefetchFeaturedPlayerCards(30);
    void ensureRosters();
  }
}

async function refreshScoreboard(force = true) {
  try {
    state.scoreboard = await getScoreboardWindow(force);
    state.lastSync.scoreboard = Date.now();
    if (state.route.view === "game" && state.route.id) {
      void ensureGameSummary(state.route.id, true);
    }
    recomputeDerivedState();
    render();
  } catch (_error) {
    return null;
  }
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
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data?.type === "composite-theme" && data?.sport === "nhl" && (data?.theme === "dark" || data?.theme === "light")) {
      setTheme(data.theme);
    }
  });

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

  dom.themeButton.addEventListener("click", toggleTheme);
  dom.sidebarThemeButton?.addEventListener("click", toggleTheme);

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

  document.addEventListener("input", (event) => {
    const filterTarget = event.target.closest("[data-player-filter]");
    if (filterTarget) {
      state.playerFilter = filterTarget.value || "";
      render();
      return;
    }
  });

  document.addEventListener("change", (event) => {
    const homeSelect = event.target.closest("[data-predictor-home]");
    if (homeSelect) {
      state.predictorSelection.homeTeamId = homeSelect.value || "";
      render();
      return;
    }
    const awaySelect = event.target.closest("[data-predictor-away]");
    if (awaySelect) {
      state.predictorSelection.awayTeamId = awaySelect.value || "";
      render();
    }
  });
}

async function bootstrap() {
  immersiveLayer.mount();
  wireEvents();
  render();
  try {
    await loadBaseData(false);
  } catch (_error) {
    state.loading.bootstrap = false;
    render();
  }
  ensureRouteData();
  schedulePolling();
}

bootstrap();
