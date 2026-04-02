import { ROUTES } from "./config.js";

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
