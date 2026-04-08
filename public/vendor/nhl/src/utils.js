import { ROUTES } from "./config.js";

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function average(values = []) {
  const numeric = values.filter(Number.isFinite);
  if (!numeric.length) return 0;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

export function formatPercent(value, digits = 0) {
  if (!Number.isFinite(value)) return "--";
  return `${round(value * 100, digits)}%`;
}

export function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function formatSigned(value, digits = 1) {
  if (!Number.isFinite(value)) return "--";
  const rounded = round(value, digits);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

export function formatGameTime(isoDate) {
  if (!isoDate) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

export function formatRelativeTime(timestamp) {
  if (!timestamp) return "Awaiting sync";
  const diff = Date.now() - timestamp;
  if (diff < 20 * 1000) return "Updated just now";
  if (diff < 60 * 1000) return `Updated ${Math.floor(diff / 1000)}s ago`;
  if (diff < 60 * 60 * 1000) return `Updated ${Math.floor(diff / 60000)}m ago`;
  return `Updated ${Math.floor(diff / 3600000)}h ago`;
}

export function formatEspnDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

export function getLocalTodayLabel() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

export function getRouteMeta(routeKey) {
  return ROUTES.find((route) => route.key === routeKey) || ROUTES[0];
}

export function parseRoute(hash) {
  const cleaned = (hash || "").replace(/^#/, "");
  if (!cleaned) return { view: "overview", id: null };
  const [view, id] = cleaned.split("/");
  return { view, id: id || null };
}

export function toRouteHash(view, id = null) {
  return `#${view}${id ? `/${id}` : ""}`;
}

export function normalizeApiUrl(url) {
  if (!url) return null;
  return url.replace("http://", "https://").replace(".pvt", ".com");
}

export function extractIdFromRef(ref) {
  if (!ref) return null;
  const clean = normalizeApiUrl(ref);
  const match = clean.match(/\/(\d+)(?:\?|$)/);
  return match ? match[1] : null;
}

export function getStatValue(items, name, fallback = 0) {
  if (!Array.isArray(items)) return fallback;
  const stat = items.find((entry) => entry.name === name || entry.type === name);
  return Number(stat?.value ?? stat?.displayValue ?? fallback);
}

export function getDisplayStat(items, name, fallback = "--") {
  if (!Array.isArray(items)) return fallback;
  const stat = items.find((entry) => entry.name === name || entry.type === name);
  return stat?.displayValue ?? fallback;
}

export function buildTeamLookup(teams = []) {
  return Object.fromEntries(teams.map((entry) => [entry.id, entry]));
}

export function compareByScore(a, b, key = "compositeScore") {
  return (b?.[key] ?? 0) - (a?.[key] ?? 0);
}

export function uniqBy(items, selector) {
  const seen = new Set();
  return items.filter((item) => {
    const value = selector(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function isMorningCarryoverWindow(date = new Date()) {
  return date.getHours() < 10;
}

export function getThemeLogo(team) {
  if (!team?.logos?.length) return team?.logo || "";
  const mode = document.body.dataset.theme === "light" ? "default" : "dark";
  const preferred = team.logos.find((logo) => logo.rel?.includes(mode)) || team.logos[0];
  return preferred.href || team.logo || "";
}

export function inferSeasonYear(scoreboard) {
  return scoreboard?.leagues?.[0]?.season?.year || new Date().getFullYear();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getEasternDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function getEasternResetDate(date = new Date(), resetHour = 6) {
  const et = getEasternDateParts(date);
  const midnightUtc = Date.UTC(et.year, et.month - 1, et.day, 0, 0, 0);
  const currentEtMs = midnightUtc + (((et.hour * 60) + et.minute) * 60 + et.second) * 1000;
  const resetUtc = midnightUtc + (resetHour * 60 * 60 * 1000);
  if (currentEtMs >= resetUtc) {
    return new Date(midnightUtc);
  }
  return new Date(midnightUtc - 24 * 60 * 60 * 1000);
}

export function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function buildEasternDateKey(date = new Date()) {
  const et = getEasternDateParts(date);
  return `${et.year}${String(et.month).padStart(2, "0")}${String(et.day).padStart(2, "0")}`;
}

export function getNextEasternResetTimestamp(date = new Date(), resetHour = 6) {
  const cycleStart = getEasternResetDate(date, resetHour);
  const nextCycle = addDays(cycleStart, 1);
  return nextCycle.getTime() + (resetHour * 60 * 60 * 1000);
}

export function resolveNhlHeadshot(playerId, teamAbbrev = "", seasonYear = inferSeasonYear(), existing = "") {
  if (existing) return existing;
  const id = String(playerId || "").trim();
  if (!id) return "";
  const club = String(teamAbbrev || "").split(",")[0].trim();
  if (club) {
    return `https://assets.nhle.com/mugs/nhl/${seasonYear}/${club}/${id}.png`;
  }
  return `https://a.espncdn.com/i/headshots/nhl/players/full/${id}.png`;
}

export function normalizeNhlPosition(code = "") {
  const upper = String(code || "").toUpperCase();
  if (upper === "G") return "G";
  if (upper === "D") return "D";
  if (upper === "C") return "C";
  if (upper === "LW" || upper === "RW" || upper === "L" || upper === "R" || upper === "W") return "W";
  return "W";
}
