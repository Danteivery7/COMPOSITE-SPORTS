import { API, TTL } from "./config.js";
import { loadWithCache } from "./cache.js";
import {
  extractIdFromRef,
  formatEspnDate,
  inferSeasonYear,
  isMorningCarryoverWindow,
  normalizeApiUrl,
  sleep,
} from "./utils.js";

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? 14000);

  try {
    const response = await fetch(normalizeApiUrl(url), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(items, mapper, concurrency = 6) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await mapper(items[index], index);
      } catch (_error) {
        results[index] = null;
      }
      if (cursor % concurrency === 0) {
        await sleep(20);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function resolveStandingsUrl(seasonYear) {
  return `${API.core}/seasons/${seasonYear}/types/2/groups/9/standings/0?lang=en&region=us`;
}

function resolveSeasonLeadersUrl(seasonYear) {
  return `${API.core}/seasons/${seasonYear}/types/2/leaders?lang=en&region=us`;
}

export async function fetchScoreboardForDate(dateKey) {
  return fetchJson(`${API.site}/scoreboard?dates=${dateKey}`);
}

export async function getScoreboardWindow(force = false) {
  const today = new Date();
  const dateKeys = [formatEspnDate(today)];
  if (isMorningCarryoverWindow(today)) {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    dateKeys.unshift(formatEspnDate(yesterday));
  }

  const payloads = await mapWithConcurrency(
    dateKeys,
    async (dateKey) => {
      const resource = await loadWithCache(
        `scoreboard:${dateKey}`,
        TTL.SCOREBOARD,
        () => fetchScoreboardForDate(dateKey),
        { force },
      );
      return resource.data;
    },
    2,
  );

  const primary = payloads[payloads.length - 1] || {};
  const events = payloads.flatMap((payload) => payload?.events || []);

  return {
    ...primary,
    events,
  };
}

export async function getTeams(force = false) {
  const resource = await loadWithCache(
    "teams",
    TTL.TEAMS,
    async () => {
      const payload = await fetchJson(`${API.site}/teams`);
      const teams =
        payload?.sports?.[0]?.leagues?.[0]?.teams?.map((entry) => ({
          ...entry.team,
          id: String(entry.team.id),
        })) || [];
      return teams;
    },
    { force },
  );

  return resource.data;
}

export async function getNews(force = false) {
  const resource = await loadWithCache(
    "news",
    TTL.NEWS,
    async () => {
      const payload = await fetchJson(`${API.site}/news`);
      return payload?.articles || [];
    },
    { force },
  );

  return resource.data;
}

export async function getLeagueStandings(seasonYear, force = false) {
  const resource = await loadWithCache(
    `standings:${seasonYear}`,
    TTL.RANKINGS,
    () => fetchJson(resolveStandingsUrl(seasonYear)),
    { force },
  );

  return resource.data?.standings || [];
}

export async function getSeasonLeaders(seasonYear, force = false) {
  const resource = await loadWithCache(
    `season-leaders:${seasonYear}`,
    TTL.PLAYERS,
    () => fetchJson(resolveSeasonLeadersUrl(seasonYear)),
    { force },
  );

  return resource.data?.categories || [];
}

export async function getGameSummary(eventId, force = false) {
  const resource = await loadWithCache(
    `summary:${eventId}`,
    TTL.SUMMARY,
    () => fetchJson(`${API.site}/summary?event=${eventId}`),
    { force },
  );

  return resource.data;
}

export async function getTeamStatistics(teamId, force = false) {
  const resource = await loadWithCache(
    `team-stats:${teamId}`,
    TTL.TEAMS,
    () => fetchJson(`${API.site}/teams/${teamId}/statistics`),
    { force },
  );

  return resource.data;
}

export async function getAllTeamStatistics(teamIds, force = false) {
  const stats = await mapWithConcurrency(
    teamIds,
    async (teamId) => ({
      teamId,
      payload: await getTeamStatistics(teamId, force),
    }),
    6,
  );

  return Object.fromEntries(
    stats
      .filter(Boolean)
      .map((entry) => [String(entry.teamId), entry.payload]),
  );
}

export async function getTeamRoster(teamId, force = false) {
  const resource = await loadWithCache(
    `roster:${teamId}`,
    TTL.ROSTERS,
    () => fetchJson(`${API.site}/teams/${teamId}/roster`),
    { force },
  );

  return resource.data;
}

export async function getAllRosters(teamIds, force = false) {
  const rosters = await mapWithConcurrency(
    teamIds,
    async (teamId) => ({
      teamId,
      payload: await getTeamRoster(teamId, force),
    }),
    6,
  );

  return Object.fromEntries(
    rosters
      .filter(Boolean)
      .map((entry) => [String(entry.teamId), entry.payload]),
  );
}

export async function getPlayerProfile(playerId, force = false) {
  const resource = await loadWithCache(
    `player-profile:${playerId}`,
    TTL.PLAYERS,
    () => fetchJson(`${API.core}/athletes/${playerId}?lang=en&region=us`),
    { force },
  );

  return resource.data;
}

export async function getPlayerCareerStats(playerId, force = false) {
  const resource = await loadWithCache(
    `player-career:${playerId}`,
    TTL.PLAYERS,
    () => fetchJson(`${API.core}/athletes/${playerId}/statistics?lang=en&region=us`),
    { force },
  );

  return resource.data;
}

export async function getPlayerSeasonStats(seasonYear, playerId, force = false) {
  const resource = await loadWithCache(
    `player-season:${seasonYear}:${playerId}`,
    TTL.PLAYERS,
    () =>
      fetchJson(
        `${API.core}/seasons/${seasonYear}/types/2/athletes/${playerId}/statistics/0?lang=en&region=us`,
      ),
    { force },
  );

  return resource.data;
}

export async function getPlayerStatisticsLog(playerId, force = false) {
  const resource = await loadWithCache(
    `player-log:${playerId}`,
    TTL.PLAYERS,
    () => fetchJson(`${API.core}/athletes/${playerId}/statisticslog?lang=en&region=us`),
    { force },
  );

  return resource.data;
}

export async function getPlayerBundle(playerId, seasonYear, force = false) {
  const [profile, seasonStats, careerStats, statisticsLog] = await Promise.all([
    getPlayerProfile(playerId, force),
    getPlayerSeasonStats(seasonYear, playerId, force),
    getPlayerCareerStats(playerId, force),
    getPlayerStatisticsLog(playerId, force),
  ]);

  return { profile, seasonStats, careerStats, statisticsLog };
}

export async function getTeamBundle(teamId, seasonYear, force = false) {
  const coreTeamUrl = `${API.core}/seasons/${seasonYear}/teams/${teamId}?lang=en&region=us`;
  const [team, statistics, roster, leaders, record] = await Promise.all([
    fetchJson(coreTeamUrl),
    getTeamStatistics(teamId, force),
    getTeamRoster(teamId, force),
    fetchJson(
      `${API.core}/seasons/${seasonYear}/types/2/teams/${teamId}/leaders?lang=en&region=us`,
    ),
    fetchJson(
      `${API.core}/seasons/${seasonYear}/types/2/teams/${teamId}/record?lang=en&region=us`,
    ),
  ]);

  return {
    team,
    statistics,
    roster,
    leaders,
    record,
  };
}

export function pickSeasonYear(scoreboard) {
  return inferSeasonYear(scoreboard);
}

export function flattenRosterPayload(rosterPayload = {}) {
  return (rosterPayload.athletes || []).flatMap((bucket) =>
    (bucket.items || []).map((player) => ({
      ...player,
      id: String(player.id),
      teamId: extractIdFromRef(player?.teams?.[0]?.$ref) || null,
    })),
  );
}

export function extractSeasonLeaderPlayers(categories = []) {
  const players = [];

  categories.forEach((category) => {
    (category.leaders || []).forEach((leader, index) => {
      const athlete = leader.leaders?.[0]?.athlete || leader.athlete || {};
      players.push({
        playerId:
          extractIdFromRef(leader.athlete?.$ref) ||
          extractIdFromRef(leader.statistics?.$ref) ||
          null,
        teamId: extractIdFromRef(leader.team?.$ref),
        category: category.name,
        categoryLabel: category.displayName,
        rank: index + 1,
        value: Number(leader.value ?? 0),
        displayValue: leader.displayValue,
        fullName: athlete.displayName || athlete.fullName || null,
        shortName: athlete.shortName || athlete.displayName || null,
        headshot: athlete.headshot?.href || null,
      });
    });
  });

  return players.filter((entry) => entry.playerId);
}
