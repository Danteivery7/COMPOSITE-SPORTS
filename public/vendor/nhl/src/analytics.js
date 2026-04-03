import { readCachedSettings, snapshotTeamRankings } from "./cache.js";
import { LEADER_CATEGORY_LABELS, TTL } from "./config.js";
import {
  clamp,
  compareByScore,
  extractIdFromRef,
  formatPercent,
  formatSigned,
  getStatValue,
  round,
  uniqBy,
} from "./utils.js";

function flattenStatsCategories(payload) {
  const categories =
    payload?.results?.stats?.categories ||
    payload?.splits?.categories ||
    payload?.categories ||
    [];

  const map = {};
  categories.forEach((category) => {
    (category.stats || []).forEach((stat) => {
      map[stat.name] = stat;
      if (stat.type) {
        map[stat.type] = stat;
      }
    });
  });
  return map;
}

function flattenRecordStats(record) {
  const map = {};
  (record?.stats || []).forEach((stat) => {
    map[stat.name] = stat;
    if (stat.type) {
      map[stat.type] = stat;
    }
  });
  return map;
}

function scaleMetric(value, values, options = {}) {
  const numericValues = values.filter(Number.isFinite);
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);

  if (!Number.isFinite(value) || max === min) {
    return 50;
  }

  const normalized = (value - min) / (max - min);
  const scaled = options.invert ? 1 - normalized : normalized;
  return clamp(scaled * 100, 0, 100);
}

function getOverallRecord(entry) {
  return entry?.records?.find((record) => record.type === "total" || record.name === "overall");
}

function streakValue(displayValue = "") {
  if (!displayValue || displayValue === "-") return 0;
  const code = displayValue[0];
  const value = Number(displayValue.slice(1) || 0);
  if (code === "W") return value;
  if (code === "L") return -value;
  return 0;
}

export function buildTeamRankings(standingsEntries = [], teamStatsById = {}, teamsById = {}) {
  const base = standingsEntries
    .map((entry) => {
      const teamId = extractIdFromRef(entry.team?.$ref);
      const teamMeta = teamsById[teamId];
      const overall = getOverallRecord(entry);
      const recordStats = flattenRecordStats(overall);
      const statsMap = flattenStatsCategories(teamStatsById[teamId]);

      if (!teamId || !teamMeta || !overall) {
        return null;
      }

      const goalsForPerGame = Number(recordStats.avgPointsFor?.value || statsMap.goals?.perGameValue || 0);
      const goalsAgainstPerGame = Number(
        recordStats.avgPointsAgainst?.value || statsMap.avgGoalsAgainst?.value || 0,
      );
      const powerPlayPct = Number(recordStats.powerPlayPct?.value || 0);
      const penaltyKillPct = Number(recordStats.penaltyKillPct?.value || 0);
      const pointDiff = Number(recordStats.pointsDiff?.value || recordStats.pointDifferential?.value || 0);
      const winPct = Number(recordStats.winPercent?.value || overall.value || 0);
      const savePct = Number(statsMap.savePct?.value || 0);
      const shootingPct = Number(statsMap.shootingPct?.value || 0);
      const faceoffPct = Number(statsMap.faceoffPercent?.value || 0);
      const shotsFor = Number(statsMap.shotsTotal?.perGameValue || 0);
      const shotsAgainst = Number(statsMap.shotsAgainst?.perGameValue || 0);
      const streakDisplay = recordStats.streak?.displayValue || "-";
      const streak = streakValue(streakDisplay);
      const gamesPlayed = Number(recordStats.gamesPlayed?.value || 1);
      const diffPerGame = pointDiff / Math.max(1, gamesPlayed);

      return {
        id: teamId,
        team: teamMeta,
        standing: entry,
        overall,
        recordStats,
        statsMap,
        goalsForPerGame,
        goalsAgainstPerGame,
        powerPlayPct,
        penaltyKillPct,
        pointDiff,
        winPct,
        savePct,
        shootingPct,
        faceoffPct,
        shotsFor,
        shotsAgainst,
        streak,
        streakDisplay,
        diffPerGame,
      };
    })
    .filter(Boolean);

  const metrics = {
    winPct: base.map((team) => team.winPct),
    pointDiff: base.map((team) => team.pointDiff),
    goalsForPerGame: base.map((team) => team.goalsForPerGame),
    goalsAgainstPerGame: base.map((team) => team.goalsAgainstPerGame),
    powerPlayPct: base.map((team) => team.powerPlayPct),
    penaltyKillPct: base.map((team) => team.penaltyKillPct),
    savePct: base.map((team) => team.savePct),
    shootingPct: base.map((team) => team.shootingPct),
    faceoffPct: base.map((team) => team.faceoffPct),
    shotsFor: base.map((team) => team.shotsFor),
    shotsAgainst: base.map((team) => team.shotsAgainst),
  };

  const rankings = base
    .map((team) => {
      const offenseScore =
        scaleMetric(team.goalsForPerGame, metrics.goalsForPerGame) * 0.42 +
        scaleMetric(team.powerPlayPct, metrics.powerPlayPct) * 0.2 +
        scaleMetric(team.shootingPct, metrics.shootingPct) * 0.18 +
        scaleMetric(team.shotsFor, metrics.shotsFor) * 0.2;

      const defenseScore =
        scaleMetric(team.goalsAgainstPerGame, metrics.goalsAgainstPerGame, { invert: true }) * 0.42 +
        scaleMetric(team.penaltyKillPct, metrics.penaltyKillPct) * 0.2 +
        scaleMetric(team.savePct, metrics.savePct) * 0.24 +
        scaleMetric(team.shotsAgainst, metrics.shotsAgainst, { invert: true }) * 0.14;

      const controlScore =
        scaleMetric(team.winPct, metrics.winPct) * 0.52 +
        scaleMetric(team.pointDiff, metrics.pointDiff) * 0.28 +
        scaleMetric(team.faceoffPct, metrics.faceoffPct) * 0.2;

      const predictiveScore =
        offenseScore * 0.34 + defenseScore * 0.32 + controlScore * 0.34;

      const momentumScore = team.streak * 8 + team.winPct * 42 + team.diffPerGame * 20;

      return {
        ...team,
        offenseScore: round(offenseScore, 1),
        defenseScore: round(defenseScore, 1),
        controlScore: round(controlScore, 1),
        predictiveScore: round(predictiveScore, 1),
        compositeScore: round(predictiveScore, 1),
        momentumScore: round(momentumScore, 1),
      };
    })
    .sort((left, right) => compareByScore(left, right, "predictiveScore"));

  const rawScores = rankings.map((team) => team.predictiveScore);
  const minRaw = Math.min(...rawScores);
  const maxRaw = Math.max(...rawScores);
  const displayScale = (value) => {
    if (!Number.isFinite(value) || maxRaw === minRaw) return 80;
    const normalized = (value - minRaw) / (maxRaw - minRaw);
    return round(74 + normalized * 14, 1);
  };

  rankings.forEach((team) => {
    team.compositeScore = displayScale(team.predictiveScore);
  });

  const snapshot = readCachedSettings("rankings-snapshot", null);
  const snapshotFresh =
    snapshot && Date.now() - snapshot.timestamp <= TTL.RANKINGS && snapshot.values;
  const reference = snapshotFresh ? snapshot.values : null;

  rankings.forEach((team, index) => {
    const prior = reference?.[team.id];
    const delta = Number.isFinite(prior) ? team.compositeScore - prior : team.momentumScore / 45;
    team.rank = index + 1;
    team.tier = team.rank <= 10 ? "gold" : "standard";
    team.trend =
      delta > 1.2 ? "up" : delta < -1.2 ? "down" : "flat";
    team.trendLabel =
      team.trend === "up" ? `Up ${formatSigned(delta, 1)}` :
      team.trend === "down" ? `Down ${formatSigned(delta, 1)}` :
      "Holding";
  });

  if (!snapshotFresh) {
    snapshotTeamRankings(rankings);
  }

  return rankings;
}

export function summarizeLeaguePulse(scoreboard, rankings, featuredPlayers) {
  const liveGames = (scoreboard?.events || []).filter((event) => {
    const status = event?.competitions?.[0]?.status?.type;
    return status?.state === "in" || status?.description?.toLowerCase().includes("progress");
  }).length;
  const hotTeam = rankings?.[0] || null;
  const hotPlayer = featuredPlayers?.[0] || null;

  return {
    liveGames,
    hotTeam,
    hotPlayer,
    headline:
      liveGames > 0
        ? `${liveGames} live game${liveGames === 1 ? "" : "s"} on the ice right now.`
        : "The next slate is building with market lines and model projections already in sync.",
  };
}

export function getGameLifecycle(event, now = Date.now()) {
  const competition = event?.competitions?.[0];
  const status = competition?.status?.type || {};
  const start = new Date(event?.date || Date.now()).getTime();
  const minutesUntil = (start - now) / 60000;
  const state = status.state || "";

  if (status.completed) {
    const isStale = now - start > 12 * 60 * 60 * 1000 && new Date(now).getHours() >= 10;
    return { key: "final", label: status.detail || "Final", dim: isStale, fire: false, soon: false };
  }

  if (state === "in" || status.description?.toLowerCase().includes("progress")) {
    const detail = competition?.status?.type?.detail || status.detail || "Live";
    return { key: "live", label: detail, dim: false, fire: false, soon: false };
  }

  if (minutesUntil <= 5 && minutesUntil > -1) {
    return { key: "fire", label: "About to start", dim: false, fire: true, soon: false };
  }

  if (minutesUntil <= 30 && minutesUntil > 5) {
    return { key: "soon", label: "Starting soon", dim: false, fire: false, soon: true };
  }

  return { key: "scheduled", label: status.detail || "Scheduled", dim: false, fire: false, soon: false };
}

export function suggestedPollInterval(scoreboard) {
  const events = scoreboard?.events || [];
  const lifecycles = events.map((event) => getGameLifecycle(event));
  if (lifecycles.some((item) => item.key === "live")) return 10_000;
  if (lifecycles.some((item) => item.key === "fire")) return 5_000;
  if (lifecycles.some((item) => item.key === "soon")) return 20_000;
  return 60_000;
}

function moneylineToProbability(odds) {
  const numeric = Number(String(odds).replace("+", ""));
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) {
    return Math.abs(numeric) / (Math.abs(numeric) + 100);
  }
  return 100 / (numeric + 100);
}

export function buildGameProjection(event, rankingsById = {}, summary = null) {
  const competition = event?.competitions?.[0];
  if (!competition) return null;
  const home = competition.competitors.find((team) => team.homeAway === "home");
  const away = competition.competitors.find((team) => team.homeAway === "away");
  const homeRank = rankingsById[home?.team?.id];
  const awayRank = rankingsById[away?.team?.id];
  if (!home || !away || !homeRank || !awayRank) return null;

  const homeAdvantage = 3.8;
  const rankGap = ((homeRank.predictiveScore ?? homeRank.compositeScore) - (awayRank.predictiveScore ?? awayRank.compositeScore)) * 0.72;
  const momentumGap = (homeRank.momentumScore - awayRank.momentumScore) * 0.1;
  const goalieEdge = deriveGoalieEdge(summary);
  const modelEdge = rankGap + momentumGap + homeAdvantage + goalieEdge;
  const homeWinProbability = clamp(1 / (1 + Math.exp(-modelEdge / 12)), 0.05, 0.95);

  const homeGoals =
    clamp(
      ((homeRank.goalsForPerGame + awayRank.goalsAgainstPerGame) / 2) + modelEdge / 18,
      1.8,
      5.8,
    );
  const awayGoals =
    clamp(
      ((awayRank.goalsForPerGame + homeRank.goalsAgainstPerGame) / 2) - modelEdge / 24,
      1.5,
      5.2,
    );
  const projectedTotal = round(homeGoals + awayGoals, 1);

  const odds = competition.odds?.[0] || summary?.pickcenter?.[0] || null;
  const homeMoneyline = odds?.moneyline?.home?.close?.odds ?? odds?.homeTeamOdds?.moneyLine ?? null;
  const awayMoneyline = odds?.moneyline?.away?.close?.odds ?? odds?.awayTeamOdds?.moneyLine ?? null;
  const marketHomeProbability = moneylineToProbability(homeMoneyline);
  const marketEdge =
    Number.isFinite(marketHomeProbability) ? homeWinProbability - marketHomeProbability : null;
  const totalEdge = Number.isFinite(odds?.overUnder) ? projectedTotal - odds.overUnder : null;

  return {
    homeTeamId: home.team.id,
    awayTeamId: away.team.id,
    homeWinProbability,
    awayWinProbability: 1 - homeWinProbability,
    homeGoals: round(homeGoals, 1),
    awayGoals: round(awayGoals, 1),
    projectedTotal,
    projectedMargin: round(homeGoals - awayGoals, 1),
    homeMoneyline,
    awayMoneyline,
    marketEdge,
    totalEdge,
    odds,
    modelScoreLabel: `${home.team.abbreviation} ${round(homeGoals, 1)} - ${away.team.abbreviation} ${round(awayGoals, 1)}`,
  };
}

function deriveGoalieEdge(summary) {
  if (!summary?.goalies) return 0;
  const homeGoalie = summary.goalies.homeTeam?.athletes?.[0];
  const awayGoalie = summary.goalies.awayTeam?.athletes?.[0];
  if (!homeGoalie || !awayGoalie) return 0;

  const getGoalieStat = (goalie, statName) => Number(
    goalie.statistics?.find((stat) => stat.name === statName)?.displayValue?.replace("%", "") || 0,
  );

  const homeSave = getGoalieStat(homeGoalie, "savePct");
  const awaySave = getGoalieStat(awayGoalie, "savePct");
  const homeGaa = getGoalieStat(homeGoalie, "avgGoalsAgainst");
  const awayGaa = getGoalieStat(awayGoalie, "avgGoalsAgainst");

  return (homeSave - awaySave) * 160 + (awayGaa - homeGaa) * 3;
}

export function buildPredictorCards(scoreboard, rankings) {
  const rankingsById = Object.fromEntries(rankings.map((team) => [team.id, team]));
  return (scoreboard?.events || [])
    .map((event) => ({
      event,
      projection: buildGameProjection(event, rankingsById),
      lifecycle: getGameLifecycle(event),
    }))
    .filter((entry) => entry.projection && entry.lifecycle.key !== "final")
    .sort((a, b) => b.projection.marketEdge - a.projection.marketEdge);
}

export function buildFeaturedPlayers(leaderEntries = [], teamsById = {}) {
  const categoryWeights = {
    points: 16,
    goals: 14,
    assists: 12,
    savePct: 14,
    avgGoalsAgainst: 12,
    wins: 10,
    shutouts: 8,
    plusMinus: 8,
    hits: 7,
    blockedShots: 7,
    shots: 8,
  };

  const bucket = new Map();

  leaderEntries.forEach((entry) => {
    const current = bucket.get(entry.playerId) || {
      playerId: entry.playerId,
      teamId: entry.teamId,
      fullName: entry.fullName,
      shortName: entry.shortName,
      headshot: entry.headshot,
      featured: [],
      provisionalScore: 0,
      rankTotal: 0,
    };
    const weight = categoryWeights[entry.category] || 6;
    current.provisionalScore += Math.max(0, 18 - entry.rank) * weight;
    current.rankTotal += entry.rank;
    current.featured.push({
      category: entry.category,
      label: LEADER_CATEGORY_LABELS[entry.category] || entry.categoryLabel,
      rank: entry.rank,
      displayValue: entry.displayValue,
    });
    bucket.set(entry.playerId, current);
  });

  return Array.from(bucket.values())
    .map((player) => ({
      ...player,
      team: teamsById[player.teamId] || null,
      featured: player.featured.sort((a, b) => a.rank - b.rank).slice(0, 3),
      provisionalOvr: clamp(round(58 + player.provisionalScore / 18, 0), 55, 99),
    }))
    .sort((a, b) => b.provisionalScore - a.provisionalScore);
}

function mapStats(payload) {
  return flattenStatsCategories(payload);
}

function classifyTone(score) {
  if (score >= 5) return { label: "Sizzling", className: "tone-sizzling" };
  if (score >= 4) return { label: "Hot", className: "tone-hot" };
  if (score >= 3) return { label: "Steady", className: "tone-steady" };
  if (score >= 2) return { label: "Chilly", className: "tone-chilly" };
  return { label: "Slump", className: "tone-slump" };
}

export function buildPlayerCard(bundle, teamsById = {}) {
  const profile = bundle?.profile || {};
  const seasonStats = mapStats(bundle?.seasonStats);
  const careerStats = mapStats(bundle?.careerStats);
  const teamId = extractIdFromRef(profile.team?.$ref) || null;
  const team = teamsById[teamId] || null;
  const position = profile.position?.abbreviation || "F";
  const games = Number(seasonStats.games?.value || 0);
  const age = Number(profile.age || 0);
  const isGoalie = position === "G";

  const seasonPpg = Number(seasonStats.points?.value || 0) / Math.max(1, games);
  const careerGames = Number(careerStats.games?.value || 0);
  const careerPpg = Number(careerStats.points?.value || 0) / Math.max(1, careerGames);
  const seasonGpg = Number(seasonStats.goals?.value || 0) / Math.max(1, games);
  const careerGpg = Number(careerStats.goals?.value || 0) / Math.max(1, careerGames);
  const seasonApg = Number(seasonStats.assists?.value || 0) / Math.max(1, games);
  const careerApg = Number(careerStats.assists?.value || 0) / Math.max(1, careerGames);
  const seasonShooting = Number(seasonStats.shootingPct?.value || 0);
  const careerShooting = Number(careerStats.shootingPct?.value || 0);
  const seasonSave = Number(seasonStats.savePct?.value || 0);
  const careerSave = Number(careerStats.savePct?.value || 0);
  const seasonGaa = Number(seasonStats.avgGoalsAgainst?.value || 0);
  const careerGaa = Number(careerStats.avgGoalsAgainst?.value || 0);
  const seasonWins = Number(seasonStats.wins?.value || 0);
  const careerWins = Number(careerStats.wins?.value || 0);
  const sampleTrust = clamp(isGoalie ? games / 12 : games / 25, 0, 1);

  let hotnessScore = 0;
  if (isGoalie) {
    hotnessScore += seasonSave > careerSave ? 1 : 0;
    hotnessScore += seasonGaa > 0 && seasonGaa < careerGaa ? 1 : 0;
    hotnessScore += seasonWins / Math.max(1, games) > careerWins / Math.max(1, careerGames) ? 1 : 0;
    hotnessScore += Number(seasonStats.shutouts?.value || 0) > Number(careerStats.shutouts?.value || 0) / Math.max(1, careerGames) * games ? 1 : 0;
    hotnessScore += Number(seasonStats.saves?.value || 0) / Math.max(1, games) >= 26 ? 1 : 0;
  } else {
    hotnessScore += seasonPpg > careerPpg ? 1 : 0;
    hotnessScore += seasonGpg > careerGpg ? 1 : 0;
    hotnessScore += seasonApg > careerApg ? 1 : 0;
    hotnessScore += seasonShooting > careerShooting ? 1 : 0;
    hotnessScore += Number(seasonStats.shots?.value || seasonStats.shotsTotal?.value || 0) / Math.max(1, games) >= 3 ? 1 : 0;
  }

  let seasonComponent;
  let careerComponent;
  if (isGoalie) {
    seasonComponent =
      clamp((seasonSave - 0.87) * 900, 0, 45) +
      clamp((3.5 - seasonGaa) * 16, 0, 28) +
      clamp((seasonWins / Math.max(1, games)) * 40, 0, 18) +
      clamp(Number(seasonStats.shutouts?.value || 0) * 2, 0, 10);
    careerComponent =
      clamp((careerSave - 0.87) * 900, 0, 40) +
      clamp((3.5 - careerGaa) * 14, 0, 24) +
      clamp((careerWins / Math.max(1, careerGames)) * 34, 0, 16);
  } else {
    seasonComponent =
      clamp(seasonPpg * 34, 0, 36) +
      clamp(seasonGpg * 40, 0, 22) +
      clamp(seasonApg * 32, 0, 18) +
      clamp(seasonShooting * 1.2, 0, 10) +
      clamp(Number(seasonStats.plusMinus?.value || 0) / Math.max(1, games) * 18 + 5, 0, 10) +
      clamp((Number(seasonStats.faceoffPercent?.value || 0) - 44) * 0.6, 0, 4);
    careerComponent =
      clamp(careerPpg * 30, 0, 30) +
      clamp(careerGpg * 34, 0, 16) +
      clamp(careerApg * 28, 0, 14) +
      clamp(careerShooting * 0.8, 0, 8) +
      clamp(Number(careerStats.plusMinus?.value || 0) / Math.max(1, careerGames) * 14 + 4, 0, 8);
  }

  const agePenalty = age > 34 ? (age - 34) * 2.5 : 0;
  const baseline = 45;
  const weighted =
    baseline * (1 - sampleTrust) +
    (seasonComponent * 0.74 + careerComponent * 0.26) * sampleTrust;
  const overall = clamp(round(weighted - agePenalty + 5, 0), 37, 99);
  const tone = classifyTone(hotnessScore);

  return {
    playerId: profile.id || bundle.playerId,
    fullName: profile.fullName || "Unknown Player",
    shortName: profile.shortName || profile.fullName || "Player",
    jersey: profile.jersey || "--",
    age,
    position,
    team,
    headshot: profile.headshot?.href || "",
    teamId,
    overall,
    hotnessScore,
    tone,
    sampleTrust,
    seasonPpg: round(seasonPpg, 2),
    careerPpg: round(careerPpg, 2),
    seasonGoals: Number(seasonStats.goals?.value || 0),
    seasonAssists: Number(seasonStats.assists?.value || 0),
    seasonPoints: Number(seasonStats.points?.value || 0),
    shootingPct: seasonStats.shootingPct?.displayValue || "--",
    savePct: seasonStats.savePct?.displayValue || "--",
    gaa: seasonStats.avgGoalsAgainst?.displayValue || "--",
    games,
    profile,
    seasonStats,
    careerStats,
    statisticsLog: bundle.statisticsLog,
    seasonHistory: bundle.statisticsLog?.seasonHistory || [],
  };
}

export function buildSpotlightCards(rankings, players, predictorCards, scoreboard) {
  const nextGame = predictorCards.find((entry) => entry.lifecycle.key !== "final") || null;
  return [
    {
      label: "Top Team",
      value: rankings?.[0] ? `${rankings[0].team.abbreviation} ${rankings[0].compositeScore}` : "--",
      foot: rankings?.[0]?.trendLabel || "Waiting for rankings",
    },
    {
      label: "Top Player",
      value: players?.[0] ? `${players[0].team?.abbreviation || "NHL"} ${players[0].provisionalOvr}` : "--",
      foot: players?.[0]?.featured?.[0]?.label || "Waiting for player leaders",
    },
    {
      label: "Live Games",
      value: `${(scoreboard?.events || []).filter((event) => getGameLifecycle(event).key === "live").length}`,
      foot: "10-second live polling",
    },
    {
      label: "Best Edge",
      value: nextGame?.projection?.marketEdge ? formatPercent(Math.abs(nextGame.projection.marketEdge), 1) : "--",
      foot: nextGame ? nextGame.event.name : "Next market edge pending",
    },
  ];
}

export function buildRankingsLookup(rankings = []) {
  return Object.fromEntries(rankings.map((entry) => [entry.id, entry]));
}

export function buildFilteredSearchIndex(teams = [], rosters = {}, featuredPlayers = []) {
  const teamResults = teams.map((team) => ({
    id: team.id,
    type: "team",
    title: team.displayName,
    subtitle: `${team.abbreviation} team page`,
  }));

  const playerResults = uniqBy(
    [
      ...Object.values(rosters).flatMap((payload) =>
        (payload?.athletes || []).flatMap((bucket) =>
          (bucket.items || []).map((player) => ({
            id: String(player.id),
            type: "player",
            title: player.fullName,
            subtitle: `${player.position?.abbreviation || "Skater"} • ${player.jersey ? `#${player.jersey}` : "NHL"}`,
          })),
        ),
      ),
      ...featuredPlayers.map((player) => ({
        id: player.playerId,
        type: "player",
        title: player.fullName || player.playerId,
        subtitle: `${player.team?.abbreviation || "NHL"} • model feature`,
      })),
    ],
    (entry) => `${entry.type}:${entry.id}`,
  );

  return [...teamResults, ...playerResults];
}
