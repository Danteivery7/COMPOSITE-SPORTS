import { fetchEspnStoryDetail, normalizeEspnNewsArticle } from '@/src/lib/espn-news';
import { getWorldTopPlayers } from '@/src/lib/world-rankings';
import { fetchMLBNews } from '@/src/mlb/lib/news';
import { fetchScoreboard as fetchMlbScoreboard } from '@/src/mlb/lib/espn';
import { predict as predictMlbGame } from '@/src/mlb/lib/predictor';
import { getNbaNewsFeed, getNbaBootstrapSnapshot } from '@/src/lib/nba-backend';
import {
  getFootballLeagueSnapshot,
  getFootballLandingSnapshot,
  getGenericSportSnapshot,
} from '@/src/lib/live-sports-backend';
import { FOOTBALL_LEAGUES } from '@/src/lib/football';
import { americanToDecimal, buildParlayOdds, calculateReturn, extractEspnOdds, formatAmericanOdds } from '@/src/lib/odds';
import { getHotSnapshot, warmSnapshot } from '@/src/lib/snapshot-store';
import { formatEasternDisplay, getEasternNowLabel, isSameEasternDate, isWithinLastHours } from '@/src/lib/time';

const STORY_TTL_MS = 5 * 60 * 1000;
const BETS_TTL_MS = 90 * 1000;
const HERO_TTL_MS = 60 * 1000;

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

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
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

  const stories = diversifyStories(
    Array.from(bestByCluster.values()).sort((left, right) => scoreStory(right) - scoreStory(left)),
    4,
  ).map((story, index) => ({
    ...story,
    heroRank: index + 1,
  }));

  const cardSpotlights = {
    nhl: stories.find((story) => story.sport === 'nhl') || null,
    mlb: stories.find((story) => story.sport === 'mlb') || null,
    nba: stories.find((story) => story.sport === 'nba') || null,
    cbb: stories.find((story) => story.sport === 'cbb') || null,
    nfl: stories.find((story) => story.sport === 'nfl') || null,
    football: stories.find((story) => story.sport === 'football') || null,
  };

  return {
    stories,
    cardSpotlights,
    worldBoard,
    lastUpdated: new Date().toISOString(),
  };
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

async function buildTopBetsSnapshot() {
  const [nflBoardResult, footballBoardsResult, mlbCandidatesResult, nbaSnapshotResult, footballLandingResult] = await Promise.allSettled([
    getGenericSportSnapshot('nfl'),
    Promise.allSettled(Object.keys(FOOTBALL_LEAGUES).map((leagueKey) => getFootballLeagueSnapshot(leagueKey))),
    buildMlbBetCandidates(),
    getNbaBootstrapSnapshot(),
    getFootballLandingSnapshot(),
  ]);

  const nflBoard = settledValue(nflBoardResult, { predictors: [], scoreboard: [] });
  const footballBoards = settledValue(footballBoardsResult, [])
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  const mlbCandidates = settledValue(mlbCandidatesResult, []);
  const nbaSnapshot = settledValue(nbaSnapshotResult, null);
  const footballLanding = settledValue(footballLandingResult, null);

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

  const candidates = [...mlbCandidates, ...nflCandidates, ...footballCandidates, ...nbaCandidates]
    .filter((candidate) => candidate?.americanOdds !== null && candidate?.americanOdds !== undefined)
    .filter((candidate) => candidate?.startTime && isSameEasternDate(candidate.startTime, new Date()))
    .sort((left, right) => (right.edgeMagnitude || 0) - (left.edgeMagnitude || 0));

  const selected = [];
  const byLeague = new Set();
  for (const candidate of candidates) {
    if (selected.length >= 3) break;
    const decimal = americanToDecimal(candidate.americanOdds);
    if (!Number.isFinite(decimal)) continue;
    if (byLeague.has(candidate.league) && selected.length < 2) continue;
    byLeague.add(candidate.league);
    selected.push({
      ...candidate,
      americanOddsLabel: formatAmericanOdds(candidate.americanOdds),
      startLabel: formatEasternDisplay(candidate.startTime),
    });
  }

  const parlay = buildParlayOdds(selected);
  return {
    bets: selected,
    parlay: parlay
      ? {
          ...parlay,
          americanLabel: formatAmericanOdds(parlay.american),
          stake: 10,
          return: calculateReturn(10, parlay.american),
        }
      : null,
    footballLanding,
    lastUpdated: new Date().toISOString(),
  };
}

async function buildHubHeroSnapshot() {
  const [storiesResult, betsResult, worldBoardResult] = await Promise.allSettled([
    getHubTrendingStories(),
    getHubTopBets(),
    getWorldTopPlayers(),
  ]);

  const stories = settledValue(storiesResult, { stories: [], cardSpotlights: {} });
  const bets = settledValue(betsResult, { bets: [], parlay: null });
  const worldBoard = settledValue(worldBoardResult, { players: [], lastUpdated: null });

  const cardSpotlights = { ...(stories.cardSpotlights || {}) };
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
    if (!cardSpotlights[sportKey] && player) {
      cardSpotlights[sportKey] = {
        image: player.headshot || '',
        league: player.leagueLabel,
        headline: `${player.displayName} • ${player.position}`,
      };
    }
  });

  return {
    worldBoard,
    trendingStories: stories.stories,
    topBets: bets.bets,
    parlay: bets.parlay,
    cardSpotlights,
    nowLabel: getEasternNowLabel(),
    lastUpdated: new Date().toISOString(),
  };
}

export async function getHubTrendingStories({ force = false } = {}) {
  return getHotSnapshot('hub-trending-stories', () => buildTrendingStoriesSnapshot(), {
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
  return getHotSnapshot('hub-top-bets', () => buildTopBetsSnapshot(), {
    ttlMs: BETS_TTL_MS,
    force,
  });
}

export async function getHubHero({ force = false } = {}) {
  return getHotSnapshot('hub-hero', () => buildHubHeroSnapshot(), {
    ttlMs: HERO_TTL_MS,
    force,
  });
}

export async function warmHubSnapshots() {
  const leagueKeys = Object.keys(FOOTBALL_LEAGUES);

  const results = await Promise.allSettled([
    warmSnapshot('hub-trending-stories', () => buildTrendingStoriesSnapshot(), { force: true, ttlMs: STORY_TTL_MS }),
    warmSnapshot('hub-top-bets', () => buildTopBetsSnapshot(), { force: true, ttlMs: BETS_TTL_MS }),
    warmSnapshot('hub-hero', () => buildHubHeroSnapshot(), { force: true, ttlMs: HERO_TTL_MS }),
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
