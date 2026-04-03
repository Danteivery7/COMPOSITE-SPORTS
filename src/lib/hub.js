import { fetchEspnStoryDetail, normalizeEspnNewsArticle } from '@/src/lib/espn-news';
import { getWorldTopPlayers } from '@/src/lib/world-rankings';
import { fetchMLBNews } from '@/src/mlb/lib/news';
import { fetchScoreboard as fetchMlbScoreboard } from '@/src/mlb/lib/espn';
import { predict as predictMlbGame } from '@/src/mlb/lib/predictor';
import { computeTopPlayers, getCachedTopPlayers, getStaleTopPlayers } from '@/src/mlb/lib/topPlayers';
import { getNbaNewsFeed, getNbaBootstrapSnapshot } from '@/src/lib/nba-backend';
import {
  getFootballLeagueSnapshot,
  getFootballLandingSnapshot,
  getGenericSportSnapshot,
} from '@/src/lib/live-sports-backend';
import { FOOTBALL_LEAGUES } from '@/src/lib/football';
import { americanToDecimal, buildParlayOdds, calculateReturn, extractEspnOdds, formatAmericanOdds } from '@/src/lib/odds';
import { getHotSnapshot, warmSnapshot } from '@/src/lib/snapshot-store';
import { formatEasternDisplay, getEasternNowLabel, getEasternWeeklyCycleId, isSameEasternDate, isWithinLastHours } from '@/src/lib/time';

const STORY_TTL_MS = 5 * 60 * 1000;
const BETS_TTL_MS = 90 * 1000;
const HERO_TTL_MS = 60 * 1000;
const HUB_CACHE_VERSION = 'v7';

const EXTERNAL_NEWS_SOURCES = [
  {
    id: 'cbs-sports',
    source: 'CBS Sports',
    url: 'https://www.cbssports.com/rss/headlines/',
    sourceWeight: 0.88,
  },
  {
    id: 'yahoo-sports',
    source: 'Yahoo Sports',
    url: 'https://sports.yahoo.com/rss/',
    sourceWeight: 0.84,
  },
];

const SPORT_KEYWORDS = {
  mlb: ['mlb', 'baseball', 'home run', 'pitcher', 'slugger', 'yankees', 'dodgers', 'mets', 'red sox'],
  nba: ['nba', 'basketball', 'playoffs', 'lakers', 'celtics', 'warriors', 'knicks', 'bucks'],
  nhl: ['nhl', 'hockey', 'stanley cup', 'puck', 'goalie', 'ice', 'rangers', 'bruins', 'maple leafs'],
  nfl: ['nfl', 'football', 'quarterback', 'touchdown', 'super bowl', 'chiefs', 'cowboys', 'eagles', 'ravens'],
  cbb: ['college basketball', 'ncaa', 'march madness', 'bracket', 'final four', 'men\'s college basketball'],
  football: ['premier league', 'la liga', 'serie a', 'ligue 1', 'champions league', 'mls', 'football', 'soccer', 'goal', 'striker'],
};

function settledValue(result, fallback) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hashString(value) {
  let hash = 0;
  const input = String(value || '');
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeHeadlineKey(value) {
  return slugify(String(value || '').replace(/\b(the|a|an|vs|at|for|with|and)\b/gi, ' '));
}

function parseRssItems(xml = '', sourceMeta) {
  const items = [];
  const matches = String(xml).match(/<item\b[\s\S]*?<\/item>/gi) || [];

  matches.forEach((item) => {
    const getTag = (tag) => {
      const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    };
    const imageMatch =
      item.match(/<media:content[^>]*url="([^"]+)"/i) ||
      item.match(/<enclosure[^>]*url="([^"]+)"/i);

    const headline = getTag('title');
    const description = getTag('description');
    const published = getTag('pubDate');
    const sport = classifySport(`${headline} ${description}`);
    if (!headline || !sport || !isWithinLastHours(published, 24)) return;

    const storyId = `ext-${sourceMeta.id}-${hashString(`${headline}-${published}`)}`;
    items.push({
      id: storyId,
      storyId,
      clusterId: `${sport}-${normalizeHeadlineKey(headline)}`,
      sport,
      league: sport === 'football' ? 'Football' : sport.toUpperCase(),
      headline,
      summary: description.replace(/<[^>]+>/g, '').trim(),
      description: description.replace(/<[^>]+>/g, '').trim(),
      image: imageMatch?.[1] || '',
      published,
      source: sourceMeta.source,
      sourceId: sourceMeta.id,
      apiHref: '',
      contentType: 'Story',
      isEspnStory: false,
      sourceWeight: sourceMeta.sourceWeight,
      body: `<p>${escapeHtml(description.replace(/<[^>]+>/g, '').trim() || headline)}</p>`,
    });
  });

  return items;
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

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function classifySport(text) {
  const haystack = String(text || '').toLowerCase();
  const best = Object.entries(SPORT_KEYWORDS)
    .map(([sport, keywords]) => ({
      sport,
      score: keywords.reduce((count, keyword) => count + (haystack.includes(keyword) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score)[0];

  return best?.score ? best.sport : null;
}

function scoreStory(story) {
  const ageHours = story?.published ? (Date.now() - new Date(story.published).getTime()) / (1000 * 60 * 60) : 999;
  const recencyScore = Math.max(0, 30 - ageHours * 1.1);
  const imageScore = story?.image ? 5 : 0;
  const sportBoost = story?.sport === 'football' ? 2 : 0;
  return (story?.sourceWeight || 0.72) * 30 + recencyScore + imageScore + sportBoost;
}

function diversifyStories(stories, limit = 4) {
  const bySport = new Set();
  const primary = [];
  const overflow = [];

  stories.forEach((story) => {
    if (!bySport.has(story.sport) && primary.length < limit) {
      bySport.add(story.sport);
      primary.push(story);
    } else {
      overflow.push(story);
    }
  });

  return [...primary, ...overflow].slice(0, limit);
}

function normalizeHubStory(story, { sport, league, sourceWeight = 0.8 }) {
  const headline = story?.headline || story?.title || 'Sports Story';
  const published = story?.published || story?.originallyPosted || story?.lastModified || null;
  return {
    id: story?.storyId || story?.id || `${sport}-${hashString(headline)}`,
    storyId: story?.storyId || story?.id || `${sport}-${hashString(headline)}`,
    clusterId: `${sport}-${normalizeHeadlineKey(headline)}`,
    sport,
    league,
    headline,
    summary: story?.description || story?.summary || '',
    description: story?.description || story?.summary || '',
    image: story?.image || '',
    published,
    source: story?.source || 'ESPN',
    sourceId: slugify(story?.source || 'espn'),
    apiHref: story?.apiHref || '',
    contentType: story?.contentType || 'Story',
    isEspnStory: Boolean(story?.apiHref),
    sourceWeight,
    body: story?.body || '',
  };
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function flattenStats(stats = []) {
  const map = {};
  stats.forEach((stat) => {
    const keys = [stat.name, stat.displayName, stat.shortDisplayName, stat.abbreviation].filter(Boolean);
    keys.forEach((key) => {
      map[normalizeKey(key)] = stat.value ?? stat.displayValue ?? 0;
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

function pickRotatingEntry(items = [], seed = '') {
  if (!items.length) return null;
  const cycle = getEasternWeeklyCycleId();
  const index = Math.abs(cycle + Number.parseInt(hashString(seed), 36)) % items.length;
  return items[index];
}

function buildSpotlightCard(player, fallback = {}) {
  if (!player) return null;
  const headline = player.displayName || player.name || player.headline || fallback.headline || 'Featured Athlete';
  const detailBits = [
    player.position || fallback.position || '',
    player.teamAbbr || player.team?.abbreviation || fallback.teamAbbr || '',
  ].filter(Boolean);
  const image =
    player.headshot ||
    player.image ||
    player.teamLogo ||
    player.team?.logo ||
    player.team?.logos?.[0]?.href ||
    player.logo ||
    fallback.image ||
    '';
  return {
    image,
    league: player.leagueLabel || player.competition || fallback.league || '',
    headline,
    subhead: detailBits.join(' • ') || fallback.subhead || '',
  };
}

function parseSiteLeaders(payload, { leagueLabel, sportKey }) {
  const leaders = [];
  walk(payload, (node) => {
    if (node?.athlete?.id && (node.rank || node.displayValue || node.value)) {
      leaders.push({
        id: `${sportKey}-${node.athlete.id}`,
        displayName: node.athlete.displayName || node.athlete.shortName || 'Player',
        headshot: node.athlete.headshot?.href || node.athlete.headshot || '',
        teamLogo: node.team?.logo || node.team?.logos?.[0]?.href || '',
        position:
          node.athlete.position?.abbreviation ||
          node.athlete.position?.displayName ||
          node.athlete.position?.name ||
          '',
        teamAbbr: node.team?.abbreviation || node.team?.shortDisplayName || '',
        leagueLabel,
        rank: Number(node.rank || 1),
        leaderLabel: node.name || node.displayName || 'Leader',
      });
    }
  });

  return uniqBy(leaders, (entry) => entry.id)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 16);
}

async function getNhlSpotlightPool() {
  const payload = await fetchJson('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/leaders');
  return parseSiteLeaders(payload, { leagueLabel: 'NHL', sportKey: 'nhl' });
}

function scoreNbaPlayer(player) {
  const stats = player?.realStats;
  if (!stats) return -1;
  return (
    (Number(stats.ppg || 0) * 4.2) +
    (Number(stats.apg || 0) * 3.1) +
    (Number(stats.rpg || 0) * 2.1) +
    (Number(stats.spg || 0) * 6.4) +
    (Number(stats.bpg || 0) * 5.6) +
    (Number(stats.tsPct || 0) * 0.14)
  );
}

function buildNbaSpotlightPool(snapshot) {
  return (snapshot?.playerCatalog || [])
    .filter((player) => player?.hasOfficialStats && player?.headshot)
    .sort((left, right) => scoreNbaPlayer(right) - scoreNbaPlayer(left))
    .slice(0, 24)
    .map((player) => ({
      ...player,
      leagueLabel: 'NBA',
    }));
}

function parseStrengthStandings(payload) {
  const entries = [];
  walk(payload, (node) => {
    if (node?.team?.id && Array.isArray(node?.stats)) {
      const stats = flattenStats(node.stats);
      entries.push({
        teamId: String(node.team.id),
        winPct: getStatValue(stats, ['winpercent', 'winningpercentage'], 0.5),
        differential: getStatValue(stats, ['goaldifferential', 'pointdifferential', 'differential'], 0),
        pointsFor: getStatValue(stats, ['goalsfor', 'pointsfor', 'goalsscored'], 0),
        pointsAgainst: getStatValue(stats, ['goalsagainst', 'pointsagainst'], 0),
      });
    }
  });
  return Object.fromEntries(entries.map((entry) => [entry.teamId, entry]));
}

async function fetchNhlScoreboard() {
  const payload = await fetchJson('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard');
  return (payload.events || []).map((event) => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];
    const away = competitors.find((item) => item.homeAway === 'away');
    const home = competitors.find((item) => item.homeAway === 'home');
    const status = competition?.status?.type || event.status?.type || {};
    const odds = extractEspnOdds(competition, event?.pickcenter?.[0] || null);
    return {
      id: event.id,
      state: status.state || 'pre',
      statusLabel: status.detail || status.shortDetail || status.description || 'Scheduled',
      startTime: event.date,
      odds,
      away: {
        teamId: away?.team?.id ? String(away.team.id) : '',
        abbreviation: away?.team?.abbreviation || 'AWY',
        displayName: away?.team?.displayName || 'Away',
        logo: away?.team?.logo || away?.team?.logos?.[0]?.href || '',
        score: away?.score || '0',
      },
      home: {
        teamId: home?.team?.id ? String(home.team.id) : '',
        abbreviation: home?.team?.abbreviation || 'HME',
        displayName: home?.team?.displayName || 'Home',
        logo: home?.team?.logo || home?.team?.logos?.[0]?.href || '',
        score: home?.score || '0',
      },
    };
  });
}

async function fetchNhlNewsStories() {
  const payload = await fetch('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  }).then((response) => {
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  });

  return (payload.articles || [])
    .map((article, index) =>
      normalizeHubStory(
        normalizeEspnNewsArticle(article, {
          fallbackSource: 'ESPN',
          fallbackId: `nhl-hub-news-${index}`,
        }),
        { sport: 'nhl', league: 'NHL', sourceWeight: 1 },
      ),
    )
    .filter((story) => isWithinLastHours(story.published, 24));
}

async function fetchExternalStories() {
  const batches = await Promise.allSettled(
    EXTERNAL_NEWS_SOURCES.map(async (sourceMeta) => parseRssItems(await fetchText(sourceMeta.url), sourceMeta)),
  );

  return batches.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

async function buildTrendingStoriesSnapshot() {
  const [worldBoardResult, mlbNewsResult, nbaNewsResult, nhlNewsResult, nflBoardResult, cbbBoardResult, footballBoardsResult, externalStoriesResult] =
    await Promise.allSettled([
      getWorldTopPlayers(),
      fetchMLBNews(),
      getNbaNewsFeed(),
      fetchNhlNewsStories(),
      getGenericSportSnapshot('nfl'),
      getGenericSportSnapshot('cbb'),
      Promise.allSettled(Object.keys(FOOTBALL_LEAGUES).map((leagueKey) => getFootballLeagueSnapshot(leagueKey))),
      fetchExternalStories(),
    ]);

  const worldBoard = settledValue(worldBoardResult, { players: [], lastUpdated: null });
  const mlbNews = settledValue(mlbNewsResult, { articles: [] });
  const nbaNews = settledValue(nbaNewsResult, { articles: [] });
  const nhlNews = settledValue(nhlNewsResult, []);
  const nflBoard = settledValue(nflBoardResult, { news: [] });
  const cbbBoard = settledValue(cbbBoardResult, { news: [] });
  const footballBoards = settledValue(footballBoardsResult, [])
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  const externalStories = settledValue(externalStoriesResult, []);

  const internalStories = [
    ...(mlbNews?.articles || []).map((story) => normalizeHubStory(story, { sport: 'mlb', league: 'MLB', sourceWeight: 1 })),
    ...(nbaNews?.articles || []).map((story) => normalizeHubStory(story, { sport: 'nba', league: 'NBA', sourceWeight: 1 })),
    ...nhlNews,
    ...(nflBoard?.news || []).map((story) => normalizeHubStory(story, { sport: 'nfl', league: 'NFL', sourceWeight: 1 })),
    ...(cbbBoard?.news || []).map((story) => normalizeHubStory(story, { sport: 'cbb', league: 'CBB', sourceWeight: 0.94 })),
    ...footballBoards.flatMap((board) =>
      (board?.news || []).map((story) =>
        normalizeHubStory(story, {
          sport: 'football',
          league: board?.league?.label || 'Football',
          sourceWeight: 0.96,
        }),
      ),
    ),
  ];

  const recentStories = [...internalStories, ...externalStories]
    .filter((story) => story?.sport && isWithinLastHours(story.published, 24))
    .sort((left, right) => scoreStory(right) - scoreStory(left));

  const bestByCluster = new Map();
  recentStories.forEach((story) => {
    const existing = bestByCluster.get(story.clusterId);
    if (!existing || scoreStory(story) > scoreStory(existing)) {
      bestByCluster.set(story.clusterId, story);
    }
  });

  const sortedStories = Array.from(bestByCluster.values()).sort((left, right) => scoreStory(right) - scoreStory(left));
  const heroStories = diversifyStories(sortedStories, 3).map((story, index) => ({
    ...story,
    heroRank: index + 1,
  }));
  const heroIds = new Set(heroStories.map((story) => story.storyId));
  const secondaryStories = diversifyStories(
    sortedStories.filter((story) => !heroIds.has(story.storyId)),
    4,
  ).map((story, index) => ({
    ...story,
    secondaryRank: index + 1,
  }));

  return {
    stories: sortedStories,
    heroStories,
    secondaryStories,
    worldBoard,
    lastUpdated: new Date().toISOString(),
  };
}

async function getMlbSpotlightPlayers() {
  const snapshot = await getHotSnapshot(
    'hub-mlb-top-players',
    async () => {
      const cached = getCachedTopPlayers(50);
      if (cached) return cached;

      const stale = getStaleTopPlayers();
      if (stale) return stale;

      return computeTopPlayers(50);
    },
    { ttlMs: 15 * 60 * 1000 },
  );

  return snapshot?.players ? snapshot : { players: [], totalPlayers: 0, lastUpdated: null };
}

function buildFootballBetCandidates(board) {
  return (board?.predictors || [])
    .filter((prediction) => prediction?.americanOdds !== null && prediction?.americanOdds !== undefined)
    .map((prediction) => {
      const leaningHome = (prediction.homeWinProbability || 0) >= 50;
      const team = leaningHome ? prediction.home : prediction.away;
      return {
        sport: 'football',
        league: board?.league?.label || 'Football',
        gameId: prediction.gameId,
        selection: team.displayName || team.abbreviation,
        teamAbbr: team.abbreviation,
        predictedWinner: team.displayName || team.abbreviation,
        lineType: prediction.bettingLean,
        americanOdds: prediction.americanOdds,
        projectedScore: `${prediction.away.abbreviation} ${prediction.projectedAwayScore} - ${prediction.home.abbreviation} ${prediction.projectedHomeScore}`,
        winProbability: leaningHome ? prediction.homeWinProbability : prediction.awayWinProbability,
        teamLogo: leaningHome ? board?.scoreboard?.find((game) => game.id === prediction.gameId)?.home?.logo : board?.scoreboard?.find((game) => game.id === prediction.gameId)?.away?.logo,
        opponentLogo: leaningHome ? board?.scoreboard?.find((game) => game.id === prediction.gameId)?.away?.logo : board?.scoreboard?.find((game) => game.id === prediction.gameId)?.home?.logo,
        startTime: board?.scoreboard?.find((game) => game.id === prediction.gameId)?.startTime || null,
        edgeMagnitude: Math.max(Math.abs((prediction.marketEdge || 0) * 100), Math.abs(prediction.spreadEdge || 0), Math.abs(prediction.totalEdge || 0)),
      };
    });
}

function buildGenericBetCandidates(board, sportLabel) {
  return (board?.predictors || [])
    .filter((prediction) => prediction?.americanOdds !== null && prediction?.americanOdds !== undefined)
    .map((prediction) => {
      const leaningHome = (prediction.homeWinProbability || 0) >= 50;
      const team = leaningHome ? prediction.home : prediction.away;
      return {
        sport: sportLabel.toLowerCase(),
        league: sportLabel,
        gameId: prediction.gameId,
        selection: team.displayName || team.abbreviation,
        teamAbbr: team.abbreviation,
        predictedWinner: team.displayName || team.abbreviation,
        lineType: prediction.bettingLean,
        americanOdds: prediction.americanOdds,
        projectedScore: `${prediction.away.abbreviation} ${prediction.projectedAwayScore} - ${prediction.home.abbreviation} ${prediction.projectedHomeScore}`,
        winProbability: leaningHome ? prediction.homeWinProbability : prediction.awayWinProbability,
        teamLogo: leaningHome ? board?.scoreboard?.find((game) => game.id === prediction.gameId)?.home?.logo : board?.scoreboard?.find((game) => game.id === prediction.gameId)?.away?.logo,
        opponentLogo: leaningHome ? board?.scoreboard?.find((game) => game.id === prediction.gameId)?.away?.logo : board?.scoreboard?.find((game) => game.id === prediction.gameId)?.home?.logo,
        startTime: board?.scoreboard?.find((game) => game.id === prediction.gameId)?.startTime || null,
        edgeMagnitude: Math.max(Math.abs((prediction.marketEdge || 0) * 100), Math.abs(prediction.spreadEdge || 0), Math.abs(prediction.totalEdge || 0)),
      };
    });
}

async function buildMlbBetCandidates() {
  const scoreboard = await fetchMlbScoreboard();
  const sameDayGames = (scoreboard?.games || []).filter((game) => game.state === 'pre');
  const predictions = await Promise.allSettled(
    sameDayGames.slice(0, 10).map(async (game) => ({
      game,
      prediction: await predictMlbGame(game.away.teamId, game.home.teamId, { neutralSite: false }),
    })),
  );

  return predictions
    .filter((result) => result.status === 'fulfilled' && result.value?.prediction)
    .map((result) => {
      const { game, prediction } = result.value;
      const awayWinPct = Number(prediction?.teamA?.winPct || 0);
      const homeWinPct = Number(prediction?.teamB?.winPct || 0);
      const leaningAway = awayWinPct >= homeWinPct;
      const team = leaningAway ? prediction.teamA : prediction.teamB;
      const americanOdds = leaningAway ? game.odds?.awayMoneyLine : game.odds?.homeMoneyLine;
      return {
        sport: 'mlb',
        league: 'MLB',
        gameId: game.id,
        selection: team?.name || team?.abbr || 'Model Lean',
        teamAbbr: team?.abbr || '',
        predictedWinner: team?.name || team?.abbr || 'Model Lean',
        lineType: `${team?.abbr || ''} moneyline`,
        americanOdds,
        projectedScore: `${prediction.teamA?.abbr} ${prediction.teamA?.projectedScore} - ${prediction.teamB?.abbr} ${prediction.teamB?.projectedScore}`,
        winProbability: team?.winPct || 0,
        teamLogo: leaningAway ? game.away?.logo : game.home?.logo,
        opponentLogo: leaningAway ? game.home?.logo : game.away?.logo,
        startTime: game.startTime || null,
        edgeMagnitude: Math.abs(awayWinPct - homeWinPct),
      };
    })
    .filter((candidate) => candidate.americanOdds !== null && candidate.americanOdds !== undefined);
}

async function buildNhlBetCandidates() {
  const [games, standingsPayload] = await Promise.all([
    fetchNhlScoreboard(),
    fetchJson('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/standings'),
  ]);

  const strengthMap = parseStrengthStandings(standingsPayload);

  return games
    .filter((game) => game.state === 'pre')
    .map((game) => {
      const homeStrength = strengthMap[game.home.teamId] || {};
      const awayStrength = strengthMap[game.away.teamId] || {};
      const homePower =
        (Number(homeStrength.winPct || 0.5) * 100) +
        (Number(homeStrength.differential || 0) * 1.7) +
        ((Number(homeStrength.pointsFor || 0) - Number(homeStrength.pointsAgainst || 0)) * 0.1) +
        2.3;
      const awayPower =
        (Number(awayStrength.winPct || 0.5) * 100) +
        (Number(awayStrength.differential || 0) * 1.7) +
        ((Number(awayStrength.pointsFor || 0) - Number(awayStrength.pointsAgainst || 0)) * 0.1);
      const leaningHome = homePower >= awayPower;
      return {
        sport: 'nhl',
        league: 'NHL',
        gameId: game.id,
        selection: leaningHome ? game.home.displayName : game.away.displayName,
        teamAbbr: leaningHome ? game.home.abbreviation : game.away.abbreviation,
        predictedWinner: leaningHome ? game.home.displayName : game.away.displayName,
        lineType: `${leaningHome ? game.home.abbreviation : game.away.abbreviation} moneyline`,
        americanOdds: leaningHome ? game.odds?.homeMoneyline : game.odds?.awayMoneyline,
        projectedScore: `${game.away.abbreviation} ${Math.max(1, Math.round(2.2 + awayPower / 28))} - ${game.home.abbreviation} ${Math.max(1, Math.round(2.3 + homePower / 28))}`,
        winProbability: Math.max(50, Math.min(68, Math.round(50 + Math.abs(homePower - awayPower) * 0.65))),
        teamLogo: leaningHome ? game.home.logo : game.away.logo,
        opponentLogo: leaningHome ? game.away.logo : game.home.logo,
        startTime: game.startTime || null,
        edgeMagnitude: Math.abs(homePower - awayPower),
      };
    })
    .filter((candidate) => candidate.americanOdds !== null && candidate.americanOdds !== undefined);
}

function normalizeTickerGame({ league, sport, gameId, state, statusLabel, startTime, away, home }) {
  const isLive = ['in', 'live'].includes(String(state || '').toLowerCase());
  const isToday = startTime ? isSameEasternDate(startTime, new Date()) : false;
  if (!isLive && !isToday) return null;

  return {
    id: `${league}-${gameId}`,
    league,
    sport,
    state,
    statusLabel,
    startTime,
    sortBucket: isLive ? 0 : 1,
    matchup: `${away.abbreviation} @ ${home.abbreviation}`,
    scoreLabel: isLive || String(state) === 'post'
      ? `${away.score}-${home.score}`
      : formatEasternDisplay(startTime, { hour: 'numeric', minute: '2-digit' }),
    awayLogo: away.logo || '',
    homeLogo: home.logo || '',
  };
}

function buildGenericTicker(board, leagueLabel, sportKey = leagueLabel.toLowerCase()) {
  return (board?.scoreboard || [])
    .map((game) =>
      normalizeTickerGame({
        league: leagueLabel,
        sport: sportKey,
        gameId: game.id,
        state: game.state,
        statusLabel: game.statusLabel,
        startTime: game.startTime,
        away: game.away,
        home: game.home,
      }),
    )
    .filter(Boolean);
}

function buildMlbTicker(scoreboard) {
  return (scoreboard?.games || [])
    .map((game) =>
      normalizeTickerGame({
        league: 'MLB',
        sport: 'mlb',
        gameId: game.id,
        state: game.state,
        statusLabel: game.statusDetail || game.shortDetail || '',
        startTime: game.startTime,
        away: {
          abbreviation: game.away?.abbr || 'AWY',
          score: game.away?.score || 0,
          logo: game.away?.logo || '',
        },
        home: {
          abbreviation: game.home?.abbr || 'HME',
          score: game.home?.score || 0,
          logo: game.home?.logo || '',
        },
      }),
    )
    .filter(Boolean);
}

function buildNbaTicker(snapshot) {
  return (snapshot?.games || [])
    .map((event) => {
      const competition = event.competitions?.[0];
      const away = competition?.competitors?.find((team) => team.homeAway === 'away');
      const home = competition?.competitors?.find((team) => team.homeAway === 'home');
      const status = competition?.status?.type || event.status?.type || {};
      if (!away || !home) return null;
      return normalizeTickerGame({
        league: 'NBA',
        sport: 'nba',
        gameId: event.id,
        state: status.state,
        statusLabel: status.detail || status.shortDetail || status.description || '',
        startTime: event.date,
        away: {
          abbreviation: away.team?.abbreviation || 'AWY',
          score: away.score || 0,
          logo: away.team?.logo || away.team?.logos?.[0]?.href || '',
        },
        home: {
          abbreviation: home.team?.abbreviation || 'HME',
          score: home.score || 0,
          logo: home.team?.logo || home.team?.logos?.[0]?.href || '',
        },
      });
    })
    .filter(Boolean);
}

function buildLiveTickerBundle({ mlbScoreboard, nbaSnapshot, nhlGames, nflBoard, cbbBoard, footballBoards }) {
  return [
    ...buildMlbTicker(mlbScoreboard),
    ...buildNbaTicker(nbaSnapshot),
    ...nhlGames
      .map((game) =>
        normalizeTickerGame({
          league: 'NHL',
          sport: 'nhl',
          gameId: game.id,
          state: game.state,
          statusLabel: game.statusLabel,
          startTime: game.startTime,
          away: game.away,
          home: game.home,
        }),
      )
      .filter(Boolean),
    ...buildGenericTicker(nflBoard, 'NFL', 'nfl'),
    ...buildGenericTicker(cbbBoard, 'CBB', 'cbb'),
    ...footballBoards.flatMap((board) => buildGenericTicker(board, board?.league?.label || 'Football', 'football')),
  ]
    .sort((left, right) => (left.sortBucket - right.sortBucket) || new Date(left.startTime || 0).getTime() - new Date(right.startTime || 0).getTime())
    .slice(0, 16);
}

async function buildCardSpotlights() {
  const footballLeagueKeys = Object.keys(FOOTBALL_LEAGUES);
  const [
    mlbResult,
    nbaResult,
    nhlResult,
    nflResult,
    cbbResult,
    footballResults,
  ] = await Promise.allSettled([
    getMlbSpotlightPlayers(),
    getNbaBootstrapSnapshot(),
    getNhlSpotlightPool(),
    getGenericSportSnapshot('nfl'),
    getGenericSportSnapshot('cbb'),
    Promise.allSettled(footballLeagueKeys.map((leagueKey) => getFootballLeagueSnapshot(leagueKey))),
  ]);

  const mlbPlayers = (settledValue(mlbResult, { players: [] }).players || []).map((player) => ({
    displayName: player.name || player.displayName,
    headshot: player.headshot,
    teamLogo: player.teamLogo,
    position: player.position || 'MLB',
    teamAbbr: player.teamAbbr || '',
    leagueLabel: 'MLB',
  }));
  const nbaPlayers = buildNbaSpotlightPool(settledValue(nbaResult, { playerCatalog: [] }));
  const nhlPlayers = settledValue(nhlResult, []);
  const nflPlayers = settledValue(nflResult, { featuredPlayers: [] }).featuredPlayers || [];
  const cbbPlayers = settledValue(cbbResult, { featuredPlayers: [] }).featuredPlayers || [];
  const footballPlayers = settledValue(footballResults, [])
    .map((result, index) => ({
      result,
      leagueKey: footballLeagueKeys[index],
    }))
    .filter(({ result }) => result.status === 'fulfilled')
    .flatMap(({ result, leagueKey }) =>
      (result.value?.featuredPlayers || []).map((player) => ({
        ...player,
        leagueLabel: FOOTBALL_LEAGUES[leagueKey].label,
      })),
    );

  const pools = {
    nhl: nhlPlayers,
    mlb: mlbPlayers,
    nba: nbaPlayers,
    cbb: cbbPlayers,
    nfl: nflPlayers,
    football: footballPlayers,
  };

  return Object.fromEntries(
    Object.entries(pools).map(([sportKey, players]) => {
      const selected = pickRotatingEntry(players.filter((player) => player?.headshot), sportKey) || pickRotatingEntry(players, sportKey);
      return [sportKey, buildSpotlightCard(selected) || null];
    }),
  );
}

async function buildTopBetsSnapshot() {
  const [nflBoardResult, footballBoardsResult, mlbCandidatesResult, nbaSnapshotResult, footballLandingResult, nhlCandidatesResult] = await Promise.allSettled([
    getGenericSportSnapshot('nfl'),
    Promise.allSettled(Object.keys(FOOTBALL_LEAGUES).map((leagueKey) => getFootballLeagueSnapshot(leagueKey))),
    buildMlbBetCandidates(),
    getNbaBootstrapSnapshot(),
    getFootballLandingSnapshot(),
    buildNhlBetCandidates(),
  ]);

  const nflBoard = settledValue(nflBoardResult, { predictors: [], scoreboard: [] });
  const footballBoards = settledValue(footballBoardsResult, [])
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  const mlbCandidates = settledValue(mlbCandidatesResult, []);
  const nbaSnapshot = settledValue(nbaSnapshotResult, null);
  const footballLanding = settledValue(footballLandingResult, null);
  const nhlCandidates = settledValue(nhlCandidatesResult, []);

  const nflCandidates = buildGenericBetCandidates(nflBoard, 'NFL');
  const footballCandidates = footballBoards.flatMap((board) => buildFootballBetCandidates(board));

  const nbaCandidates = (nbaSnapshot?.games || [])
    .filter((event) => event?.competitions?.[0]?.status?.type?.state === 'pre')
    .slice(0, 6)
    .map((event) => {
      const competition = event.competitions?.[0];
      const away = competition?.competitors?.find((team) => team.homeAway === 'away');
      const home = competition?.competitors?.find((team) => team.homeAway === 'home');
      const odds = extractEspnOdds(competition, event?.pickcenter?.[0] || null);
      if (!home || !away || odds?.homeMoneyline == null || odds?.awayMoneyline == null) return null;
      const homeTeamStats = nbaSnapshot?.teamDetailedStats?.[String(home.team?.id)] || {};
      const awayTeamStats = nbaSnapshot?.teamDetailedStats?.[String(away.team?.id)] || {};
      const homeForm = nbaSnapshot?.teamRecentForm?.[String(home.team?.id)] || [];
      const awayForm = nbaSnapshot?.teamRecentForm?.[String(away.team?.id)] || [];
      const homeScore = (homeTeamStats.offensiveEfficiency || 110) - ((awayTeamStats.pointsAllowedPerGame || awayTeamStats.defensiveEfficiency || 108) * 0.34) + homeForm.length * 0.2 + 2.4;
      const awayScore = (awayTeamStats.offensiveEfficiency || 108) - ((homeTeamStats.pointsAllowedPerGame || homeTeamStats.defensiveEfficiency || 108) * 0.34) + awayForm.length * 0.2;
      const leaningHome = homeScore >= awayScore;
      return {
        sport: 'nba',
        league: 'NBA',
        gameId: event.id,
        selection: leaningHome ? home.team?.displayName : away.team?.displayName,
        teamAbbr: leaningHome ? home.team?.abbreviation : away.team?.abbreviation,
        predictedWinner: leaningHome ? home.team?.displayName : away.team?.displayName,
        lineType: `${leaningHome ? home.team?.abbreviation : away.team?.abbreviation} moneyline`,
        americanOdds: leaningHome ? odds.homeMoneyline : odds.awayMoneyline,
        projectedScore: `${away.team?.abbreviation} ${Math.round(awayScore)} - ${home.team?.abbreviation} ${Math.round(homeScore)}`,
        winProbability: leaningHome ? 54 : 46,
        teamLogo: leaningHome ? home.team?.logo || home.team?.logos?.[0]?.href : away.team?.logo || away.team?.logos?.[0]?.href,
        opponentLogo: leaningHome ? away.team?.logo || away.team?.logos?.[0]?.href : home.team?.logo || home.team?.logos?.[0]?.href,
        startTime: event.date,
        edgeMagnitude: Math.abs(homeScore - awayScore),
      };
    })
    .filter(Boolean);

  const candidates = [...mlbCandidates, ...nflCandidates, ...footballCandidates, ...nbaCandidates, ...nhlCandidates]
    .filter((candidate) => candidate?.americanOdds !== null && candidate?.americanOdds !== undefined)
    .filter((candidate) => candidate?.startTime && isSameEasternDate(candidate.startTime, new Date()))
    .sort((left, right) => (right.edgeMagnitude || 0) - (left.edgeMagnitude || 0));

  const selected = [];
  const bySport = new Set();
  for (const candidate of candidates) {
    if (selected.length >= 3) break;
    const decimal = americanToDecimal(candidate.americanOdds);
    if (!Number.isFinite(decimal)) continue;
    if (bySport.has(candidate.sport)) continue;
    bySport.add(candidate.sport);
    selected.push({
      ...candidate,
      americanOddsLabel: formatAmericanOdds(candidate.americanOdds),
      startLabel: formatEasternDisplay(candidate.startTime),
    });
  }

  for (const candidate of candidates) {
    if (selected.length >= 3) break;
    const decimal = americanToDecimal(candidate.americanOdds);
    if (!Number.isFinite(decimal)) continue;
    if (selected.some((entry) => entry.league === candidate.league && entry.gameId === candidate.gameId)) continue;
    selected.push({
      ...candidate,
      americanOddsLabel: formatAmericanOdds(candidate.americanOdds),
      startLabel: formatEasternDisplay(candidate.startTime),
    });
  }

  const parlay = buildParlayOdds(selected);
  const verifiedAt = new Date().toISOString();
  const betLegs = selected.map((bet) => ({
    ...bet,
    normalizedOdds: americanToDecimal(bet.americanOdds),
  }));
  return {
    bets: betLegs,
    betLegs,
    parlay: parlay
      ? {
          ...parlay,
          americanLabel: formatAmericanOdds(parlay.american),
          stake: 10,
          return: calculateReturn(10, parlay.american),
        }
      : null,
    parlaySummary: parlay
      ? {
          ...parlay,
          americanLabel: formatAmericanOdds(parlay.american),
          stake: 10,
          return: calculateReturn(10, parlay.american),
          verifiedAt,
        }
      : null,
    verifiedAt,
    footballLanding,
    lastUpdated: new Date().toISOString(),
  };
}

async function buildHubHeroSnapshot() {
  const footballLeagueKeys = Object.keys(FOOTBALL_LEAGUES);
  const [storiesResult, betsResult, worldBoardResult, mlbScoreboardResult, nbaSnapshotResult, nhlGamesResult, nflBoardResult, cbbBoardResult, footballBoardsResult] = await Promise.allSettled([
    getHubTrendingStories(),
    getHubTopBets(),
    getWorldTopPlayers(),
    fetchMlbScoreboard(),
    getNbaBootstrapSnapshot(),
    fetchNhlScoreboard(),
    getGenericSportSnapshot('nfl'),
    getGenericSportSnapshot('cbb'),
    Promise.allSettled(footballLeagueKeys.map((leagueKey) => getFootballLeagueSnapshot(leagueKey))),
  ]);

  const stories = settledValue(storiesResult, { stories: [], heroStories: [], secondaryStories: [] });
  const bets = settledValue(betsResult, { bets: [], betLegs: [], parlay: null, parlaySummary: null, verifiedAt: null });
  const worldBoard = settledValue(worldBoardResult, { players: [], lastUpdated: null });
  const mlbScoreboard = settledValue(mlbScoreboardResult, { games: [] });
  const nbaSnapshot = settledValue(nbaSnapshotResult, { games: [] });
  const nhlGames = settledValue(nhlGamesResult, []);
  const nflBoard = settledValue(nflBoardResult, { scoreboard: [] });
  const cbbBoard = settledValue(cbbBoardResult, { scoreboard: [] });
  const footballBoards = settledValue(footballBoardsResult, [])
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  const liveTicker = buildLiveTickerBundle({
    mlbScoreboard,
    nbaSnapshot,
    nhlGames,
    nflBoard,
    cbbBoard,
    footballBoards,
  });
  const cardSpotlights = await buildCardSpotlights();
  const playerFallbacks = Object.fromEntries(
    (worldBoard?.players || []).map((player) => [String(player.leagueLabel || '').toLowerCase(), player]),
  );

  const fallbackMap = {
    nhl: playerFallbacks.nhl,
    mlb: playerFallbacks.mlb,
    nba: playerFallbacks.nba,
    cbb: playerFallbacks.cbb,
    nfl: playerFallbacks.nfl,
    football:
      Object.values(playerFallbacks).find((player) =>
        ['premier league', 'la liga', 'serie a', 'ligue 1', 'champions league', 'mls'].includes(String(player?.leagueLabel || '').toLowerCase()),
      ) || null,
  };

  Object.entries(fallbackMap).forEach(([sportKey, player]) => {
    const existing = cardSpotlights[sportKey];
    if (!player) return;

    if (!existing || !existing.image) {
      cardSpotlights[sportKey] = {
        image: existing?.image || player.headshot || player.teamLogo || '',
        league: existing?.league || player.leagueLabel,
        headline: existing?.headline || `${player.displayName} • ${player.position}`,
        subhead: existing?.subhead || player.teamAbbr || '',
      };
    }
  });

  return {
    worldBoard,
    trendingStories: stories.stories,
    heroStories: stories.heroStories,
    secondaryStories: stories.secondaryStories,
    topBets: bets.betLegs,
    betLegs: bets.betLegs,
    parlay: bets.parlaySummary,
    parlaySummary: bets.parlaySummary,
    verifiedAt: bets.verifiedAt,
    cardSpotlights,
    liveTicker,
    nowLabel: getEasternNowLabel(),
    lastUpdated: new Date().toISOString(),
  };
}

export async function getHubTrendingStories({ force = false } = {}) {
  return getHotSnapshot(`hub-trending-stories-${HUB_CACHE_VERSION}`, () => buildTrendingStoriesSnapshot(), {
    ttlMs: STORY_TTL_MS,
    force,
  });
}

export async function getHubStoryDetail(storyId, apiHref = '') {
  const snapshot = await getHubTrendingStories();
  const story = (snapshot?.stories || []).find((item) => String(item.storyId) === String(storyId));
  if (!story && !apiHref) {
    throw new Error('Story not found');
  }

  if ((story?.isEspnStory && story?.apiHref) || apiHref) {
    const detail = await fetchEspnStoryDetail(storyId, story?.apiHref || apiHref);
    return {
      ...detail,
      sport: story?.sport || null,
      league: story?.league || null,
      clusterId: story?.clusterId || null,
      sourceId: story?.sourceId || 'espn',
    };
  }

  return {
    storyId: story.storyId,
    headline: story.headline,
    dek: story.summary,
    body: story.body || `<p>${escapeHtml(story.summary || story.headline)}</p>`,
    published: story.published,
    byline: story.source,
    source: story.source,
    image: story.image,
    contentType: story.contentType,
    related: [],
    sport: story.sport,
    league: story.league,
    clusterId: story.clusterId,
    sourceId: story.sourceId,
  };
}

export async function getHubTopBets({ force = false } = {}) {
  return getHotSnapshot(`hub-top-bets-${HUB_CACHE_VERSION}`, () => buildTopBetsSnapshot(), {
    ttlMs: BETS_TTL_MS,
    force,
  });
}

export async function getHubHero({ force = false } = {}) {
  return getHotSnapshot(`hub-hero-${HUB_CACHE_VERSION}`, () => buildHubHeroSnapshot(), {
    ttlMs: HERO_TTL_MS,
    force,
  });
}

export async function warmHubSnapshots() {
  const leagueKeys = Object.keys(FOOTBALL_LEAGUES);

  const results = await Promise.allSettled([
    warmSnapshot(
      'hub-mlb-top-players',
      async () => {
        const cached = getCachedTopPlayers(50);
        if (cached) return cached;
        const stale = getStaleTopPlayers();
        if (stale) return stale;
        return computeTopPlayers(50);
      },
      { force: true, ttlMs: 15 * 60 * 1000 },
    ),
    warmSnapshot(`hub-trending-stories-${HUB_CACHE_VERSION}`, () => buildTrendingStoriesSnapshot(), { force: true, ttlMs: STORY_TTL_MS }),
    warmSnapshot(`hub-top-bets-${HUB_CACHE_VERSION}`, () => buildTopBetsSnapshot(), { force: true, ttlMs: BETS_TTL_MS }),
    warmSnapshot(`hub-hero-${HUB_CACHE_VERSION}`, () => buildHubHeroSnapshot(), { force: true, ttlMs: HERO_TTL_MS }),
    getGenericSportSnapshot('nfl', { force: true }),
    getGenericSportSnapshot('cbb', { force: true }),
    getFootballLandingSnapshot({ force: true }),
    ...leagueKeys.map((leagueKey) => getFootballLeagueSnapshot(leagueKey, { force: true })),
  ]);

  const failed = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result.status === 'rejected')
    .map(({ result, index }) => ({
      index,
      error: result.reason?.message || String(result.reason || 'Unknown warm failure'),
    }));

  return {
    ok: failed.length === 0,
    failed,
    lastUpdated: new Date().toISOString(),
  };
}
