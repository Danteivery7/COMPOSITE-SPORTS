import { normalizeEspnNewsArticle } from '@/src/lib/espn-news';
import { extractEspnOdds, moneylineToProbability } from '@/src/lib/odds';
import {
  fetchRemoteCBBBootstrap,
  fetchRemoteCBBPlayer,
  fetchRemoteCBBPlayers,
  fetchRemoteCBBPredictor,
  fetchRemoteCBBTeam,
  hasRemoteCBBService,
} from '@/src/lib/cbb-service';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';
const CACHE = new Map();
const MODEL_VERSION = 'v1';

function cacheKey(scope, extra = '') {
  return `cbb:${MODEL_VERSION}:${scope}:${extra}`;
}

function readCache(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    CACHE.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value, ttlMs) {
  CACHE.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function uniqBy(items, getKey) {
  const map = new Map();
  items.forEach((item) => {
    map.set(getKey(item), item);
  });
  return Array.from(map.values());
}

function walk(node, visit, seen = new WeakSet()) {
  if (!node || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  visit(node);
  if (Array.isArray(node)) {
    node.forEach((entry) => walk(entry, visit, seen));
    return;
  }
  Object.values(node).forEach((value) => walk(value, visit, seen));
}

async function fetchJson(url, ttlMs = 60_000) {
  const key = cacheKey('json', url);
  const cached = readCache(key);
  if (cached) return cached;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return writeCache(key, await response.json(), ttlMs);
}

function flattenStats(stats = []) {
  const map = {};
  stats.forEach((stat) => {
    const keys = [stat.name, stat.displayName, stat.shortDisplayName, stat.abbreviation].filter(Boolean);
    keys.forEach((key) => {
      map[normalizeKey(key)] = stat.value ?? stat.displayValue ?? 0;
      map[`${normalizeKey(key)}Display`] = stat.displayValue ?? stat.value ?? '0';
    });
  });
  return map;
}

function getStatValue(stats, keys, fallback = 0) {
  for (const key of keys) {
    const value = stats[normalizeKey(key)];
    if (value !== undefined && value !== null && value !== '') {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    }
  }
  return fallback;
}

async function mapLimit(items, mapper, concurrency = 10) {
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
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function scoreScale(values, higherIsBetter = true) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return () => 50;
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  if (min === max) return () => 50;
  return (value) => {
    const normalized = ((value - min) / (max - min)) * 100;
    return round(higherIsBetter ? normalized : 100 - normalized, 1);
  };
}

function parseTeam(rawTeam) {
  return {
    id: String(rawTeam.id),
    espnId: String(rawTeam.id),
    abbreviation: rawTeam.abbreviation || rawTeam.shortDisplayName || rawTeam.displayName,
    displayName: rawTeam.displayName || rawTeam.name,
    shortDisplayName: rawTeam.shortDisplayName || rawTeam.abbreviation || rawTeam.displayName,
    logo: rawTeam.logo || rawTeam.logos?.[0]?.href || '',
    color: rawTeam.color || '#f5a623',
    alternateColor: rawTeam.alternateColor || '#fff6cc',
    location: rawTeam.location || '',
  };
}

function parseTeamsFromPayload(payload) {
  const teams = [];
  walk(payload, (node) => {
    if (node?.team?.id) {
      teams.push(parseTeam(node.team));
    } else if (node?.id && node?.displayName && node?.abbreviation && !node?.position) {
      teams.push(parseTeam(node));
    }
  });
  return uniqBy(teams, (team) => team.id);
}

async function getTeams() {
  const key = cacheKey('teams');
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${SITE}/teams`, 12 * 60 * 60 * 1000);
  return writeCache(key, parseTeamsFromPayload(payload), 12 * 60 * 60 * 1000);
}

async function getStandings() {
  const key = cacheKey('standings');
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${SITE}/standings`, 20 * 60 * 1000);
  const entries = [];
  walk(payload, (node) => {
    if (node?.team?.id && Array.isArray(node?.stats)) {
      entries.push(node);
    }
  });

  const standings = uniqBy(
    entries.map((entry) => {
      const stats = flattenStats(entry.stats);
      const wins = getStatValue(stats, ['wins']);
      const losses = getStatValue(stats, ['losses']);
      const gamesPlayed = getStatValue(stats, ['gamesplayed', 'games'], wins + losses);
      const record = stats.recordDisplay || `${wins}-${losses}`;
      const conference =
        entry.group?.shortName ||
        entry.group?.name ||
        entry.team?.groups?.id ||
        entry.team?.conferenceId ||
        'Division I';
      return {
        teamId: String(entry.team.id),
        team: parseTeam(entry.team),
        wins,
        losses,
        gamesPlayed,
        record,
        winPct:
          gamesPlayed > 0
            ? wins / gamesPlayed
            : 0,
        conference,
      };
    }),
    (entry) => entry.teamId,
  );

  return writeCache(key, standings, 20 * 60 * 1000);
}

function flattenStatisticsPayload(payload) {
  const stats = {};
  walk(payload, (node) => {
    if (Array.isArray(node?.stats)) {
      Object.assign(stats, flattenStats(node.stats));
    }
  });
  return stats;
}

async function getTeamStatistics(teamId) {
  const key = cacheKey('team-stats', teamId);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${SITE}/teams/${teamId}/statistics`, 6 * 60 * 60 * 1000);
  return writeCache(key, flattenStatisticsPayload(payload), 6 * 60 * 60 * 1000);
}

async function getTeamSchedule(teamId) {
  const key = cacheKey('schedule', teamId);
  const cached = readCache(key);
  if (cached) return cached;
  try {
    const payload = await fetchJson(`${SITE}/teams/${teamId}/schedule`, 60 * 60 * 1000);
    return writeCache(key, payload, 60 * 60 * 1000);
  } catch (_error) {
    return writeCache(key, { events: [] }, 10 * 60 * 1000);
  }
}

function summarizeRecentForm(schedulePayload, teamId) {
  const events = schedulePayload?.events || schedulePayload?.games || [];
  const completed = events
    .filter((event) => event?.competitions?.[0]?.status?.type?.state === 'post')
    .slice(-5);

  let wins = 0;
  let losses = 0;
  let points = 0;

  const results = completed
    .map((event) => {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors || [];
      const team = competitors.find((item) => String(item.team?.id) === String(teamId));
      const opponent = competitors.find((item) => String(item.team?.id) !== String(teamId));
      if (!team || !opponent) return null;
      const teamScore = Number(team.score || 0);
      const oppScore = Number(opponent.score || 0);
      if (teamScore > oppScore) {
        wins += 1;
        points += 2;
      } else if (teamScore < oppScore) {
        losses += 1;
      }
      return {
        label: `${team.team?.abbreviation || 'TEAM'} ${teamScore}-${oppScore} ${opponent.team?.abbreviation || 'OPP'}`,
        win: teamScore > oppScore,
        opponentId: String(opponent.team?.id || ''),
        opponentName: opponent.team?.displayName || opponent.team?.shortDisplayName || 'Opponent',
        date: event.date,
        result: teamScore > oppScore ? 'W' : 'L',
        score: `${teamScore}-${oppScore}`,
      };
    })
    .filter(Boolean)
    .reverse();

  const streakWindow = completed
    .slice()
    .reverse()
    .map((event) => {
      const competition = event.competitions?.[0];
      const competitors = competition?.competitors || [];
      const team = competitors.find((item) => String(item.team?.id) === String(teamId));
      const opponent = competitors.find((item) => String(item.team?.id) !== String(teamId));
      if (!team || !opponent) return null;
      const teamScore = Number(team.score || 0);
      const oppScore = Number(opponent.score || 0);
      return teamScore > oppScore ? 'W' : 'L';
    })
    .filter(Boolean);

  let streakLabel = 'Even';
  if (streakWindow.length) {
    const first = streakWindow[0];
    let count = 1;
    while (count < streakWindow.length && streakWindow[count] === first) {
      count += 1;
    }
    streakLabel = `${first}${count}`;
  }

  return {
    recentResults: results,
    recentRecord: `${wins}-${losses}`,
    recentFormPoints: points,
    recentFormLabel: completed.length ? `${wins}-${losses} last ${completed.length}` : 'Form pending',
    streak: streakLabel,
    streakValue: streakLabel.startsWith('W')
      ? Number(streakLabel.slice(1) || 0)
      : streakLabel.startsWith('L')
        ? -Number(streakLabel.slice(1) || 0)
        : 0,
  };
}

async function fetchPolls() {
  const key = cacheKey('polls');
  const cached = readCache(key);
  if (cached) return cached;
  try {
    const payload = await fetchJson(`${SITE}/rankings`, 2 * 60 * 60 * 1000);
    const polls = [];
    walk(payload, (node) => {
      if (node?.id && Array.isArray(node?.ranks) && (node.displayName || node.name)) {
        polls.push(node);
      }
    });
    return writeCache(key, polls, 2 * 60 * 60 * 1000);
  } catch (_error) {
    return writeCache(key, [], 20 * 60 * 1000);
  }
}

function parsePollRankMap(polls) {
  const poll =
    polls.find((entry) => /associated press|ap/i.test(entry.displayName || entry.name || '')) ||
    polls.find((entry) => /coaches/i.test(entry.displayName || entry.name || '')) ||
    polls[0] ||
    null;

  const rankMap = new Map();
  if (!poll) {
    return { label: 'Poll unavailable', rankMap };
  }

  (poll.ranks || []).forEach((entry) => {
    const teamId = String(entry.team?.id || entry.teamId || '');
    if (!teamId) return;
    rankMap.set(teamId, Number(entry.current || entry.rank || entry.points || 0) || rankMap.size + 1);
  });

  return {
    label: poll.displayName || poll.name || 'Poll',
    rankMap,
  };
}

function assignRanks(items, selector, { ascending = false, field } = {}) {
  const sorted = items
    .slice()
    .sort((left, right) => {
      const leftValue = selector(left);
      const rightValue = selector(right);
      return ascending ? leftValue - rightValue : rightValue - leftValue;
    });

  sorted.forEach((item, index) => {
    item[field] = index + 1;
  });

  return sorted;
}

function makeTeamResume(rows) {
  const offenseScale = scoreScale(rows.map((row) => row.offenseBase));
  const defenseScale = scoreScale(rows.map((row) => row.defenseBase), false);
  const paceScale = scoreScale(rows.map((row) => row.tempoProxy));
  const successScale = scoreScale(rows.map((row) => row.resumeBase));

  rows.forEach((row) => {
    row.offenseAdj = round(100 + offenseScale(row.offenseBase) * 0.45 + paceScale(row.tempoProxy) * 0.08, 1);
    row.defenseAdj = round(100 - defenseScale(row.defenseBase) * 0.38 + (100 - successScale(row.resumeBase)) * 0.05, 1);
    row.resumeScore = round(successScale(row.resumeBase), 2);
    row.hotness = round(
      clamp(
        48 +
          row.recentFormPoints * 6 +
          row.streakValue * 4 +
          (row.winPct - 0.5) * 40,
        10,
        99,
      ),
      1,
    );
  });

  rows.forEach((row) => {
    row.torvikValue = round(row.offenseAdj - row.defenseAdj + row.resumeScore * 0.22, 3);
    row.kenpomValue = round(row.offenseAdj * 1.018 - row.defenseAdj * 0.982 + row.resumeScore * 0.19, 3);
    row.haslaValue = round(row.offenseAdj * 0.97 - row.defenseAdj * 1.01 + row.hotness * 0.11, 3);
    row.evanValue = round(row.offenseAdj * 0.94 - row.defenseAdj * 1.04 + row.assistRate * 0.3 + row.hotness * 0.08, 3);

    row.torvikOffValue = round(row.offenseAdj + row.ppg * 0.18 + row.assists * 0.6 - row.turnovers * 0.45, 3);
    row.kenpomOffValue = round(row.offenseAdj * 1.02 + row.fieldGoalPct * 0.12 + row.threePointPct * 0.08, 3);
    row.haslaOffValue = round(row.offenseAdj * 0.98 + row.offRebounds * 0.7 + row.ppg * 0.1, 3);
    row.evanOffValue = round(row.offenseAdj * 0.96 + row.assistRate * 0.4 + row.pointsDiff * 0.16, 3);

    row.torvikDefValue = round(row.defenseAdj - row.steals * 0.26 - row.blocks * 0.21, 3);
    row.kenpomDefValue = round(row.defenseAdj - row.ppgAgainst * 0.08 - row.blocks * 0.18, 3);
    row.haslaDefValue = round(row.defenseAdj - row.steals * 0.24 - row.opponentFieldGoalPct * 0.08, 3);
    row.evanDefValue = round(row.defenseAdj - row.ppgAgainst * 0.1 - row.pointsDiff * 0.09, 3);
  });

  assignRanks(rows, (row) => row.resumeScore, { field: 'netRank' });
  assignRanks(rows, (row) => row.torvikValue, { field: 'torvikRank' });
  assignRanks(rows, (row) => row.kenpomValue, { field: 'kenpomRank' });
  assignRanks(rows, (row) => row.haslaValue, { field: 'haslametricsRank' });
  assignRanks(rows, (row) => row.evanValue, { field: 'evanmiyaRank' });

  assignRanks(rows, (row) => row.torvikOffValue, { field: 'torvikOffRank' });
  assignRanks(rows, (row) => row.kenpomOffValue, { field: 'kenpomOffRank' });
  assignRanks(rows, (row) => row.haslaOffValue, { field: 'haslaOffRank' });
  assignRanks(rows, (row) => row.evanOffValue, { field: 'evanOffRank' });

  assignRanks(rows, (row) => row.torvikDefValue, { ascending: true, field: 'torvikDefRank' });
  assignRanks(rows, (row) => row.kenpomDefValue, { ascending: true, field: 'kenpomDefRank' });
  assignRanks(rows, (row) => row.haslaDefValue, { ascending: true, field: 'haslaDefRank' });
  assignRanks(rows, (row) => row.evanDefValue, { ascending: true, field: 'evanDefRank' });
}

function applyPollRanks(rows, pollRankMap) {
  const unranked = rows
    .slice()
    .sort((left, right) => right.resumeScore - left.resumeScore);
  const unrankedOnly = unranked.filter((row) => !pollRankMap.has(row.id));
  const unrankedCount = Math.max(unrankedOnly.length, 1);

  rows.forEach((row) => {
    if (pollRankMap.has(row.id)) {
      row.apRank = pollRankMap.get(row.id);
      return;
    }
    const unrankedIndex = unrankedOnly.findIndex((entry) => entry.id === row.id);
    const percentile = (unrankedIndex + 1) / (unrankedCount + 1);
    row.apRank = round(25 + percentile * 340, 1);
  });
}

function finalizeRanks(rows) {
  rows.forEach((row) => {
    row.avgRank = round(
      (
        row.apRank +
        row.netRank +
        row.torvikRank +
        row.kenpomRank +
        row.haslametricsRank +
        row.evanmiyaRank
      ) / 6,
      2,
    );
    row.offRank = round(
      (row.torvikOffRank + row.kenpomOffRank + row.haslaOffRank + row.evanOffRank) / 4,
      2,
    );
    row.defRank = round(
      (row.torvikDefRank + row.kenpomDefRank + row.haslaDefRank + row.evanDefRank) / 4,
      2,
    );
  });

  rows
    .slice()
    .sort((left, right) => left.avgRank - right.avgRank || right.resumeScore - left.resumeScore)
    .forEach((row, index) => {
      row.compositeRank = index + 1;
      row.ovrRank = index + 1;
      row.ovrScore = round(clamp(99 - index * 0.19 - row.avgRank * 0.035 + row.hotness * 0.06, 62, 99), 1);
    });
}

function buildRankingRows(teams, standings, teamStats, schedules, polls) {
  const standingsMap = Object.fromEntries(standings.map((entry) => [entry.teamId, entry]));
  const statsMap = Object.fromEntries(teamStats.filter(Boolean).map((entry) => [entry.teamId, entry.stats]));
  const scheduleMap = Object.fromEntries(schedules.filter(Boolean).map((entry) => [entry.teamId, entry.schedule]));
  const { rankMap: pollRankMap, label: pollLabel } = parsePollRankMap(polls);

  const rows = teams.map((team) => {
    const standing = standingsMap[team.id] || {};
    const stats = statsMap[team.id] || {};
    const form = summarizeRecentForm(scheduleMap[team.id] || { events: [] }, team.id);

    const ppg = getStatValue(stats, ['pointspergame', 'pointsscored', 'ppg'], 69);
    const ppgAgainst = getStatValue(stats, ['pointsallowedpergame', 'opppointspergame', 'ppa'], 69);
    const fieldGoalPct = getStatValue(stats, ['fieldgoalpct', 'fieldgoalpercentage'], 44);
    const threePointPct = getStatValue(stats, ['threepointfieldgoalpct', '3pointfieldgoalpct', 'threepointpct'], 34);
    const assists = getStatValue(stats, ['assistspergame', 'assists'], 12);
    const turnovers = getStatValue(stats, ['turnoverspergame', 'turnovers'], 12);
    const steals = getStatValue(stats, ['stealspergame', 'steals'], 6);
    const blocks = getStatValue(stats, ['blockspergame', 'blocks'], 3);
    const offRebounds = getStatValue(stats, ['offensivereboundspergame', 'offensiverebounds'], 9);
    const rebounds = getStatValue(stats, ['reboundspergame', 'rebounds'], 34);
    const opponentFieldGoalPct = getStatValue(stats, ['oppfieldgoalpct', 'opponentfieldgoalpct'], 43);
    const pointsDiff = ppg - ppgAgainst;
    const assistRate = assists / Math.max(1, turnovers);
    const wins = standing.wins || 0;
    const losses = standing.losses || 0;
    const gamesPlayed = standing.gamesPlayed || wins + losses;
    const winPct = standing.winPct || (gamesPlayed ? wins / gamesPlayed : 0);

    return {
      ...team,
      conference: standing.conference || 'Division I',
      groupLabel: standing.conference || 'Division I',
      wins,
      losses,
      gamesPlayed,
      record: standing.record || `${wins}-${losses}`,
      winPct,
      recentResults: form.recentResults,
      recentRecord: form.recentRecord,
      recentFormPoints: form.recentFormPoints,
      recentFormLabel: form.recentFormLabel,
      streak: form.streak,
      streakValue: form.streakValue,
      ppg,
      ppgAgainst,
      fieldGoalPct,
      threePointPct,
      assists,
      turnovers,
      steals,
      blocks,
      rebounds,
      offRebounds,
      opponentFieldGoalPct,
      assistRate,
      pointsDiff,
      tempoProxy: ppg + ppgAgainst,
      resumeBase:
        winPct * 100 +
        pointsDiff * 2.1 +
        form.recentFormPoints * 4.2 +
        fieldGoalPct * 0.45 +
        (rebounds - turnovers) * 0.9,
      offenseBase:
        ppg * 1.65 +
        fieldGoalPct * 0.58 +
        threePointPct * 0.42 +
        assists * 1.8 +
        offRebounds * 1.2 -
        turnovers * 1.05,
      defenseBase:
        ppgAgainst * 1.65 -
        steals * 1.6 -
        blocks * 1.4 -
        pointsDiff * 0.45 +
        opponentFieldGoalPct * 0.32,
      sourceValues: {},
      sourceRanks: {},
      pollLabel,
      lastUpdated: new Date().toISOString(),
    };
  });

  makeTeamResume(rows);
  applyPollRanks(rows, pollRankMap);
  finalizeRanks(rows);

  rows.forEach((row) => {
    row.sourceRanks = {
      ap: row.apRank,
      net: row.netRank,
      torvik: row.torvikRank,
      kenpom: row.kenpomRank,
      haslametrics: row.haslametricsRank,
      evanmiya: row.evanmiyaRank,
    };
    row.sourceValues = {
      torvik: row.torvikValue,
      kenpom: row.kenpomValue,
      haslametrics: row.haslaValue,
      evanmiya: row.evanValue,
      torvikOff: row.torvikOffValue,
      kenpomOff: row.kenpomOffValue,
      haslametricsOff: row.haslaOffValue,
      evanmiyaOff: row.evanOffValue,
      torvikDef: row.torvikDefValue,
      kenpomDef: row.kenpomDefValue,
      haslametricsDef: row.haslaDefValue,
      evanmiyaDef: row.evanDefValue,
    };
    row.trend = row.hotness >= 76 ? 'Hot' : row.hotness >= 62 ? 'Rising' : row.hotness <= 40 ? 'Sliding' : 'Steady';
  });

  return rows
    .slice()
    .sort((left, right) => left.compositeRank - right.compositeRank);
}

async function fetchNews() {
  const key = cacheKey('news');
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${SITE}/news`, 30 * 60 * 1000);
  const articles = (payload.articles || [])
    .slice(0, 10)
    .map((article, index) =>
      normalizeEspnNewsArticle(article, {
        fallbackSource: 'ESPN',
        fallbackId: `cbb-news-${index}`,
      }),
    )
    .filter((story) => story.storyId);
  return writeCache(key, articles, 30 * 60 * 1000);
}

async function fetchScoreboard() {
  const key = cacheKey('scoreboard');
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${SITE}/scoreboard?groups=50`, 45 * 1000);
  const games = (payload.events || []).map((event) => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];
    const away = competitors.find((item) => item.homeAway === 'away');
    const home = competitors.find((item) => item.homeAway === 'home');
    const status = competition?.status?.type || event.status?.type || {};
    return {
      id: String(event.id),
      shortName: event.shortName || event.name,
      state: status.state || 'pre',
      statusLabel: status.detail || status.shortDetail || status.description || 'Scheduled',
      startTime: event.date,
      startLabel: new Date(event.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      broadcast: competition?.broadcasts?.[0]?.names?.[0] || '',
      odds: extractEspnOdds(competition, competition?.odds?.[0] || event?.pickcenter?.[0] || null),
      venue: competition?.venue?.fullName || '',
      home: {
        teamId: String(home?.team?.id || ''),
        abbreviation: home?.team?.abbreviation || 'HOME',
        displayName: home?.team?.displayName || 'Home',
        logo: home?.team?.logo || home?.team?.logos?.[0]?.href || '',
        score: home?.score || '0',
        record: home?.records?.[0]?.summary || '',
      },
      away: {
        teamId: String(away?.team?.id || ''),
        abbreviation: away?.team?.abbreviation || 'AWAY',
        displayName: away?.team?.displayName || 'Away',
        logo: away?.team?.logo || away?.team?.logos?.[0]?.href || '',
        score: away?.score || '0',
        record: away?.records?.[0]?.summary || '',
      },
    };
  });
  return writeCache(key, games, 45 * 1000);
}

async function fetchLeaders() {
  const key = cacheKey('leaders');
  const cached = readCache(key);
  if (cached) return cached;
  try {
    const payload = await fetchJson(`${SITE}/leaders`, 60 * 60 * 1000);
    const leaders = [];
    walk(payload, (node) => {
      if (node?.athlete?.id && (node.rank || node.displayValue || node.value)) {
        leaders.push({
          athleteId: String(node.athlete.id),
          teamId: String(node.team?.id || ''),
          label: node.name || node.displayName || node.shortDisplayName || 'Leader',
          rank: Number(node.rank || 0) || 0,
          value: node.displayValue || node.value || '',
          athlete: {
            id: String(node.athlete.id),
            displayName: node.athlete.displayName || node.athlete.shortName || 'Player',
            shortName: node.athlete.shortName || node.athlete.displayName || 'Player',
            headshot:
              node.athlete.headshot?.href ||
              `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${node.athlete.id}.png`,
            position:
              node.athlete.position?.abbreviation ||
              node.athlete.position?.displayName ||
              '',
          },
        });
      }
    });
    return writeCache(key, uniqBy(leaders, (leader) => `${leader.athleteId}:${leader.label}`), 60 * 60 * 1000);
  } catch (_error) {
    return writeCache(key, [], 15 * 60 * 1000);
  }
}

function extractPlayerStatsMap(node) {
  const stats = flattenStats(node?.statistics || node?.stats || []);
  return {
    minutes: getStatValue(stats, ['minutes', 'min']),
    points: getStatValue(stats, ['pointspergame', 'points', 'ppg']),
    rebounds: getStatValue(stats, ['reboundspergame', 'rebounds', 'rpg']),
    assists: getStatValue(stats, ['assistspergame', 'assists', 'apg']),
    steals: getStatValue(stats, ['stealspergame', 'steals', 'spg']),
    blocks: getStatValue(stats, ['blockspergame', 'blocks', 'bpg']),
    turnovers: getStatValue(stats, ['turnoverspergame', 'turnovers', 'topg']),
    fgPct: getStatValue(stats, ['fieldgoalpct', 'fieldgoalpercentage']),
    threePct: getStatValue(stats, ['threepointfieldgoalpct', '3pointfieldgoalpct', 'threepointpct']),
  };
}

async function fetchRoster(teamId) {
  const key = cacheKey('roster', teamId);
  const cached = readCache(key);
  if (cached) return cached;
  const payload = await fetchJson(`${SITE}/teams/${teamId}/roster`, 12 * 60 * 60 * 1000);
  return writeCache(key, payload, 12 * 60 * 60 * 1000);
}

function parseRosterPlayers(payload, team) {
  const players = [];
  walk(payload, (node) => {
    if (node?.id && (node.displayName || node.fullName || node.shortName) && node.position) {
      const statLine = extractPlayerStatsMap(node);
      players.push({
        id: String(node.id),
        displayName: node.displayName || node.fullName || node.shortName,
        shortName: node.shortName || node.displayName || node.fullName,
        position:
          node.position?.abbreviation ||
          node.position?.displayName ||
          node.position?.name ||
          '',
        jersey: node.jersey || '',
        headshot:
          node.headshot?.href ||
          node.headshot ||
          `https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/${node.id}.png`,
        team,
        age: node.age || null,
        classYear: node.experience?.displayValue || node.experience?.abbreviation || '',
        stats: statLine,
      });
    }
  });
  return uniqBy(players, (player) => player.id);
}

function bucketTier(rating) {
  if (rating >= 92) return 'All-American';
  if (rating >= 86) return 'All-Conference';
  if (rating >= 79) return 'Starter';
  if (rating >= 71) return 'Rotation';
  return 'Depth';
}

function playerPositionBucket(position) {
  const normalized = String(position || '').toUpperCase();
  if (normalized.includes('C')) return 'big';
  if (normalized.includes('F')) return 'wing';
  return 'guard';
}

function buildPlayerRating(player, team) {
  const stats = player.stats || {};
  const bucket = playerPositionBucket(player.position);
  const teamBoost = clamp(18 - ((team?.compositeRank || 120) / 12), -8, 12);
  const hotnessBoost = (team?.hotness || 50) * 0.08;
  const minutes = Number(stats.minutes || 0);
  const points = Number(stats.points || 0);
  const rebounds = Number(stats.rebounds || 0);
  const assists = Number(stats.assists || 0);
  const steals = Number(stats.steals || 0);
  const blocks = Number(stats.blocks || 0);
  const turnovers = Number(stats.turnovers || 0);
  const fgPct = Number(stats.fgPct || 42);
  const threePct = Number(stats.threePct || 31);

  let production = 0;
  if (bucket === 'guard') {
    production =
      points * 2.1 +
      assists * 3.1 +
      steals * 2.8 +
      minutes * 0.34 +
      threePct * 0.12 +
      fgPct * 0.08 -
      turnovers * 1.6;
  } else if (bucket === 'wing') {
    production =
      points * 2.2 +
      rebounds * 1.5 +
      assists * 1.9 +
      steals * 1.8 +
      blocks * 1.2 +
      minutes * 0.32 +
      fgPct * 0.1 -
      turnovers * 1.2;
  } else {
    production =
      points * 1.8 +
      rebounds * 2.6 +
      blocks * 3.1 +
      assists * 1.1 +
      minutes * 0.34 +
      fgPct * 0.14 -
      turnovers * 1.1;
  }

  const leaderBoost = (player.leaders || [])
    .slice(0, 3)
    .reduce((total, entry) => total + Math.max(0, 16 - Number(entry.rank || 16)), 0);

  const rating = round(clamp(55 + production * 0.36 + leaderBoost * 0.7 + teamBoost + hotnessBoost, 52, 99), 1);
  return rating;
}

async function fetchAthleteStats(athleteId) {
  try {
    const payload = await fetchJson(`${SITE}/athletes/${athleteId}/stats`, 12 * 60 * 60 * 1000);
    const statLines = [];
    walk(payload, (node) => {
      if (Array.isArray(node?.stats) && node.displayName) {
        node.stats.slice(0, 8).forEach((stat) => {
          statLines.push({
            group: node.displayName,
            label: stat.displayName || stat.name || 'Stat',
            value: stat.displayValue || stat.value || '0',
          });
        });
      }
    });
    return statLines.slice(0, 18);
  } catch (_error) {
    return [];
  }
}

async function buildLocalSnapshot() {
  const [teams, standings, polls, scoreboard, news, leaders] = await Promise.all([
    getTeams(),
    getStandings(),
    fetchPolls(),
    fetchScoreboard(),
    fetchNews(),
    fetchLeaders(),
  ]);

  const [teamStats, schedules] = await Promise.all([
    mapLimit(
      teams,
      async (team) => ({
        teamId: team.id,
        stats: await getTeamStatistics(team.espnId),
      }),
      16,
    ),
    mapLimit(
      teams,
      async (team) => ({
        teamId: team.id,
        schedule: await getTeamSchedule(team.espnId),
      }),
      12,
    ),
  ]);

  const rankings = buildRankingRows(teams, standings, teamStats, schedules, polls);
  const rankingMap = Object.fromEntries(rankings.map((team) => [team.id, team]));
  const leaderMap = new Map();
  leaders.forEach((leader) => {
    const existing = leaderMap.get(leader.athleteId) || [];
    existing.push(leader);
    leaderMap.set(leader.athleteId, existing);
  });

  const rosters = await mapLimit(
    rankings,
    async (team) => {
      const payload = await fetchRoster(team.espnId);
      return parseRosterPlayers(payload, team);
    },
    14,
  );

  const players = uniqBy(rosters.flat().filter(Boolean), (player) => player.id)
    .map((player) => {
      const leadersForPlayer = leaderMap.get(player.id) || [];
      const enriched = {
        ...player,
        leaders: leadersForPlayer,
      };
      const rating = buildPlayerRating(enriched, rankingMap[player.team.id] || player.team);
      return {
        ...enriched,
        rating,
        tier: bucketTier(rating),
        usageSummary:
          Number(player.stats?.points || 0) > 0
            ? `${round(Number(player.stats.points), 1)} PPG • ${round(Number(player.stats.assists || 0), 1)} APG • ${round(Number(player.stats.rebounds || 0), 1)} RPG`
            : leadersForPlayer[0]
              ? `${leadersForPlayer[0].label} #${leadersForPlayer[0].rank}`
              : `${player.team.abbreviation} rotation`,
      };
    })
    .sort((left, right) => right.rating - left.rating || left.displayName.localeCompare(right.displayName))
    .map((player, index) => ({
      ...player,
      rank: index + 1,
    }));

  const playersByTeam = new Map();
  players.forEach((player) => {
    const list = playersByTeam.get(player.team.id) || [];
    list.push(player);
    playersByTeam.set(player.team.id, list);
  });

  const featuredPlayers = players.slice(0, 18);
  const teamsWithLeaders = rankings.map((team) => ({
    ...team,
    leaders: (playersByTeam.get(team.id) || []).slice(0, 3),
  }));

  const predictors = buildPredictorSlate(scoreboard, teamsWithLeaders);
  return {
    sport: 'cbb',
    headline: 'Composite CBB blends six ranking inputs into one live resume board with player and predictor layers.',
    scoreboard,
    rankings: teamsWithLeaders,
    teams: teamsWithLeaders,
    news,
    featuredPlayers,
    playersCatalog: {
      players,
      totalPlayers: players.length,
      lastUpdated: new Date().toISOString(),
    },
    predictors,
    sourceState: {
      apPoll: polls.length ? 'live' : 'fallback',
      net: 'derived-fallback',
      torvik: hasRemoteCBBService() ? 'remote-or-fallback' : 'local-derived',
      kenpom: 'scaled-from-torvik',
      haslametrics: hasRemoteCBBService() ? 'remote-or-fallback' : 'local-derived',
      evanmiya: 'scaled-from-torvik',
    },
    meta: {
      liveGames: scoreboard.filter((game) => game.state === 'in').length,
      teamCount: teamsWithLeaders.length,
      playerCountLabel: `${players.length} player board`,
      rankingSources: 6,
    },
    lastUpdated: new Date().toISOString(),
  };
}

async function buildCBBSnapshot(force = false) {
  if (hasRemoteCBBService()) {
    try {
      const remote = await fetchRemoteCBBBootstrap({ force });
      if (remote?.rankings?.length && remote?.playersCatalog?.players?.length) {
        return remote;
      }
    } catch (_error) {
      // fall through to local builder
    }
  }

  return buildLocalSnapshot();
}

async function getModel({ force = false } = {}) {
  const key = cacheKey('model');
  const cached = readCache(key);
  if (!force && cached) return cached;
  const model = await buildCBBSnapshot(force);
  return writeCache(key, model, 30 * 60 * 1000);
}

function buildPredictor(awayTeam, homeTeam, game = null) {
  if (!awayTeam || !homeTeam) return null;
  const averagePace = 71;
  const compositeGap = awayTeam.compositeRank - homeTeam.compositeRank;
  const top50Matchup = awayTeam.compositeRank <= 50 && homeTeam.compositeRank <= 50;
  const defenseSuppressionHome = homeTeam.defRank <= 30 ? (31 - homeTeam.defRank) * 0.22 : 0;
  const defenseSuppressionAway = awayTeam.defRank <= 30 ? (31 - awayTeam.defRank) * 0.22 : 0;
  const homeBase =
    homeTeam.ppg +
    (100 - awayTeam.defRank) * 0.08 +
    (100 - homeTeam.offRank) * 0.06 +
    (100 - homeTeam.netRank) * 0.035 +
    (100 - homeTeam.compositeRank) * 0.05 +
    (homeTeam.apRank <= 25 ? (26 - homeTeam.apRank) * 0.05 : 0);
  const awayBase =
    awayTeam.ppg +
    (100 - homeTeam.defRank) * 0.08 +
    (100 - awayTeam.offRank) * 0.06 +
    (100 - awayTeam.netRank) * 0.035 +
    (100 - awayTeam.compositeRank) * 0.05 +
    (awayTeam.apRank <= 25 ? (26 - awayTeam.apRank) * 0.05 : 0);

  let projectedHomeScore = round(
    averagePace +
      (homeBase - awayTeam.ppgAgainst) * 0.42 +
      (homeTeam.hotness - 50) * 0.08 -
      defenseSuppressionAway,
    0,
  );
  let projectedAwayScore = round(
    averagePace +
      (awayBase - homeTeam.ppgAgainst) * 0.42 +
      (awayTeam.hotness - 50) * 0.08 -
      defenseSuppressionHome,
    0,
  );

  const gapMagnitude = Math.abs(compositeGap);
  const dynamicGapBoost = top50Matchup ? gapMagnitude * 0.03 : gapMagnitude > 100 ? gapMagnitude * 0.09 : gapMagnitude * 0.055;
  if (homeTeam.compositeRank < awayTeam.compositeRank) {
    projectedHomeScore += dynamicGapBoost;
  } else {
    projectedAwayScore += dynamicGapBoost;
  }

  const homeStrength =
    (100 - homeTeam.compositeRank) * 1.15 +
    (100 - homeTeam.offRank) * 0.85 +
    (100 - homeTeam.defRank) * 0.8 +
    (homeTeam.hotness - 50) * 0.7;
  const awayStrength =
    (100 - awayTeam.compositeRank) * 1.15 +
    (100 - awayTeam.offRank) * 0.85 +
    (100 - awayTeam.defRank) * 0.8 +
    (awayTeam.hotness - 50) * 0.7;

  const homeWinProbability = clamp(
    Math.round((1 / (1 + Math.exp(-((homeStrength - awayStrength) / (top50Matchup ? 19 : 14))))) * 100),
    5,
    95,
  );
  const awayWinProbability = 100 - homeWinProbability;

  if (projectedHomeScore === projectedAwayScore) {
    if (homeWinProbability >= 50) {
      projectedHomeScore += 1;
    } else {
      projectedAwayScore += 1;
    }
  }

  if (homeWinProbability > awayWinProbability && projectedHomeScore < projectedAwayScore) {
    projectedHomeScore = projectedAwayScore + Math.max(1, Math.round((homeWinProbability - awayWinProbability) / 12));
  }
  if (awayWinProbability > homeWinProbability && projectedAwayScore < projectedHomeScore) {
    projectedAwayScore = projectedHomeScore + Math.max(1, Math.round((awayWinProbability - homeWinProbability) / 12));
  }

  const projectedMargin = projectedHomeScore - projectedAwayScore;
  const projectedTotal = projectedHomeScore + projectedAwayScore;
  const marketHomeProbability = moneylineToProbability(game?.odds?.homeMoneyline);
  const marketEdge =
    marketHomeProbability !== null ? round(homeWinProbability / 100 - marketHomeProbability, 3) : null;
  const spreadEdge =
    Number.isFinite(Number(game?.odds?.homeSpread))
      ? round(projectedMargin + Number(game.odds.homeSpread), 1)
      : null;
  const totalEdge =
    Number.isFinite(Number(game?.odds?.overUnder))
      ? round(projectedTotal - Number(game.odds.overUnder), 1)
      : null;
  const leaningHome = homeWinProbability >= awayWinProbability;
  const moneylineOdds = leaningHome ? game?.odds?.homeMoneyline : game?.odds?.awayMoneyline;
  let bettingLean = `${leaningHome ? homeTeam.abbreviation : awayTeam.abbreviation} moneyline`;
  if (spreadEdge !== null && Math.abs(spreadEdge) >= 2) {
    bettingLean = `${spreadEdge > 0 ? homeTeam.abbreviation : awayTeam.abbreviation} spread`;
  } else if (totalEdge !== null && Math.abs(totalEdge) >= 4) {
    bettingLean = `${totalEdge > 0 ? 'Over' : 'Under'} ${game?.odds?.overUnder}`;
  }

  return {
    gameId: game?.id || `${awayTeam.id}-${homeTeam.id}`,
    home: {
      teamId: homeTeam.id,
      abbreviation: homeTeam.abbreviation,
      displayName: homeTeam.displayName,
      logo: homeTeam.logo,
    },
    away: {
      teamId: awayTeam.id,
      abbreviation: awayTeam.abbreviation,
      displayName: awayTeam.displayName,
      logo: awayTeam.logo,
    },
    homeWinProbability,
    awayWinProbability,
    projectedHomeScore,
    projectedAwayScore,
    projectedMargin,
    projectedTotal,
    winnerTeamId: homeWinProbability >= awayWinProbability ? homeTeam.id : awayTeam.id,
    odds: game?.odds || null,
    marketEdge,
    spreadEdge,
    totalEdge,
    bettingLean,
    americanOdds: moneylineOdds ?? null,
    confidence:
      gapMagnitude >= 55 || (marketEdge !== null && Math.abs(marketEdge) >= 0.08)
        ? 'High'
        : gapMagnitude >= 24 || (spreadEdge !== null && Math.abs(spreadEdge) >= 1.6)
          ? 'Medium'
          : 'Lean',
    explanation: [
      `${leaningHome ? homeTeam.displayName : awayTeam.displayName} owns the stronger composite resume and efficiency blend.`,
      `${homeTeam.displayName}: OFF ${homeTeam.offRank} • DEF ${homeTeam.defRank} • NET ${homeTeam.netRank}.`,
      `${awayTeam.displayName}: OFF ${awayTeam.offRank} • DEF ${awayTeam.defRank} • NET ${awayTeam.netRank}.`,
      top50Matchup
        ? 'Top-50 matchup logic keeps the game tighter than a raw rank gap would.'
        : 'Large resume gaps create a wider margin once offense-vs-defense suppression is applied.',
    ],
    updatedAt: new Date().toISOString(),
  };
}

function buildPredictorSlate(scoreboard, rankings) {
  const rankingMap = Object.fromEntries(rankings.map((team) => [team.id, team]));
  return scoreboard
    .filter((game) => game.home.teamId && game.away.teamId)
    .slice(0, 16)
    .map((game) => buildPredictor(rankingMap[game.away.teamId], rankingMap[game.home.teamId], game))
    .filter(Boolean)
    .sort((left, right) => {
      const leftEdge = Math.max(Math.abs(left.marketEdge || 0) * 100, Math.abs(left.spreadEdge || 0), Math.abs(left.totalEdge || 0));
      const rightEdge = Math.max(Math.abs(right.marketEdge || 0) * 100, Math.abs(right.spreadEdge || 0), Math.abs(right.totalEdge || 0));
      return rightEdge - leftEdge;
    });
}

export async function getCBBBootstrap({ force = false } = {}) {
  return getModel({ force });
}

export async function getCBBPlayerCatalog({ query = '', force = false } = {}) {
  if (hasRemoteCBBService()) {
    try {
      const remote = await fetchRemoteCBBPlayers({ query });
      if (remote?.players) return remote;
    } catch (_error) {
      // fallback below
    }
  }

  const model = await getModel({ force });
  const search = query.trim().toLowerCase();
  const players = search
    ? model.playersCatalog.players.filter((player) => {
        const haystack = [
          player.displayName,
          player.shortName,
          player.position,
          player.team?.displayName,
          player.team?.abbreviation,
          player.team?.conference,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      })
    : model.playersCatalog.players;

  return {
    ...model.playersCatalog,
    players,
    query: search,
    totalReturned: players.length,
  };
}

export async function getCBBPlayerDetail(playerId) {
  if (hasRemoteCBBService()) {
    try {
      const remote = await fetchRemoteCBBPlayer(playerId);
      if (remote?.player?.id) return remote;
    } catch (_error) {
      // fallback below
    }
  }

  const model = await getModel();
  const player = model.playersCatalog.players.find((entry) => entry.id === String(playerId));
  if (!player) {
    throw new Error('Player not found');
  }
  const stats = await fetchAthleteStats(playerId);
  const bucket = playerPositionBucket(player.position);
  return {
    sport: 'cbb',
    player,
    stats,
    analysis:
      `${player.displayName} projects as a ${bucket} ${player.tier.toLowerCase()} piece for ${player.team.displayName}, ` +
      `with ${player.usageSummary.toLowerCase()} and a ${player.team.conference} team context.`,
    lastUpdated: new Date().toISOString(),
  };
}

export async function getCBBTeamDetail(teamId) {
  if (hasRemoteCBBService()) {
    try {
      const remote = await fetchRemoteCBBTeam(teamId);
      if (remote?.team?.id) return remote;
    } catch (_error) {
      // fallback below
    }
  }

  const model = await getModel();
  const team = model.rankings.find((entry) => entry.id === String(teamId));
  if (!team) {
    throw new Error('Team not found');
  }
  const schedulePayload = await getTeamSchedule(teamId);
  const recent = summarizeRecentForm(schedulePayload, teamId).recentResults;
  const roster = model.playersCatalog.players.filter((player) => player.team.id === String(teamId));

  return {
    sport: 'cbb',
    team,
    recent,
    roster,
    leaders: roster.slice(0, 5),
    compositeProfile: {
      avgRank: team.avgRank,
      offRank: team.offRank,
      defRank: team.defRank,
      sourceRanks: team.sourceRanks,
      hotness: team.hotness,
      trend: team.trend,
    },
    lastUpdated: new Date().toISOString(),
  };
}

export async function getCBBGameDetail(gameId) {
  const model = await getModel();
  const game = model.scoreboard.find((entry) => entry.id === String(gameId));
  if (!game) {
    throw new Error('Game not found');
  }

  try {
    const summary = await fetchJson(`${SITE}/summary?event=${gameId}`, 20 * 1000);
    const competition = summary.header?.competitions?.[0] || null;
    const venue = summary.gameInfo?.venue?.fullName || competition?.venue?.fullName || game.venue || '';
    const venueAddress = summary.gameInfo?.venue?.address || competition?.venue?.address || {};
    const location = [venueAddress.city, venueAddress.state].filter(Boolean).join(', ');
    const broadcast =
      competition?.broadcasts?.[0]?.media?.shortName ||
      competition?.broadcasts?.[0]?.names?.join(', ') ||
      game.broadcast ||
      '';
    const notes = [];
    walk(summary, (node) => {
      if (typeof node === 'string' && node.length > 22 && notes.length < 10) {
        notes.push(node);
      }
    });

    return {
      sport: 'cbb',
      game,
      headline: summary.article?.headline || game.shortName,
      summary:
        summary.header?.competitions?.[0]?.note?.headline ||
        summary.predictor?.header ||
        game.statusLabel,
      venue,
      location,
      broadcast,
      notes: uniqBy(notes, (note) => note).slice(0, 8),
      lastUpdated: new Date().toISOString(),
    };
  } catch (_error) {
    return {
      sport: 'cbb',
      game,
      headline: game.shortName,
      summary: game.statusLabel,
      venue: game.venue || '',
      location: '',
      broadcast: game.broadcast || '',
      notes: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

export async function getCBBPredictor({ homeTeamId = '', awayTeamId = '' } = {}) {
  if (hasRemoteCBBService() && homeTeamId && awayTeamId) {
    try {
      const remote = await fetchRemoteCBBPredictor({ homeTeamId, awayTeamId });
      if (remote?.home && remote?.away) return remote;
    } catch (_error) {
      // fallback below
    }
  }

  const model = await getModel();
  if (!homeTeamId || !awayTeamId) {
    return {
      predictors: model.predictors,
      lastUpdated: model.lastUpdated,
    };
  }

  const rankingMap = Object.fromEntries(model.rankings.map((team) => [team.id, team]));
  const homeTeam = rankingMap[String(homeTeamId)];
  const awayTeam = rankingMap[String(awayTeamId)];
  if (!homeTeam || !awayTeam) {
    throw new Error('One or both teams were not found');
  }

  return {
    ...buildPredictor(awayTeam, homeTeam),
    lastUpdated: new Date().toISOString(),
  };
}
