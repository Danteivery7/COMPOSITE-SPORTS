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
const MODEL_VERSION = 'v5';

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

function weightedAverage(pairs) {
  const usable = pairs.filter((entry) => Number.isFinite(entry?.value) && Number.isFinite(entry?.weight) && entry.weight > 0);
  if (!usable.length) return null;
  const totalWeight = usable.reduce((sum, entry) => sum + entry.weight, 0);
  if (!totalWeight) return null;
  return round(
    usable.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight,
    2,
  );
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value = '') {
  return decodeHtml(String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
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

async function fetchText(url, ttlMs = 60_000) {
  const key = cacheKey('text', url);
  const cached = readCache(key);
  if (cached) return cached;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return writeCache(key, await response.text(), ttlMs);
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

  const payloads = await Promise.allSettled([
    fetchJson(`${SITE}/teams?limit=500`, 12 * 60 * 60 * 1000),
    fetchJson(`${SITE}/teams`, 12 * 60 * 60 * 1000),
    fetchJson(`${SITE}/standings`, 20 * 60 * 1000),
  ]);

  const teams = uniqBy(
    payloads
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => parseTeamsFromPayload(result.value)),
    (team) => team.id,
  );

  if (!teams.length) {
    throw new Error('Unable to load CBB team universe');
  }

  return writeCache(key, teams, 12 * 60 * 60 * 1000);
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

function makeTeamLookup(teams) {
  const lookup = new Map();
  const aliases = {
    stjohns: 'stjohns',
    saintjohns: 'stjohns',
    uconn: 'connecticut',
    olemiss: 'mississippi',
    missst: 'mississippistate',
    unc: 'northcarolina',
    smu: 'southernmethodist',
    byu: 'brighamyoung',
    ucf: 'centralflorida',
    lsu: 'louisianastate',
    cal: 'california',
    usu: 'utahstate',
    ncstate: 'northcarolinastate',
    vcu: 'virginiacommonwealth',
    tcu: 'texaschristian',
    uab: 'alabamabirmingham',
    ucirvine: 'californiairvine',
    ucsandiego: 'californiasandiego',
    ucdavis: 'californiadavis',
    ucsb: 'californiasanta barbara',
  };

  teams.forEach((team) => {
    const keys = new Set([
      normalizeKey(team.displayName),
      normalizeKey(team.shortDisplayName),
      normalizeKey(team.abbreviation),
      normalizeKey(team.location),
    ]);

    keys.forEach((key) => {
      if (key) lookup.set(key, team.id);
      if (aliases[key]) lookup.set(normalizeKey(aliases[key]), team.id);
    });
  });

  return lookup;
}

function resolveTeamId(teamLookup, name = '', abbreviation = '') {
  const candidates = [
    normalizeKey(name),
    normalizeKey(name.replace(/\b(st)\.?$/i, 'state')),
    normalizeKey(name.replace(/\bsaint\b/gi, 'st')),
    normalizeKey(name.replace(/\buniv\b/gi, 'university')),
    normalizeKey(abbreviation),
  ].filter(Boolean);

  for (const key of candidates) {
    if (teamLookup.has(key)) return teamLookup.get(key);
  }
  return null;
}

async function fetchNetRankings(teams) {
  const key = cacheKey('net-rankings');
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const html = await fetchText('https://www.ncaa.com/rankings/basketball-men/d1/ncaa-mens-basketball-net-rankings', 2 * 60 * 60 * 1000);
    const tbodyMatch = html.match(/<table class="sticky"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
    const rows = tbodyMatch?.[1]?.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const lookup = makeTeamLookup(teams);
    const entries = rows
      .map((row) => {
        const cells = Array.from(row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((match) => stripHtml(match[1]));
        const rank = Number(cells[0]);
        const name = cells[1] || '';
        if (!rank || !name) return null;
        const teamId = resolveTeamId(lookup, name);
        if (!teamId) return null;
        return {
          teamId,
          rank,
          teamName: name,
          record: cells[2] || '',
          conference: cells[3] || '',
        };
      })
      .filter(Boolean);

    return writeCache(key, entries, 2 * 60 * 60 * 1000);
  } catch (_error) {
    return writeCache(key, [], 10 * 60 * 1000);
  }
}

async function fetchHaslametrics(teams) {
  const key = cacheKey('haslametrics');
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const xml = await fetchText('https://haslametrics.com/ratings.xml', 2 * 60 * 60 * 1000);
    const rows = xml.match(/<mr\b[^>]*\/>/gi) || [];
    const lookup = makeTeamLookup(teams);
    const entries = rows
      .map((row) => {
        const attrs = Object.fromEntries(
          Array.from(row.matchAll(/([a-zA-Z0-9_]+)="([^"]*)"/g)).map((match) => [match[1], decodeHtml(match[2])]),
        );
        const rank = Number(attrs.rk || 0);
        const teamId = resolveTeamId(lookup, attrs.t, attrs.abbr);
        if (!rank || !teamId) return null;
        return {
          teamId,
          rank,
          teamName: attrs.t || '',
          abbreviation: attrs.abbr || '',
          offenseValue: Number(attrs.oe || 0) || null,
          defenseValue: Number(attrs.de || 0) || null,
          momentum: Number(attrs.mom || 0) || 0,
        };
      })
      .filter(Boolean);

    return writeCache(key, entries, 2 * 60 * 60 * 1000);
  } catch (_error) {
    return writeCache(key, [], 10 * 60 * 1000);
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
    return { label: 'Poll unavailable', rankMap, isFallback: false, pollAvailable: false };
  }

  (poll.ranks || []).forEach((entry) => {
    const teamId = String(entry.team?.id || entry.teamId || '');
    if (!teamId) return;
    rankMap.set(teamId, Number(entry.current || entry.rank || entry.points || 0) || rankMap.size + 1);
  });

  return {
    label: poll.displayName || poll.name || 'Poll',
    rankMap,
    isFallback: /coaches/i.test(poll.displayName || poll.name || ''),
    pollAvailable: true,
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
}

function applyPollRanks(rows, pollRankMap) {
  if (!pollRankMap.size) {
    rows.forEach((row) => {
      row.apRank = null;
    });
    return;
  }

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
    row.avgRank = weightedAverage([
      { value: row.apRank, weight: 1.45 },
      { value: row.netRank, weight: 1.7 },
      { value: row.torvikRank, weight: 1.2 },
      { value: row.kenpomRank, weight: 1.2 },
      { value: row.haslametricsRank, weight: 1.25 },
      { value: row.evanmiyaRank, weight: 1.2 },
    ]);
    row.offRank = weightedAverage([
      { value: row.torvikOffRank, weight: 1.15 },
      { value: row.kenpomOffRank, weight: 1.15 },
      { value: row.haslaOffRank, weight: 1.3 },
      { value: row.evanOffRank, weight: 1.15 },
    ]);
    row.defRank = weightedAverage([
      { value: row.torvikDefRank, weight: 1.15 },
      { value: row.kenpomDefRank, weight: 1.15 },
      { value: row.haslaDefRank, weight: 1.3 },
      { value: row.evanDefRank, weight: 1.15 },
    ]);
  });

  rows
    .slice()
    .sort((left, right) => (left.avgRank ?? 999) - (right.avgRank ?? 999) || right.resumeScore - left.resumeScore)
    .forEach((row, index) => {
      row.compositeRank = index + 1;
      row.ovrRank = index + 1;
      row.ovrScore = round(clamp(96.5 - (row.avgRank ?? 220) * 0.07 + row.hotness * 0.06 - index * 0.035, 56, 97), 1);
    });
}

function buildRankingRows(teams, standings, teamStats, schedules, polls, netRankings = [], haslametrics = []) {
  const standingsMap = Object.fromEntries(standings.map((entry) => [entry.teamId, entry]));
  const statsMap = Object.fromEntries(teamStats.filter(Boolean).map((entry) => [entry.teamId, entry.stats]));
  const scheduleMap = Object.fromEntries(schedules.filter(Boolean).map((entry) => [entry.teamId, entry.schedule]));
  const { rankMap: pollRankMap, label: pollLabel, isFallback: pollFallback, pollAvailable } = parsePollRankMap(polls);
  const netMap = new Map(netRankings.map((entry) => [String(entry.teamId), entry]));
  const haslamMap = new Map(haslametrics.map((entry) => [String(entry.teamId), entry]));

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
    const netEntry = netMap.get(team.id);
    const standingRecord = standing.record || '';
    const record =
      (standingRecord && standingRecord !== '0-0')
        ? standingRecord
        : netEntry?.record || `${wins}-${losses}`;

    return {
      ...team,
      conference: standing.conference || 'Division I',
      groupLabel: standing.conference || 'Division I',
      wins,
      losses,
      gamesPlayed,
      record,
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
      pollFallback,
      pollAvailable,
      lastUpdated: new Date().toISOString(),
    };
  });

  makeTeamResume(rows);
  applyPollRanks(rows, pollRankMap);

  rows.forEach((row) => {
    const netEntry = netMap.get(row.id);
    const haslamEntry = haslamMap.get(row.id);

    row.netRank = Number.isFinite(netEntry?.rank) ? netEntry.rank : null;
    row.torvikRank = null;
    row.kenpomRank = null;
    row.haslametricsRank = Number.isFinite(haslamEntry?.rank) ? haslamEntry.rank : null;
    row.evanmiyaRank = null;

    row.torvikOffRank = null;
    row.kenpomOffRank = null;
    row.evanOffRank = null;
    row.torvikDefRank = null;
    row.kenpomDefRank = null;
    row.evanDefRank = null;

    row.torvikValue = null;
    row.kenpomValue = null;
    row.evanValue = null;
    row.torvikOffValue = null;
    row.kenpomOffValue = null;
    row.evanOffValue = null;
    row.torvikDefValue = null;
    row.kenpomDefValue = null;
    row.evanDefValue = null;

    row.haslaValue = Number.isFinite(haslamEntry?.rank) ? haslamEntry.rank : null;
    row.haslaOffValue = Number.isFinite(haslamEntry?.offenseValue) ? round(haslamEntry.offenseValue, 3) : null;
    row.haslaDefValue = Number.isFinite(haslamEntry?.defenseValue) ? round(haslamEntry.defenseValue, 3) : null;
    row.haslaOffRank = null;
    row.haslaDefRank = null;
    row.netRecord = netEntry?.record || '';
  });

  assignRanks(
    rows.filter((row) => Number.isFinite(row.haslaOffValue)),
    (row) => row.haslaOffValue,
    { field: 'haslaOffRank' },
  );
  assignRanks(
    rows.filter((row) => Number.isFinite(row.haslaDefValue)),
    (row) => row.haslaDefValue,
    { ascending: true, field: 'haslaDefRank' },
  );

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
  let rosterOrder = 0;
  walk(payload, (node) => {
    if (node?.id && (node.displayName || node.fullName || node.shortName) && node.position) {
      const statLine = extractPlayerStatsMap(node);
      rosterOrder += 1;
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
        rosterOrder,
      });
    }
  });
  return uniqBy(players, (player) => player.id);
}

function bucketTier(rating) {
  if (rating >= 88) return 'All-American';
  if (rating >= 82) return 'All-Conference';
  if (rating >= 74) return 'Starter';
  if (rating >= 66) return 'Rotation';
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
  const teamBoost = clamp(8 - ((team?.compositeRank || 180) / 34), -3.5, 3);
  const hotnessBoost = clamp(((team?.hotness || 50) - 50) * 0.03, -1.5, 2);
  const minutes = Number(stats.minutes || 0);
  const points = Number(stats.points || 0);
  const rebounds = Number(stats.rebounds || 0);
  const assists = Number(stats.assists || 0);
  const steals = Number(stats.steals || 0);
  const blocks = Number(stats.blocks || 0);
  const turnovers = Number(stats.turnovers || 0);
  const fgPct = Number(stats.fgPct || 42);
  const threePct = Number(stats.threePct || 31);
  const usageRate = minutes > 0 ? (points + assists * 1.35 + rebounds * 0.65) / Math.max(1, minutes) : 0;
  const efficiencyBoost = clamp((fgPct - 43) * 0.18 + (threePct - 32) * 0.12, -3.5, 4);
  const rosterSlotBoost = clamp(7 - Number(player.rosterOrder || 14) * 0.62, -5, 4);
  const statReliability = clamp(
    (minutes / 24) * 0.58 +
      (points / 18) * 0.18 +
      ((rebounds + assists + steals + blocks) / 12) * 0.15 +
      ((player.leaders || []).length ? 0.1 : 0),
    0.08,
    1,
  );
  const classBoost =
    /sr|senior/i.test(String(player.classYear || ''))
      ? 1
      : /jr|junior/i.test(String(player.classYear || ''))
        ? 0.7
        : /so|sophomore/i.test(String(player.classYear || ''))
          ? 0.35
          : 0.1;

  let production = 0;
  if (bucket === 'guard') {
    production =
      points * 1.55 +
      assists * 2.35 +
      steals * 1.95 +
      minutes * 0.2 +
      threePct * 0.08 +
      fgPct * 0.05 -
      turnovers * 1.08 +
      usageRate * 6.8;
  } else if (bucket === 'wing') {
    production =
      points * 1.45 +
      rebounds * 1.45 +
      assists * 1.45 +
      steals * 1.45 +
      blocks * 1.2 +
      minutes * 0.2 +
      fgPct * 0.06 -
      turnovers * 0.95 +
      usageRate * 6.1;
  } else {
    production =
      points * 1.3 +
      rebounds * 2 +
      blocks * 2.35 +
      assists * 0.9 +
      minutes * 0.19 +
      fgPct * 0.07 -
      turnovers * 0.8 +
      usageRate * 5.5;
  }

  const leaderBoost = (player.leaders || [])
    .slice(0, 3)
    .reduce((total, entry) => total + Math.max(0, 16 - Number(entry.rank || 16)) * 0.65, 0);

  const statPresenceBoost =
    (points >= 8 ? 1.8 : points > 0 ? 0.4 : -3.4) +
    (assists > 0 ? 0.8 : 0) +
    (rebounds > 0 ? 0.8 : 0) +
    (minutes >= 18 ? 2.4 : minutes >= 10 ? 0.8 : -4.8) +
    (fgPct > 0 ? 0.5 : 0);

  return round(
    (production * statReliability) +
      leaderBoost +
      teamBoost +
      hotnessBoost +
      efficiencyBoost +
      rosterSlotBoost +
      classBoost +
      statPresenceBoost,
    3,
  );
}

function createScoreScale(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  const min = usable.length ? Math.min(...usable) : 0;
  const max = usable.length ? Math.max(...usable) : 1;
  if (!usable.length || min === max) {
    return () => 0.5;
  }
  return (value) => clamp((value - min) / (max - min), 0, 1);
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

  const [netRankings, haslametrics] = await Promise.all([
    fetchNetRankings(teams),
    fetchHaslametrics(teams),
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

  const rankings = buildRankingRows(teams, standings, teamStats, schedules, polls, netRankings, haslametrics);
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

  const playerBase = uniqBy(rosters.flat().filter(Boolean), (player) => player.id)
    .map((player) => {
      const leadersForPlayer = leaderMap.get(player.id) || [];
      const enriched = {
        ...player,
        leaders: leadersForPlayer,
      };
      return {
        ...enriched,
        rawScore: buildPlayerRating(enriched, rankingMap[player.team.id] || player.team),
        positionBucket: playerPositionBucket(enriched.position),
      };
    });

  const overallScale = createScoreScale(playerBase.map((player) => player.rawScore));
  const bucketScaleMap = Object.fromEntries(
    ['guard', 'wing', 'big'].map((bucket) => [
      bucket,
      createScoreScale(playerBase.filter((player) => player.positionBucket === bucket).map((player) => player.rawScore)),
    ]),
  );

  const players = playerBase
    .map((player) => {
      const overallPct = overallScale(player.rawScore);
      const bucketPct = (bucketScaleMap[player.positionBucket] || (() => 0.5))(player.rawScore);
      const team = rankingMap[player.team.id] || player.team;
      const stats = player.stats || {};
      const statStrength = clamp(
        (Number(stats.minutes || 0) / 24) * 0.4 +
          (Number(stats.points || 0) / 18) * 0.25 +
          ((Number(stats.rebounds || 0) + Number(stats.assists || 0)) / 10) * 0.2 +
          ((player.leaders || []).length ? 0.15 : 0),
        0,
        1,
      );
      const teamRankLift = clamp(18 - ((team?.compositeRank || 180) / 4.5), -10, 16);
      const teamHotLift = clamp(((team?.hotness || 50) - 50) * 0.05, -2.5, 3.5);
      const leaderLift = Math.min(3.2, (player.leaders || []).length * 0.75);
      const rating = round(
        clamp(
          41 +
            overallPct * 15 +
            bucketPct * 7 +
            statStrength * 12 +
            teamRankLift * 0.3 +
            teamHotLift * 0.6 +
            leaderLift,
          38,
          89,
        ),
        1,
      );
      const boardScore = round(
        rating +
          teamRankLift +
          teamHotLift +
          leaderLift +
          clamp((Number(stats.points || 0) - 10) * 0.32 + (Number(stats.minutes || 0) - 20) * 0.16, -6, 8),
        2,
      );

      return {
        ...player,
        boardScore,
        rating,
        tier: bucketTier(rating),
        usageSummary:
          Number(player.stats?.points || 0) > 0
            ? `${round(Number(player.stats.points), 1)} PPG • ${round(Number(player.stats.assists || 0), 1)} APG • ${round(Number(player.stats.rebounds || 0), 1)} RPG`
            : player.leaders?.[0]
              ? `${player.leaders[0].label} #${player.leaders[0].rank}`
              : `${player.team.abbreviation} rotation`,
      };
    })
    .sort((left, right) => right.boardScore - left.boardScore || right.rating - left.rating || right.rawScore - left.rawScore || left.displayName.localeCompare(right.displayName))
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

  const contenderPlayers = players.filter((player) => (rankingMap[player.team.id]?.compositeRank || 999) <= 40);
  const featuredPlayers = (contenderPlayers.length >= 12 ? contenderPlayers : players).slice(0, 12);
  const teamsWithLeaders = rankings.map((team) => ({
    ...team,
    leaders: (playersByTeam.get(team.id) || []).slice(0, 3),
  }));
  const scoreboardWithRecords = scoreboard.map((game) => ({
    ...game,
    away: {
      ...game.away,
      record: game.away.record || rankingMap[game.away.teamId]?.record || '',
    },
    home: {
      ...game.home,
      record: game.home.record || rankingMap[game.home.teamId]?.record || '',
    },
  }));

  const predictors = buildPredictorSlate(scoreboardWithRecords, teamsWithLeaders);
  return {
    sport: 'cbb',
    headline: 'Composite CBB',
    scoreboard: scoreboardWithRecords,
    rankings: teamsWithLeaders,
    teams: teamsWithLeaders,
    news,
    featuredPlayers,
    topPlayers: (contenderPlayers.length >= 3 ? contenderPlayers : players).slice(0, 3),
    playersCatalog: {
      players,
      totalPlayers: players.length,
      lastUpdated: new Date().toISOString(),
    },
    predictors,
    sourceState: {
      apPoll: polls.length ? 'live-or-coaches' : 'missing',
      net: netRankings.length >= 300 ? 'live' : 'missing',
      torvik: hasRemoteCBBService() ? 'remote-or-fallback' : 'service-required',
      kenpom: hasRemoteCBBService() ? 'remote-or-fallback' : 'service-required',
      haslametrics: haslametrics.length >= 300 ? 'live' : 'missing',
      evanmiya: hasRemoteCBBService() ? 'remote-or-fallback' : 'service-required',
    },
    sourceTimestamps: {
      snapshot: new Date().toISOString(),
      apPoll: polls.length ? new Date().toISOString() : null,
      net: netRankings.length ? new Date().toISOString() : null,
      haslametrics: haslametrics.length ? new Date().toISOString() : null,
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
      if ((remote?.rankings?.length || 0) >= 300 && (remote?.playersCatalog?.players?.length || 0) >= 500) {
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
  const awayComposite = awayTeam.compositeRank || awayTeam.avgRank || 180;
  const homeComposite = homeTeam.compositeRank || homeTeam.avgRank || 180;
  const awayOff = awayTeam.offRank || 180;
  const homeOff = homeTeam.offRank || 180;
  const awayDef = awayTeam.defRank || 180;
  const homeDef = homeTeam.defRank || 180;
  const awayNet = awayTeam.netRank || awayComposite;
  const homeNet = homeTeam.netRank || homeComposite;
  const compositeGap = awayComposite - homeComposite;
  const top50Matchup = awayComposite <= 50 && homeComposite <= 50;
  const defenseSuppressionHome = homeDef <= 30 ? (31 - homeDef) * 0.22 : 0;
  const defenseSuppressionAway = awayDef <= 30 ? (31 - awayDef) * 0.22 : 0;
  const homeBase =
    homeTeam.ppg +
    (100 - awayDef) * 0.08 +
    (100 - homeOff) * 0.06 +
    (100 - homeNet) * 0.035 +
    (100 - homeComposite) * 0.05 +
    (homeTeam.apRank <= 25 ? (26 - homeTeam.apRank) * 0.05 : 0);
  const awayBase =
    awayTeam.ppg +
    (100 - homeDef) * 0.08 +
    (100 - awayOff) * 0.06 +
    (100 - awayNet) * 0.035 +
    (100 - awayComposite) * 0.05 +
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
  if (homeComposite < awayComposite) {
    projectedHomeScore += dynamicGapBoost;
  } else {
    projectedAwayScore += dynamicGapBoost;
  }

  const homeStrength =
    (100 - homeComposite) * 1.15 +
    (100 - homeOff) * 0.85 +
    (100 - homeDef) * 0.8 +
    (homeTeam.hotness - 50) * 0.7;
  const awayStrength =
    (100 - awayComposite) * 1.15 +
    (100 - awayOff) * 0.85 +
    (100 - awayDef) * 0.8 +
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

  projectedHomeScore = Math.round(projectedHomeScore);
  projectedAwayScore = Math.round(projectedAwayScore);

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
      `${homeTeam.displayName}: OFF ${homeOff} • DEF ${homeDef} • NET ${homeNet}.`,
      `${awayTeam.displayName}: OFF ${awayOff} • DEF ${awayDef} • NET ${awayNet}.`,
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
