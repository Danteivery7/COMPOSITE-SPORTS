export const CACHE_PREFIX = "composite-nhl-v4";

export const TTL = {
  SCOREBOARD: 10 * 1000,
  SUMMARY: 20 * 1000,
  PLAYERS: 60 * 60 * 1000,
  TEAMS: 12 * 60 * 60 * 1000,
  RANKINGS: 12 * 60 * 60 * 1000,
  NEWS: 45 * 60 * 1000,
  ROSTERS: 12 * 60 * 60 * 1000,
  TEAM_DETAILS: 4 * 60 * 60 * 1000,
  ADVANCED: 6 * 60 * 60 * 1000,
};

export const API = {
  site: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl",
  core: "https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl",
};

export const ROUTES = [
  { key: "overview", title: "Overview", eyebrow: "League Intelligence" },
  { key: "scores", title: "Live Scores", eyebrow: "Real-Time Scoreboard" },
  { key: "rankings", title: "Rankings", eyebrow: "Composite Power Model" },
  { key: "teams", title: "Teams", eyebrow: "Club Directory" },
  { key: "players", title: "Players", eyebrow: "Player Ratings" },
  { key: "predictor", title: "Predictor", eyebrow: "Model vs Market" },
  { key: "news", title: "News", eyebrow: "ESPN Wire" },
  { key: "settings", title: "Settings", eyebrow: "Theme + Controls" },
];

export const LEADER_CATEGORY_LABELS = {
  goals: "Goals",
  assists: "Assists",
  points: "Points",
  plusMinus: "+/-",
  gameWinningGoals: "GWG",
  savePct: "SV%",
  avgGoalsAgainst: "GAA",
  shutouts: "Shutouts",
  wins: "Wins",
  shots: "Shots",
  faceoffPercent: "Faceoffs",
  blockedShots: "Blocks",
  hits: "Hits",
};

export const DEFAULT_SETTINGS = {
  theme: "light",
  autoRefresh: true,
  compactMode: false,
  accentMode: "Aurora Ice",
};
