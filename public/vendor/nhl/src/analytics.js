import { readCachedSettings, snapshotTeamRankings } from "./cache.js";
import { LEADER_CATEGORY_LABELS, TTL } from "./config.js";
import {
  average,
  clamp,
  extractIdFromRef,
  formatPercent,
  formatSigned,
  normalizeNhlPosition,
  round,
  resolveNhlHeadshot,
  uniqBy,
} from "./utils.js";

const GOALIE_FORMULA = {
  savePct: 0.24,
  gsaxPer60: 0.24,
  highDangerProxy: 0.18,
  reboundControl: 0.12,
  workloadQuality: 0.08,
  puckHandling: 0.06,
  consistency: 0.08,
};

const DEFENSE_FORMULA = {
  suppression: 0.3,
  transition: 0.22,
  puckMovement: 0.18,
  gapAndStickWork: 0.12,
  physicality: 0.1,
  offensiveContribution: 0.08,
};

const CENTER_FORMULA = {
  twoWayImpact: 0.26,
  playmaking: 0.2,
  scoring: 0.18,
  transition: 0.14,
  faceoffs: 0.12,
  chanceGeneration: 0.1,
};

const WING_FORMULA = {
  scoringAndFinishing: 0.26,
  chanceGeneration: 0.2,
  playDriving: 0.18,
  forecheckAndBattles: 0.14,
  defensiveImpact: 0.12,
  playmaking: 0.1,
};

function flattenStatsCategories(payload) {
  const categories =
    payload?.results?.stats?.categories ||
    payload?.splits?.categories ||
    payload?.categories ||
    [];

  const map = {};
  categories.forEach((category) => {
    (category.stats || []).forEach((stat) => {
      if (stat?.name) map[stat.name] = stat;
      if (stat?.type) map[stat.type] = stat;
    });
  });
  return map;
}

function flattenRecordStats(record) {
  const map = {};
  (record?.stats || []).forEach((stat) => {
    if (stat?.name) map[stat.name] = stat;
    if (stat?.type) map[stat.type] = stat;
  });
  return map;
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

function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function decimalToPct(value) {
  const numeric = toNumber(value, null);
  if (!Number.isFinite(numeric)) return null;
  return numeric <= 1 ? numeric * 100 : numeric;
}

function sum(values = []) {
  return values.filter(Number.isFinite).reduce((total, value) => total + value, 0);
}

function percentile(value, values = [], invert = false) {
  if (!Number.isFinite(value)) return null;
  const numeric = values.filter(Number.isFinite);
  if (!numeric.length) return 50;
  const sorted = numeric.slice().sort((left, right) => left - right);
  let lower = 0;
  while (lower < sorted.length && sorted[lower] < value) lower += 1;
  const rank = sorted.length === 1 ? 0.5 : lower / (sorted.length - 1);
  const pct = clamp(rank * 100, 0, 100);
  return invert ? 100 - pct : pct;
}

function normalizeWeights(weightMap = {}, metricValues = {}) {
  const available = Object.entries(weightMap).filter(([key]) => Number.isFinite(metricValues[key]));
  if (!available.length) return 50;
  const totalWeight = sum(available.map(([, weight]) => weight));
  return available.reduce((score, [key, weight]) => score + metricValues[key] * (weight / totalWeight), 0);
}

function blendPercentile(currentPct, priorPct, reliability) {
  const priorBlend = Number.isFinite(priorPct) ? (priorPct * 0.7) + 15 : 50;
  if (!Number.isFinite(currentPct)) return round(priorBlend, 2);
  return round((reliability * currentPct) + ((1 - reliability) * priorBlend), 2);
}

function scalePercentileToOverall(percentileValue, options = {}) {
  const pct = clamp(percentileValue, 0, 1);
  const bands = [
    [0.0, 0.15, 60, 68],
    [0.15, 0.4, 68, 75],
    [0.4, 0.7, 75, 82],
    [0.7, 0.88, 82, 89],
    [0.88, 0.96, 89, 94],
    [0.96, 0.99, 94, 97],
    [0.99, 1.0, 97, 98],
  ];

  let overall = 60;
  bands.some(([start, end, low, high]) => {
    const withinBand = pct >= start && (pct <= end || end === 1);
    if (!withinBand) return false;
    const span = end - start || 1;
    const progress = clamp((pct - start) / span, 0, 1);
    overall = low + ((high - low) * progress);
    return true;
  });

  if (options.allow99) return 99;
  return clamp(round(overall, 1), 60, 98);
}

function sliceAverage(players = []) {
  const values = players
    .map((player) => player?.overallPercentile)
    .filter(Number.isFinite);
  return values.length ? average(values) : 50;
}

function sliceAverageWithFallback(players = [], fallback = 50) {
  const values = players
    .map((player) => player?.overallPercentile)
    .filter(Number.isFinite);
  return values.length ? average(values) : fallback;
}

function leagueAverage(rows = [], key) {
  return average(rows.map((row) => toNumber(row?.[key], null)));
}

function ageAdjustment(age) {
  if (!Number.isFinite(age)) return 0;
  if (age >= 24 && age <= 29) return 0.5;
  if ((age >= 22 && age <= 23) || age === 30 || age === 31) return 0;
  if (age === 32 || age === 33) return -0.5;
  if (age === 34 || age === 35) return -1;
  if (age >= 36) return -1.5;
  return 0;
}

function metricCollectionsByPosition(profiles = []) {
  const buckets = { G: {}, D: {}, C: {}, W: {} };
  profiles.forEach((profile) => {
    const bucket = buckets[profile.resolvedPosition] || buckets.W;
    Object.entries(profile.currentRawMetrics || {}).forEach(([key, value]) => {
      if (!bucket[key]) bucket[key] = [];
      if (Number.isFinite(value)) bucket[key].push(value);
    });
    Object.entries(profile.priorRawMetrics || {}).forEach(([key, value]) => {
      if (!bucket[`prior:${key}`]) bucket[`prior:${key}`] = [];
      if (Number.isFinite(value)) bucket[`prior:${key}`].push(value);
    });
  });
  return buckets;
}

function moneylineToProbability(odds) {
  const numeric = Number(String(odds).replace("+", ""));
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) {
    return Math.abs(numeric) / (Math.abs(numeric) + 100);
  }
  return 100 / (numeric + 100);
}

function groupBy(items = [], selector) {
  return items.reduce((map, item) => {
    const key = selector(item);
    if (!map[key]) map[key] = [];
    map[key].push(item);
    return map;
  }, {});
}

function pickCurrentTeamId(meta, teamsByAbbrev) {
  const teamId = String(meta?.teamId || "").trim();
  if (teamId) return teamId;
  const teamAbbrev = String(meta?.teamAbbrev || meta?.teamAbbrevs || "").trim();
  return teamAbbrev ? String(teamsByAbbrev[teamAbbrev]?.id || "") : "";
}

function buildTeamContexts(standingsEntries = [], teamsById = {}, advancedSnapshot = null) {
  const standingsById = Object.fromEntries(
    (standingsEntries || [])
      .map((entry) => [String(extractIdFromRef(entry?.team?.$ref) || ""), entry])
      .filter(([teamId]) => teamId),
  );

  const teamSummary = advancedSnapshot?.teams?.summary || [];
  const teamPercentages = advancedSnapshot?.teams?.percentages || [];
  const recentFormByAbbrev = advancedSnapshot?.teams?.recentFormByAbbrev || {};
  const teamPercentagesById = Object.fromEntries(teamPercentages.map((row) => [String(row.teamId), row]));

  const rawTeams = teamSummary
    .map((summaryRow) => {
      const teamId = String(summaryRow.teamId || "");
      const team = teamsById[teamId];
      const percentageRow = teamPercentagesById[teamId] || null;
      const standing = standingsById[teamId] || null;
      const overall = getOverallRecord(standing);
      const recordStats = flattenRecordStats(overall);
      const teamAbbrev = team?.abbreviation || summaryRow.teamAbbrev || summaryRow.teamAbbrevs || "";
      const recent = recentFormByAbbrev[teamAbbrev] || {
        last10PointsPct: 0.5,
        last10GoalDiffRate: 0,
        otFinalCount: 0,
      };
      const gamesPlayed = Number(summaryRow.gamesPlayed || recordStats.gamesPlayed?.value || 0) || 1;
      const standingPoints = Number(recordStats.points?.value || summaryRow.points || 0);
      const derivedPointPct = standingPoints > 0 ? (standingPoints / Math.max(1, gamesPlayed * 2)) * 100 : null;
      const goalDiffRate = (Number(summaryRow.goalsFor || 0) - Number(summaryRow.goalsAgainst || 0)) / Math.max(1, gamesPlayed);
      const underlyingRaw =
        (decimalToPct(percentageRow?.usatPct) || 50) * 0.4 +
        (decimalToPct(percentageRow?.satPct) || 50) * 0.3 +
        goalDiffRate * 6 * 0.3;

      return {
        teamId,
        team,
        teamAbbrev,
        summaryRow,
        percentageRow,
        standing,
        overall,
        recordDisplay: overall?.displayValue || `${summaryRow.wins || 0}-${summaryRow.losses || 0}-${summaryRow.otLosses || 0}`,
        streakDisplay: recordStats.streak?.displayValue || "-",
        streak: streakValue(recordStats.streak?.displayValue || "-"),
        recent,
        gamesPlayed,
        points: standingPoints,
        pointPct: decimalToPct(summaryRow.pointPct) || derivedPointPct || 50,
        goalsForPerGame: Number(summaryRow.goalsForPerGame || 0),
        goalsAgainstPerGame: Number(summaryRow.goalsAgainstPerGame || 0),
        powerPlayPct: decimalToPct(summaryRow.powerPlayPct) || 0,
        penaltyKillPct: decimalToPct(summaryRow.penaltyKillPct) || 0,
        faceoffPct: decimalToPct(summaryRow.faceoffWinPct) || 0,
        shotsForPerGame: Number(summaryRow.shotsForPerGame || 0),
        shotsAgainstPerGame: Number(summaryRow.shotsAgainstPerGame || 0),
        savePct5v5: decimalToPct(percentageRow?.savePct5v5) || 0,
        satPct: decimalToPct(percentageRow?.satPct) || 50,
        usatPct: decimalToPct(percentageRow?.usatPct) || 50,
        goalDiffRate,
        underlyingRaw,
      };
    })
    .filter((entry) => entry.teamId && entry.team);

  const underlyingValues = rawTeams.map((team) => team.underlyingRaw);
  const recentValues = rawTeams.map(
    (team) => (team.recent.last10PointsPct * 100 * 0.6) + (team.recent.last10GoalDiffRate * 14 * 0.4),
  );
  const pointValues = rawTeams.map((team) => team.pointPct);

  return Object.fromEntries(
    rawTeams.map((team) => {
      const recentRaw = (team.recent.last10PointsPct * 100 * 0.6) + (team.recent.last10GoalDiffRate * 14 * 0.4);
      return [
        team.teamId,
        {
          ...team,
          underlyingPct: percentile(team.underlyingRaw, underlyingValues),
          recentPct: percentile(recentRaw, recentValues),
          seasonPct: percentile(team.pointPct, pointValues),
        },
      ];
    }),
  );
}

function buildPlayerMetaRows(rosters = {}, advancedSnapshot = null, teamsById = {}) {
  const teamsByAbbrev = Object.fromEntries(
    Object.values(teamsById).map((team) => [team.abbreviation, team]),
  );

  const rosterPlayers = Object.values(rosters).flatMap((payload) =>
    (payload?.athletes || []).flatMap((bucket) =>
      (bucket.items || []).map((player) => ({
        playerId: String(player.id),
        fullName: player.fullName || player.displayName || "Player",
        shortName: player.shortName || player.displayName || player.fullName || "Player",
        jersey: player.jersey || "--",
        age: toNumber(player.age, null),
        teamId: String(player.teamId || extractIdFromRef(player?.teams?.[0]?.$ref) || ""),
        teamAbbrev: teamsById[String(player.teamId || extractIdFromRef(player?.teams?.[0]?.$ref) || "")]?.abbreviation || "",
        resolvedPosition: normalizeNhlPosition(player.position?.abbreviation || player.position?.name || ""),
        headshot:
          player.headshot?.href ||
          player.headshot ||
          resolveNhlHeadshot(player.id, teamsById[String(player.teamId || extractIdFromRef(player?.teams?.[0]?.$ref) || "")]?.abbreviation || ""),
      })),
    ),
  );

  const advancedPlayers = uniqBy(
    [
      ...(advancedSnapshot?.skaters?.current?.summary || []).map((row) => ({
        playerId: String(row.playerId),
        fullName: row.skaterFullName || row.lastName || "Skater",
        shortName: row.skaterFullName || row.lastName || "Skater",
        jersey: "--",
        age: null,
        teamId: pickCurrentTeamId(row, teamsByAbbrev),
        teamAbbrev: row.teamAbbrevs || "",
        resolvedPosition: normalizeNhlPosition(row.positionCode),
        headshot: resolveNhlHeadshot(row.playerId, row.teamAbbrevs || ""),
      })),
      ...(advancedSnapshot?.goalies?.current?.summary || []).map((row) => ({
        playerId: String(row.playerId),
        fullName: row.goalieFullName || row.lastName || "Goalie",
        shortName: row.goalieFullName || row.lastName || "Goalie",
        jersey: "--",
        age: null,
        teamId: pickCurrentTeamId(row, teamsByAbbrev),
        teamAbbrev: row.teamAbbrevs || "",
        resolvedPosition: "G",
        headshot: resolveNhlHeadshot(row.playerId, row.teamAbbrevs || ""),
      })),
    ],
    (entry) => entry.playerId,
  );

  return uniqBy([...rosterPlayers, ...advancedPlayers], (entry) => entry.playerId);
}

function buildSkaterRawMetrics(summaryRow = {}, realtimeRow = {}, percentageRow = {}, toiRow = {}) {
  const gp = Math.max(1, Number(summaryRow.gamesPlayed || realtimeRow.gamesPlayed || toiRow.gamesPlayed || 0));
  const pointsPerGame = Number(summaryRow.pointsPerGame || summaryRow.points / gp || 0);
  const assistsPerGame = Number(summaryRow.assists || 0) / gp;
  const goalsPerGame = Number(summaryRow.goals || 0) / gp;
  const shotsPerGame = Number(summaryRow.shots || 0) / gp;
  const attemptsPerGame = Number(realtimeRow.totalShotAttempts || 0) / gp;
  const ppPointsPerGame = Number(summaryRow.ppPoints || 0) / gp;
  const shToiPerGame = Number(toiRow.shTimeOnIcePerGame || 0) / 60;
  const evToiPerGame = Number(toiRow.evTimeOnIcePerGame || summaryRow.timeOnIcePerGame || 0) / 60;
  const totalToiMinutes = (Number(toiRow.timeOnIce || 0) || (Number(toiRow.timeOnIcePerGame || summaryRow.timeOnIcePerGame || 0) * gp)) / 60;
  const faceoffPct = decimalToPct(summaryRow.faceoffWinPct);
  const shootingPct = decimalToPct(summaryRow.shootingPct) || Number(summaryRow.shootingPct || 0);
  const plusMinusPerGame = Number(summaryRow.plusMinus || 0) / gp;
  const takeawaysPer60 = Number(realtimeRow.takeawaysPer60 || 0);
  const giveawaysPer60 = Number(realtimeRow.giveawaysPer60 || 0);
  const hitsPer60 = Number(realtimeRow.hitsPer60 || 0);
  const blockedShotsPer60 = Number(realtimeRow.blockedShotsPer60 || 0);
  const satPct = decimalToPct(percentageRow.satPercentage) || 50;
  const usatPct = decimalToPct(percentageRow.usatPercentage) || 50;
  const satRelative = Number(percentageRow.satRelative || 0) * 100;
  const usatRelative = Number(percentageRow.usatRelative || 0) * 100;
  const penaltyMinutesPerGame = Number(summaryRow.penaltyMinutes || 0) / gp;

  const playDriving = (usatPct * 0.45) + (satPct * 0.35) + (usatRelative * 2.2) + (satRelative * 1.4);
  const defensiveImpact = (takeawaysPer60 * 9) - (giveawaysPer60 * 3.2) + (blockedShotsPer60 * 5.5) + (shToiPerGame * 0.6) + (plusMinusPerGame * 8);
  const transition = (usatRelative * 2.1) + (evToiPerGame * 1.8) + (takeawaysPer60 * 6.5);
  const chanceGeneration = (attemptsPerGame * 8.5) + (shotsPerGame * 6.5) + (goalsPerGame * 22);
  const playmaking = (assistsPerGame * 34) + (ppPointsPerGame * 12) + (usatRelative * 1.8);
  const scoring = (pointsPerGame * 28) + (goalsPerGame * 32) + (shootingPct * 0.8);
  const scoringAndFinishing = (goalsPerGame * 42) + (shootingPct * 1.2) + (shotsPerGame * 5.2);
  const forecheckAndBattles = (hitsPer60 * 7.5) + (takeawaysPer60 * 8) + (blockedShotsPer60 * 3.2);
  const suppression = (usatPct * 0.45) + (blockedShotsPer60 * 7.4) + (takeawaysPer60 * 4.8) - (giveawaysPer60 * 2.2) + (shToiPerGame * 0.7);
  const puckMovement = (assistsPerGame * 30) + (ppPointsPerGame * 16) + (usatRelative * 1.5) + (evToiPerGame * 1.15);
  const gapAndStickWork = (takeawaysPer60 * 9.2) - (penaltyMinutesPerGame * 1.8) - (giveawaysPer60 * 1.6);
  const physicality = (hitsPer60 * 8.2) + (blockedShotsPer60 * 6.4);
  const offensiveContribution = (pointsPerGame * 26) + (shotsPerGame * 6.8) + (shootingPct * 0.55);
  const twoWayImpact = (playDriving * 0.42) + (defensiveImpact * 0.34) + (pointsPerGame * 22);

  return {
    gp,
    totalToiMinutes,
    pointsPerGame,
    faceoffPct,
    playDriving,
    defensiveImpact,
    transition,
    chanceGeneration,
    playmaking,
    scoring,
    scoringAndFinishing,
    forecheckAndBattles,
    suppression,
    puckMovement,
    gapAndStickWork,
    physicality,
    offensiveContribution,
    twoWayImpact,
    takeawaysPer60,
    giveawaysPer60,
    hitsPer60,
    blockedShotsPer60,
    shotsPerGame,
    goalsPerGame,
    assistsPerGame,
    points: Number(summaryRow.points || 0),
    goals: Number(summaryRow.goals || 0),
    assists: Number(summaryRow.assists || 0),
    shootingPct,
  };
}

function buildGoalieRawMetrics(summaryRow = {}, advancedRow = {}, leagueSavePct = 0.9) {
  const starts = Number(summaryRow.gamesStarted || advancedRow.gamesStarted || 0);
  const gp = Math.max(1, Number(summaryRow.gamesPlayed || advancedRow.gamesPlayed || 0));
  const timeOnIceSeconds = Number(summaryRow.timeOnIce || advancedRow.timeOnIce || 0);
  const timeOnIceMinutes = timeOnIceSeconds / 60;
  const savePctDecimal = Number(summaryRow.savePct || advancedRow.savePct || 0);
  const shotsAgainst = Number(summaryRow.shotsAgainst || 0);
  const goalsAgainstAverage = Number(summaryRow.goalsAgainstAverage || advancedRow.goalsAgainstAverage || 0);
  const qualityStartsPct = decimalToPct(advancedRow.qualityStartsPct) || 50;
  const completeGamePct = decimalToPct(advancedRow.completeGamePct) || 50;
  const shotsAgainstPer60 = Number(advancedRow.shotsAgainstPer60 || 0);
  const winsPerStart = Number(summaryRow.wins || 0) / Math.max(1, starts);
  const gsax = (savePctDecimal - leagueSavePct) * shotsAgainst;
  const gsaxPer60 = timeOnIceSeconds > 0 ? gsax / (timeOnIceSeconds / 3600) : 0;
  const reboundControl = ((3.9 - goalsAgainstAverage) * 14) + ((34 - shotsAgainstPer60) * 1.9);

  return {
    gp,
    starts,
    totalToiMinutes: timeOnIceMinutes,
    savePctDecimal,
    goalsAgainstAverage,
    gsaxPer60,
    highDangerProxy: qualityStartsPct,
    reboundControl,
    workloadQuality: (starts * 4.5) + (shotsAgainstPer60 * 1.3) + (timeOnIceMinutes / 12),
    puckHandling: Number(summaryRow.assists || 0) ? (Number(summaryRow.assists || 0) * 18) : null,
    consistency: (qualityStartsPct * 0.72) + (completeGamePct * 0.28),
    wins: Number(summaryRow.wins || 0),
    savePct: savePctDecimal * 100,
    gaa: goalsAgainstAverage,
    winsPerStart,
  };
}

function buildPlayerProfiles(advancedSnapshot = null, rosters = {}, teamsById = {}, standingsEntries = []) {
  const teamContexts = buildTeamContexts(standingsEntries, teamsById, advancedSnapshot);
  const teamsByAbbrev = Object.fromEntries(Object.values(teamsById).map((team) => [team.abbreviation, team]));
  const metaRows = buildPlayerMetaRows(rosters, advancedSnapshot, teamsById);
  const metaById = Object.fromEntries(metaRows.map((entry) => [entry.playerId, entry]));

  const currentSkaterSummary = Object.fromEntries((advancedSnapshot?.skaters?.current?.summary || []).map((row) => [String(row.playerId), row]));
  const currentSkaterRealtime = Object.fromEntries((advancedSnapshot?.skaters?.current?.realtime || []).map((row) => [String(row.playerId), row]));
  const currentSkaterPercentages = Object.fromEntries((advancedSnapshot?.skaters?.current?.percentages || []).map((row) => [String(row.playerId), row]));
  const currentSkaterToi = Object.fromEntries((advancedSnapshot?.skaters?.current?.timeOnIce || []).map((row) => [String(row.playerId), row]));
  const priorSkaterSummary = Object.fromEntries((advancedSnapshot?.skaters?.prior?.summary || []).map((row) => [String(row.playerId), row]));
  const priorSkaterRealtime = Object.fromEntries((advancedSnapshot?.skaters?.prior?.realtime || []).map((row) => [String(row.playerId), row]));
  const priorSkaterPercentages = Object.fromEntries((advancedSnapshot?.skaters?.prior?.percentages || []).map((row) => [String(row.playerId), row]));
  const priorSkaterToi = Object.fromEntries((advancedSnapshot?.skaters?.prior?.timeOnIce || []).map((row) => [String(row.playerId), row]));
  const currentGoalieSummary = Object.fromEntries((advancedSnapshot?.goalies?.current?.summary || []).map((row) => [String(row.playerId), row]));
  const currentGoalieAdvanced = Object.fromEntries((advancedSnapshot?.goalies?.current?.advanced || []).map((row) => [String(row.playerId), row]));
  const priorGoalieSummary = Object.fromEntries((advancedSnapshot?.goalies?.prior?.summary || []).map((row) => [String(row.playerId), row]));
  const priorGoalieAdvanced = Object.fromEntries((advancedSnapshot?.goalies?.prior?.advanced || []).map((row) => [String(row.playerId), row]));
  const goalieLeagueSavePct = leagueAverage(advancedSnapshot?.goalies?.current?.summary || [], "savePct") || 0.9;
  const profileIds = uniqBy(
    [
      ...metaRows.map((entry) => entry.playerId),
      ...Object.keys(currentSkaterSummary),
      ...Object.keys(currentGoalieSummary),
      ...Object.keys(priorSkaterSummary),
      ...Object.keys(priorGoalieSummary),
    ],
    (entry) => entry,
  );

  const rawProfiles = profileIds.map((playerId) => {
    const meta = metaById[playerId] || {};
    const currentSkater = currentSkaterSummary[playerId];
    const currentGoalie = currentGoalieSummary[playerId];
    const priorSkater = priorSkaterSummary[playerId];
    const priorGoalie = priorGoalieSummary[playerId];
    const teamAbbrev =
      meta.teamAbbrev ||
      currentSkater?.teamAbbrevs ||
      currentGoalie?.teamAbbrevs ||
      priorSkater?.teamAbbrevs ||
      priorGoalie?.teamAbbrevs ||
      "";
    const teamId =
      meta.teamId ||
      String(teamsByAbbrev[teamAbbrev]?.id || "") ||
      String(currentSkater?.teamId || currentGoalie?.teamId || "");
    const resolvedPosition = normalizeNhlPosition(
      meta.resolvedPosition ||
      currentSkater?.positionCode ||
      priorSkater?.positionCode ||
      (currentGoalie || priorGoalie ? "G" : "W"),
    );
    const currentRawMetrics =
      resolvedPosition === "G"
        ? buildGoalieRawMetrics(currentGoalie || {}, currentGoalieAdvanced[playerId] || {}, goalieLeagueSavePct)
        : buildSkaterRawMetrics(
            currentSkater || {},
            currentSkaterRealtime[playerId] || {},
            currentSkaterPercentages[playerId] || {},
            currentSkaterToi[playerId] || {},
          );
    const priorRawMetrics =
      resolvedPosition === "G"
        ? buildGoalieRawMetrics(priorGoalie || {}, priorGoalieAdvanced[playerId] || {}, goalieLeagueSavePct)
        : buildSkaterRawMetrics(
            priorSkater || {},
            priorSkaterRealtime[playerId] || {},
            priorSkaterPercentages[playerId] || {},
            priorSkaterToi[playerId] || {},
          );

    return {
      playerId: String(playerId),
      fullName:
        meta.fullName ||
        currentSkater?.skaterFullName ||
        currentGoalie?.goalieFullName ||
        priorSkater?.skaterFullName ||
        priorGoalie?.goalieFullName ||
        "Player",
      shortName: meta.shortName || meta.fullName || currentSkater?.lastName || currentGoalie?.lastName || "Player",
      jersey: meta.jersey || "--",
      age: toNumber(meta.age, null),
      teamId,
      teamAbbrev,
      team: teamsById[teamId] || teamsByAbbrev[teamAbbrev] || null,
      resolvedPosition,
      headshot: meta.headshot || resolveNhlHeadshot(playerId, teamAbbrev),
      currentRawMetrics,
      priorRawMetrics,
      teamContext: teamContexts[teamId] || null,
    };
  });

  const pools = metricCollectionsByPosition(rawProfiles);
  return rawProfiles.map((profile) => {
    const bucket = pools[profile.resolvedPosition] || pools.W;
    const current = profile.currentRawMetrics;
    const prior = profile.priorRawMetrics;
    const isGoalie = profile.resolvedPosition === "G";
    const gp = Number(current.gp || 0);
    const totalToiMinutes = Number(current.totalToiMinutes || 0);
    const reliability = isGoalie
      ? clamp(Math.min((Number(current.starts || 0) / 10) || 0, (totalToiMinutes / 600) || 0), 0.35, 1)
      : clamp(Math.min((gp / 25) || 0, (totalToiMinutes / 400) || 0), 0.35, 1);

    const metricKeys = Object.keys(isGoalie
      ? GOALIE_FORMULA
      : profile.resolvedPosition === "D"
        ? DEFENSE_FORMULA
        : profile.resolvedPosition === "C"
          ? CENTER_FORMULA
          : WING_FORMULA);

    const stableMetrics = Object.fromEntries(
      metricKeys.map((key) => {
        const currentPct = percentile(current[key], bucket[key] || [], key === "gaa");
        const priorPct = percentile(prior[key], bucket[`prior:${key}`] || [], key === "gaa");
        return [key, blendPercentile(currentPct, priorPct, reliability)];
      }),
    );

    const drivePct = average(
      profile.resolvedPosition === "G"
        ? [stableMetrics.savePct, stableMetrics.gsaxPer60, stableMetrics.consistency]
        : profile.resolvedPosition === "D"
          ? [stableMetrics.suppression, stableMetrics.transition, stableMetrics.puckMovement]
          : profile.resolvedPosition === "C"
            ? [stableMetrics.twoWayImpact, stableMetrics.transition, stableMetrics.playmaking]
            : [stableMetrics.playDriving, stableMetrics.chanceGeneration, stableMetrics.scoringAndFinishing],
    );

    const basePercentile = normalizeWeights(
      isGoalie
        ? GOALIE_FORMULA
        : profile.resolvedPosition === "D"
          ? DEFENSE_FORMULA
          : profile.resolvedPosition === "C"
            ? CENTER_FORMULA
            : WING_FORMULA,
      stableMetrics,
    );

    const teamUnderlyingPct = Number(profile.teamContext?.underlyingPct || 50);
    const teamAdj = clamp((((teamUnderlyingPct - 50) / 50) * 1.5) * (0.35 + (0.65 * (drivePct / 100))), -1.5, 1.5);
    const priorAnchor = average(Object.values(stableMetrics).filter(Number.isFinite));
    const recentAdj = clamp(((basePercentile - priorAnchor) / 25), -1.5, 1.5);
    const gamesAvailablePct = gp / Math.max(1, Number(profile.teamContext?.gamesPlayed || gp || 1));
    const durabilityAdj = clamp((gamesAvailablePct - 0.85) * 4, -1, 1);
    const consistencyPct =
      stableMetrics.consistency ??
      stableMetrics.playDriving ??
      stableMetrics.twoWayImpact ??
      stableMetrics.suppression ??
      50;
    const consistencyAdj = clamp((consistencyPct - 50) / 50, -1, 1);
    const finalPercentile = clamp(
      basePercentile + teamAdj + recentAdj + durabilityAdj + consistencyAdj + ageAdjustment(profile.age),
      0,
      100,
    );
    const coreMetricThresholds = Object.values(stableMetrics).filter((value) => Number.isFinite(value) && value >= 97).length;
    const allow99 =
      finalPercentile >= 99.7 &&
      recentAdj > 0 &&
      durabilityAdj >= 0 &&
      coreMetricThresholds >= 3;
    const overall = scalePercentileToOverall(finalPercentile / 100, { allow99 });

    return {
      ...profile,
      overall,
      overallPercentile: round(finalPercentile, 2),
      basePercentile: round(basePercentile, 2),
      drivePct: round(drivePct, 2),
      reliability: round(reliability, 2),
      stableMetrics,
      hotnessScore: clamp(Math.round((recentAdj + 1.5) * 1.6), 1, 5),
      tone:
        recentAdj >= 1
          ? { label: "Sizzling", className: "tone-sizzling" }
          : recentAdj >= 0.35
            ? { label: "Hot", className: "tone-hot" }
            : recentAdj >= -0.2
              ? { label: "Steady", className: "tone-steady" }
              : recentAdj >= -0.8
                ? { label: "Chilly", className: "tone-chilly" }
                : { label: "Slump", className: "tone-slump" },
      statLine:
        profile.resolvedPosition === "G"
          ? {
              gp,
              wins: Number(current.wins || 0),
              savePct: round(Number(current.savePct || 0), 1),
              gaa: round(Number(current.gaa || 0), 2),
            }
          : {
              gp,
              goals: Number(current.goals || 0),
              assists: Number(current.assists || 0),
              points: Number(current.points || 0),
              shotsPerGame: round(Number(current.shotsPerGame || 0), 1),
            },
      modelReasons: [
        `${profile.resolvedPosition} model`,
        `Reliability ${formatPercent(reliability, 0)}`,
        `Drive ${round(drivePct, 0)}th pct`,
      ],
    };
  });
}

function buildLegacyTeamRankings(standingsEntries = [], teamStatsById = {}, teamsById = {}) {
  const base = standingsEntries
    .map((entry) => {
      const teamId = extractIdFromRef(entry.team?.$ref);
      const teamMeta = teamsById[teamId];
      const overall = getOverallRecord(entry);
      const recordStats = flattenRecordStats(overall);
      const statsMap = flattenStatsCategories(teamStatsById[teamId]);

      if (!teamId || !teamMeta || !overall) return null;

      const goalsForPerGame = Number(recordStats.avgPointsFor?.value || statsMap.goals?.perGameValue || 0);
      const goalsAgainstPerGame = Number(recordStats.avgPointsAgainst?.value || statsMap.avgGoalsAgainst?.value || 0);
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
      const points = Number(recordStats.points?.value || 0);
      const pointPct = points > 0 ? (points / Math.max(1, gamesPlayed * 2)) * 100 : (winPct * 100);
      const diffPerGame = pointDiff / Math.max(1, gamesPlayed);

      return {
        id: teamId,
        team: teamMeta,
        overall,
        recordDisplay: overall.displayValue,
        streakDisplay,
        winPct,
        points,
        pointPct,
        goalsForPerGame,
        goalsAgainstPerGame,
        powerPlayPct,
        penaltyKillPct,
        faceoffPct,
        shotsFor,
        shotsAgainst,
        shootingPct,
        savePct,
        diffPerGame,
      };
    })
    .filter(Boolean);

  const goalsForValues = base.map((team) => team.goalsForPerGame);
  const goalsAgainstValues = base.map((team) => team.goalsAgainstPerGame);
  const shotsForValues = base.map((team) => team.shotsFor);
  const shotsAgainstValues = base.map((team) => team.shotsAgainst);
  const powerPlayValues = base.map((team) => team.powerPlayPct);
  const penaltyKillValues = base.map((team) => team.penaltyKillPct);
  const savePctValues = base.map((team) => team.savePct);
  const faceoffValues = base.map((team) => team.faceoffPct);
  const pointPctValues = base.map((team) => team.pointPct);
  const diffValues = base.map((team) => team.diffPerGame);
  const shootingValues = base.map((team) => team.shootingPct);
  const shotDiffValues = base.map((team) => team.shotsFor - team.shotsAgainst);

  const ranked = base
    .map((team) => {
      const forwardCore =
        (percentile(team.goalsForPerGame, goalsForValues) * 0.42) +
        (percentile(team.shotsFor, shotsForValues) * 0.18) +
        (percentile(team.powerPlayPct, powerPlayValues) * 0.14) +
        (percentile(team.shootingPct, shootingValues) * 0.1) +
        (percentile(team.pointPct, pointPctValues) * 0.16);
      const defenseCore =
        (percentile(team.goalsAgainstPerGame, goalsAgainstValues, true) * 0.34) +
        (percentile(team.shotsAgainst, shotsAgainstValues, true) * 0.2) +
        (percentile(team.penaltyKillPct, penaltyKillValues) * 0.18) +
        (percentile(team.faceoffPct, faceoffValues) * 0.08) +
        (percentile(team.diffPerGame, diffValues) * 0.2);
      const goaltending =
        (percentile(team.savePct, savePctValues) * 0.62) +
        (percentile(team.goalsAgainstPerGame, goalsAgainstValues, true) * 0.38);
      const specialTeams = average([
        percentile(team.powerPlayPct, powerPlayValues),
        percentile(team.penaltyKillPct, penaltyKillValues),
      ]);
      const underlyingScore =
        (percentile(team.diffPerGame, diffValues) * 0.46) +
        (percentile(team.shotsFor - team.shotsAgainst, shotDiffValues) * 0.3) +
        (percentile(team.pointPct, pointPctValues) * 0.24);
      const depthScore =
        (percentile(team.pointPct, pointPctValues) * 0.44) +
        (percentile(team.faceoffPct, faceoffValues) * 0.16) +
        (percentile(team.shotsFor, shotsForValues) * 0.2) +
        (percentile(team.shotsAgainst, shotsAgainstValues, true) * 0.2);
      const recentScore = clamp(50 + (streakValue(team.streakDisplay) * 4.2), 0, 100);
      const predictiveScore =
        72 +
        (team.pointPct * 0.13) +
        (team.diffPerGame * 4.4) +
        (forwardCore * 0.06) +
        (defenseCore * 0.06) +
        (goaltending * 0.05) +
        (specialTeams * 0.03) +
        (recentScore * 0.015);

      return {
        ...team,
        compositeScore: round(predictiveScore, 2),
        predictiveScore: round(predictiveScore, 2),
        offenseScore: round((forwardCore * 0.78) + (specialTeams * 0.22), 2),
        defenseScore: round((defenseCore * 0.62) + (goaltending * 0.38), 2),
        forwardCore: round(forwardCore, 2),
        defenseCore: round(defenseCore, 2),
        goaltending: round(goaltending, 2),
        specialTeams: round(specialTeams, 2),
        underlyingScore: round(underlyingScore, 2),
        recentScore: round(recentScore, 2),
        depthScore: round(depthScore, 2),
      };
    })
    .sort((left, right) => right.predictiveScore - left.predictiveScore);

  ranked.forEach((team, index) => {
    const teamPercentile = percentile(team.predictiveScore, ranked.map((entry) => entry.predictiveScore));
    const compositeScore = scalePercentileToOverall(teamPercentile / 100, {
      allow99:
        teamPercentile >= 99.7 &&
        team.forwardCore >= 95 &&
        team.defenseCore >= 95 &&
        team.goaltending >= 95 &&
        team.underlyingScore >= 92,
    });
    team.rank = index + 1;
    team.teamPercentile = round(teamPercentile, 2);
    team.compositeScore = round(clamp(compositeScore, 60, 99), 2);
    team.trend = "flat";
    team.trendLabel = "Holding";
  });

  return ranked;
}

function buildTeamPredictionSignals(team) {
  return [
    { label: "Top-six scoring", diff: team.forwardCore },
    { label: "Blue-line suppression", diff: team.defenseCore },
    { label: "Goalie edge", diff: team.goaltending },
    { label: "Special teams", diff: team.specialTeams },
    { label: "Recent form", diff: team.recentScore },
  ];
}

export function buildPlayerDirectory(advancedSnapshot = null, rosters = {}, teamsById = {}, standingsEntries = []) {
  if (!advancedSnapshot) return [];
  return buildPlayerProfiles(advancedSnapshot, rosters, teamsById, standingsEntries)
    .filter((player) => player.teamId && Number.isFinite(player.overall))
    .sort((left, right) => {
      if (right.overall !== left.overall) return right.overall - left.overall;
      return (right.overallPercentile || 0) - (left.overallPercentile || 0);
    });
}

export function buildTeamRankings(standingsEntries = [], teamStatsById = {}, teamsById = {}, advancedSnapshot = null, playerDirectory = []) {
  if (!advancedSnapshot) {
    return buildLegacyTeamRankings(standingsEntries, teamStatsById, teamsById);
  }

  const teamContexts = buildTeamContexts(standingsEntries, teamsById, advancedSnapshot);
  if (!Object.keys(teamContexts).length) {
    return buildLegacyTeamRankings(standingsEntries, teamStatsById, teamsById);
  }
  const playersByTeam = groupBy(
    (playerDirectory || []).filter((player) => player?.teamId),
    (player) => player.teamId,
  );
  const contextList = Object.values(teamContexts);
  const goalsForValues = contextList.map((team) => team.goalsForPerGame);
  const goalsAgainstValues = contextList.map((team) => team.goalsAgainstPerGame);
  const shotsForValues = contextList.map((team) => team.shotsForPerGame);
  const shotsAgainstValues = contextList.map((team) => team.shotsAgainstPerGame);
  const powerPlayValues = contextList.map((team) => team.powerPlayPct);
  const penaltyKillValues = contextList.map((team) => team.penaltyKillPct);
  const savePctValues = contextList.map((team) => team.savePct5v5);
  const faceoffValues = contextList.map((team) => team.faceoffPct);
  const goalDiffValues = contextList.map((team) => team.goalDiffRate);
  const recentGoalDiffValues = contextList.map((team) => team.recent.last10GoalDiffRate);

  const rawTeams = contextList
    .map((context) => {
      const roster = playersByTeam[context.teamId] || [];
      const forwards = roster
        .filter((player) => player.resolvedPosition === "C" || player.resolvedPosition === "W")
        .sort((left, right) => (right.currentRawMetrics?.totalToiMinutes || 0) - (left.currentRawMetrics?.totalToiMinutes || 0));
      const defense = roster
        .filter((player) => player.resolvedPosition === "D")
        .sort((left, right) => (right.currentRawMetrics?.totalToiMinutes || 0) - (left.currentRawMetrics?.totalToiMinutes || 0));
      const goalies = roster
        .filter((player) => player.resolvedPosition === "G")
        .sort((left, right) => (right.currentRawMetrics?.starts || 0) - (left.currentRawMetrics?.starts || 0));

      const forwardFallback =
        (percentile(context.goalsForPerGame, goalsForValues) * 0.42) +
        (percentile(context.shotsForPerGame, shotsForValues) * 0.18) +
        (percentile(context.powerPlayPct, powerPlayValues) * 0.16) +
        (context.seasonPct * 0.24);
      const defenseFallback =
        (percentile(context.goalsAgainstPerGame, goalsAgainstValues, true) * 0.32) +
        (percentile(context.shotsAgainstPerGame, shotsAgainstValues, true) * 0.24) +
        (percentile(context.penaltyKillPct, penaltyKillValues) * 0.16) +
        (percentile(context.faceoffPct, faceoffValues) * 0.08) +
        (percentile(context.goalDiffRate, goalDiffValues) * 0.2);
      const goalieFallback =
        (percentile(context.savePct5v5, savePctValues) * 0.55) +
        (percentile(context.goalsAgainstPerGame, goalsAgainstValues, true) * 0.25) +
        (percentile(context.recent.last10GoalDiffRate, recentGoalDiffValues) * 0.2);
      const depthFallback =
        (context.seasonPct * 0.46) +
        (context.satPct * 0.27) +
        (context.usatPct * 0.27);

      const line1 = sliceAverageWithFallback(forwards.slice(0, 3), forwardFallback);
      const line2 = sliceAverageWithFallback(forwards.slice(3, 6), forwardFallback);
      const line3 = sliceAverageWithFallback(forwards.slice(6, 9), depthFallback);
      const line4 = sliceAverageWithFallback(forwards.slice(9, 12), depthFallback);
      const pair1 = sliceAverageWithFallback(defense.slice(0, 2), defenseFallback);
      const pair2 = sliceAverageWithFallback(defense.slice(2, 4), defenseFallback);
      const pair3 = sliceAverageWithFallback(defense.slice(4, 6), depthFallback);
      const starter = goalies[0]?.overallPercentile ?? goalieFallback;
      const backup = goalies[1]?.overallPercentile ?? goalieFallback;
      const forwardCore = (line1 * 0.45) + (line2 * 0.3) + (line3 * 0.15) + (line4 * 0.1);
      const defenseCore = (pair1 * 0.5) + (pair2 * 0.32) + (pair3 * 0.18);
      const goaltending = (starter * 0.75) + (backup * 0.25);
      const depthScore = average([line3, line4, pair3]);
      const specialTeams = average([
        percentile(context.powerPlayPct, powerPlayValues),
        percentile(context.penaltyKillPct, penaltyKillValues),
      ]);
      const underlyingScore =
        (context.usatPct * 0.4) +
        (context.satPct * 0.3) +
        (percentile(context.goalDiffRate, goalDiffValues) * 0.3);
      const recentScore =
        (context.recent.last10PointsPct * 100 * 0.6) +
        (percentile(context.recent.last10GoalDiffRate, recentGoalDiffValues) * 0.4);
      const seasonScore = context.seasonPct;
      const teamBase =
        (forwardCore * 0.25) +
        (defenseCore * 0.22) +
        (goaltending * 0.18) +
        (depthScore * 0.1) +
        (specialTeams * 0.1) +
        (underlyingScore * 0.07) +
        (seasonScore * 0.04) +
        (recentScore * 0.04);

      return {
        id: context.teamId,
        team: context.team,
        overall: { displayValue: context.recordDisplay },
        recordDisplay: context.recordDisplay,
        streakDisplay: context.streakDisplay,
        winPct: context.pointPct / 100,
        points: round(context.points || 0, 2),
        goalsForPerGame: round(context.goalsForPerGame, 2),
        goalsAgainstPerGame: round(context.goalsAgainstPerGame, 2),
        powerPlayPct: round(context.powerPlayPct, 2),
        penaltyKillPct: round(context.penaltyKillPct, 2),
        faceoffPct: round(context.faceoffPct, 2),
        shotsForPerGame: round(context.shotsForPerGame, 2),
        shotsAgainstPerGame: round(context.shotsAgainstPerGame, 2),
        forwardCore: round(forwardCore, 2),
        defenseCore: round(defenseCore, 2),
        goaltending: round(goaltending, 2),
        depthScore: round(depthScore, 2),
        specialTeams: round(specialTeams, 2),
        underlyingScore: round(underlyingScore, 2),
        seasonScore: round(seasonScore, 2),
        recentScore: round(recentScore, 2),
        predictiveScore: round(teamBase, 2),
        context,
      };
    })
    .sort((left, right) => right.predictiveScore - left.predictiveScore);

  const teamBaseValues = rawTeams.map((team) => team.predictiveScore);
  const snapshot = readCachedSettings("rankings-snapshot", null);
  const snapshotFresh = snapshot && Date.now() - snapshot.timestamp <= TTL.RANKINGS && snapshot.values;

  const rankings = rawTeams
    .map((team) => {
      const teamPercentile = percentile(team.predictiveScore, teamBaseValues);
      const compositeScore = scalePercentileToOverall(teamPercentile / 100, {
        allow99:
          teamPercentile >= 99.7 &&
          team.forwardCore >= 95 &&
          team.defenseCore >= 95 &&
          team.goaltending >= 95 &&
          team.underlyingScore >= 92,
      });
      const prior = snapshotFresh?.values?.[team.id];
      const delta = Number.isFinite(prior) ? compositeScore - prior : 0;
      return {
        ...team,
        compositeScore: round(compositeScore, 2),
        offenseScore: round((team.forwardCore * 0.78) + (team.specialTeams * 0.22), 2),
        defenseScore: round((team.defenseCore * 0.62) + (team.goaltending * 0.38), 2),
        teamPercentile: round(teamPercentile, 2),
        trend: delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat",
        trendLabel:
          delta > 0.5 ? `Up ${formatSigned(delta, 1)}` :
          delta < -0.5 ? `Down ${formatSigned(delta, 1)}` :
          "Holding",
      };
    })
    .sort((left, right) => {
      if (right.compositeScore !== left.compositeScore) return right.compositeScore - left.compositeScore;
      return right.predictiveScore - left.predictiveScore;
    })
    .map((team, index) => ({
      ...team,
      rank: index + 1,
      tier: index < 10 ? "gold" : "standard",
    }));

  snapshotTeamRankings(rankings);
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
        : "The next slate is loaded with team form, goalie context, and whole-score projections.",
  };
}

function isExtendedFinal(event) {
  const detail = String(
    event?.status?.type?.detail ||
    event?.competitions?.[0]?.status?.type?.detail ||
    event?.status?.type?.shortDetail ||
    "",
  ).toUpperCase();
  return detail.includes("OT") || detail.includes("SO");
}

export function getGameLifecycle(event, now = Date.now()) {
  const competition = event?.competitions?.[0];
  const status = competition?.status?.type || {};
  const start = new Date(event?.date || Date.now()).getTime();
  const minutesUntil = (start - now) / 60000;
  const state = status.state || "";

  if (status.completed) {
    return {
      key: "final",
      label: status.detail || "Final",
      dim: false,
      fire: false,
      soon: false,
      horn: isExtendedFinal(event),
    };
  }

  if (state === "in" || status.description?.toLowerCase().includes("progress")) {
    const detail = competition?.status?.type?.detail || status.detail || "Live";
    return { key: "live", label: detail, dim: false, fire: false, soon: false, horn: false };
  }

  if (minutesUntil <= 5 && minutesUntil > -1) {
    return { key: "fire", label: "About to start", dim: false, fire: true, soon: false, horn: false };
  }

  if (minutesUntil <= 30 && minutesUntil > 5) {
    return { key: "soon", label: "Starting soon", dim: false, fire: false, soon: true, horn: false };
  }

  return { key: "scheduled", label: status.detail || "Scheduled", dim: false, fire: false, soon: false, horn: false };
}

export function suggestedPollInterval(scoreboard) {
  const events = scoreboard?.events || [];
  const lifecycles = events.map((event) => getGameLifecycle(event));
  if (lifecycles.some((item) => item.key === "live")) return 10_000;
  if (lifecycles.some((item) => item.key === "fire")) return 5_000;
  if (lifecycles.some((item) => item.key === "soon")) return 20_000;
  return 60_000;
}

export function buildTeamMatchupProjection(homeTeamId, awayTeamId, rankingsById = {}, event = null, summary = null) {
  if (!homeTeamId || !awayTeamId || String(homeTeamId) === String(awayTeamId)) return null;
  const homeRank = rankingsById[homeTeamId];
  const awayRank = rankingsById[awayTeamId];
  if (!homeRank || !awayRank) return null;

  const forwardGap = homeRank.forwardCore - awayRank.forwardCore;
  const defenseGap = homeRank.defenseCore - awayRank.defenseCore;
  const goalieGap = homeRank.goaltending - awayRank.goaltending;
  const specialGap = homeRank.specialTeams - awayRank.specialTeams;
  const recentGap = homeRank.recentScore - awayRank.recentScore;
  const underlyingGap = homeRank.underlyingScore - awayRank.underlyingScore;
  const homeAdvantage = event ? 2.2 : 1.4;
  const modelEdge =
    (forwardGap * 0.24) +
    (defenseGap * 0.16) +
    (goalieGap * 0.2) +
    (specialGap * 0.14) +
    (recentGap * 0.1) +
    (underlyingGap * 0.16) +
    homeAdvantage;
  const homeWinProbability = clamp(1 / (1 + Math.exp(-modelEdge / 9)), 0.08, 0.92);
  const homeBase = average([homeRank.goalsForPerGame, awayRank.goalsAgainstPerGame]);
  const awayBase = average([awayRank.goalsForPerGame, homeRank.goalsAgainstPerGame]);
  let homeGoals = Math.round(clamp(homeBase + (modelEdge / 24), 1.8, 6));
  let awayGoals = Math.round(clamp(awayBase - (modelEdge / 24), 1.5, 5.5));
  if (homeGoals === awayGoals) {
    if (homeWinProbability >= 0.5) homeGoals += 1;
    else awayGoals += 1;
  }

  const projectedTotal = homeGoals + awayGoals;
  const projectedMargin = homeGoals - awayGoals;
  const odds = event?.competitions?.[0]?.odds?.[0] || summary?.pickcenter?.[0] || null;
  const homeMoneyline = odds?.moneyline?.home?.close?.odds ?? odds?.homeTeamOdds?.moneyLine ?? null;
  const awayMoneyline = odds?.moneyline?.away?.close?.odds ?? odds?.awayTeamOdds?.moneyLine ?? null;
  const marketHomeProbability = moneylineToProbability(homeMoneyline);
  const marketEdge = Number.isFinite(marketHomeProbability) ? homeWinProbability - marketHomeProbability : null;
  const totalEdge = Number.isFinite(odds?.overUnder) ? projectedTotal - odds.overUnder : null;
  const reasonCandidates = [
    { label: "Top-six scoring", value: Math.abs(forwardGap) },
    { label: "Blue-line suppression", value: Math.abs(defenseGap) },
    { label: "Goalie edge", value: Math.abs(goalieGap) },
    { label: "Special teams", value: Math.abs(specialGap) },
    { label: "Recent form", value: Math.abs(recentGap) },
  ]
    .sort((left, right) => right.value - left.value)
    .slice(0, 3)
    .map((entry) => entry.label);

  return {
    homeTeamId,
    awayTeamId,
    homeWinProbability,
    awayWinProbability: 1 - homeWinProbability,
    homeGoals,
    awayGoals,
    projectedTotal,
    projectedMargin,
    homeMoneyline,
    awayMoneyline,
    marketEdge,
    totalEdge,
    odds,
    reasoning: reasonCandidates,
    modelScoreLabel: `${homeRank.team.abbreviation} ${homeGoals} - ${awayRank.team.abbreviation} ${awayGoals}`,
  };
}

export function buildGameProjection(event, rankingsById = {}, summary = null) {
  const competition = event?.competitions?.[0];
  if (!competition) return null;
  const home = competition.competitors.find((team) => team.homeAway === "home");
  const away = competition.competitors.find((team) => team.homeAway === "away");
  if (!home || !away) return null;
  return buildTeamMatchupProjection(home.team.id, away.team.id, rankingsById, event, summary);
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
    .sort((left, right) => {
      const leftEdge = Number.isFinite(left.projection.marketEdge) ? Math.abs(left.projection.marketEdge) : Math.abs(left.projection.homeWinProbability - 0.5);
      const rightEdge = Number.isFinite(right.projection.marketEdge) ? Math.abs(right.projection.marketEdge) : Math.abs(right.projection.homeWinProbability - 0.5);
      return rightEdge - leftEdge;
    });
}

export function buildFeaturedPlayers(leaderEntries = [], teamsById = {}, advancedSnapshot = null, rosters = {}, standingsEntries = []) {
  if (advancedSnapshot) {
    const liveBoard = buildPlayerDirectory(advancedSnapshot, rosters, teamsById, standingsEntries);
    if (liveBoard.length) {
      return liveBoard.slice(0, 30);
    }
  }

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
    };
    const weight = categoryWeights[entry.category] || 6;
    current.provisionalScore += Math.max(0, 18 - entry.rank) * weight;
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
      resolvedPosition: normalizeNhlPosition(player.resolvedPosition || "W"),
      featured: player.featured.sort((a, b) => a.rank - b.rank).slice(0, 3),
      provisionalOvr: clamp(round(58 + player.provisionalScore / 18, 0), 55, 94),
      overall: clamp(round(58 + player.provisionalScore / 18, 0), 55, 94),
      headshot: player.headshot || resolveNhlHeadshot(player.playerId),
      tone: { label: "Steady", className: "tone-steady" },
      statLine: {},
    }))
    .sort((a, b) => b.provisionalOvr - a.provisionalOvr);
}

function mapStats(payload) {
  return flattenStatsCategories(payload);
}

function fallbackPlayerOverall(profile, seasonStats, careerStats, resolvedPosition) {
  const gp = Math.max(1, Number(seasonStats.games?.value || 0));
  const seasonPointsPerGame = Number(seasonStats.points?.value || 0) / gp;
  const seasonGoalsPerGame = Number(seasonStats.goals?.value || 0) / gp;
  const seasonAssistsPerGame = Number(seasonStats.assists?.value || 0) / gp;
  const shootingPct = Number(seasonStats.shootingPct?.value || 0);
  const savePct = Number(seasonStats.savePct?.value || 0);
  const gaa = Number(seasonStats.avgGoalsAgainst?.value || 0);
  const careerGp = Math.max(1, Number(careerStats.games?.value || 0));
  const careerPointsPerGame = Number(careerStats.points?.value || 0) / careerGp;

  if (resolvedPosition === "G") {
    const raw = 62 + ((savePct - 0.87) * 160) + ((3.4 - gaa) * 7.5);
    return clamp(round(raw, 1), 60, 98);
  }

  let raw = 64 + (seasonPointsPerGame * 16) + (seasonGoalsPerGame * 12) + (seasonAssistsPerGame * 8) + (shootingPct * 0.18);
  raw += clamp((seasonPointsPerGame - careerPointsPerGame) * 6, -2.5, 2.5);
  if (resolvedPosition === "C") raw += clamp(((Number(seasonStats.faceoffPercent?.value || 50) - 50) * 0.08), -2, 2);
  return clamp(round(raw, 1), 60, 98);
}

export function buildPlayerCard(bundle, teamsById = {}, context = {}) {
  const profile = bundle?.profile || {};
  const seasonStats = mapStats(bundle?.seasonStats);
  const careerStats = mapStats(bundle?.careerStats);
  const playerId = String(profile.id || bundle.playerId || "");
  const teamId = extractIdFromRef(profile.team?.$ref) || context.playerDirectoryById?.[playerId]?.teamId || null;
  const team = teamsById[teamId] || context.playerDirectoryById?.[playerId]?.team || null;
  const resolvedPosition = normalizeNhlPosition(
    context.playerDirectoryById?.[playerId]?.resolvedPosition ||
    profile.position?.abbreviation ||
    profile.position?.name ||
    "W",
  );
  const existing = context.playerDirectoryById?.[playerId] || null;
  const overall = existing?.overall ?? fallbackPlayerOverall(profile, seasonStats, careerStats, resolvedPosition);
  const games = Number(seasonStats.games?.value || 0);
  const seasonPpg = Number(seasonStats.points?.value || 0) / Math.max(1, games);
  const careerGames = Number(careerStats.games?.value || 0);
  const careerPpg = Number(careerStats.points?.value || 0) / Math.max(1, careerGames);
  const hotnessScore = existing?.hotnessScore || clamp(Math.round(seasonPpg >= careerPpg ? 4 : 3), 1, 5);
  const tone = existing?.tone || (hotnessScore >= 4
    ? { label: "Hot", className: "tone-hot" }
    : { label: "Steady", className: "tone-steady" });

  return {
    playerId,
    fullName: profile.fullName || existing?.fullName || "Unknown Player",
    shortName: profile.shortName || existing?.shortName || profile.fullName || "Player",
    jersey: profile.jersey || existing?.jersey || "--",
    age: Number(profile.age || existing?.age || 0),
    position: resolvedPosition,
    resolvedPosition,
    team,
    headshot:
      profile.headshot?.href ||
      existing?.headshot ||
      resolveNhlHeadshot(playerId, team?.abbreviation || ""),
    teamId,
    overall,
    overallPercentile: existing?.overallPercentile || null,
    hotnessScore,
    tone,
    sampleTrust: existing?.reliability ?? clamp(games / 25, 0.35, 1),
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
    modelReasons: existing?.modelReasons || [],
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
      value: players?.[0] ? `${players[0].team?.abbreviation || "NHL"} ${players[0].overall}` : "--",
      foot: players?.[0]?.resolvedPosition || "Waiting for player board",
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

export function buildTeamNewsMap(news = [], teams = []) {
  const normalizedNews = news.map((story) => ({
    ...story,
    haystack: `${story.headline || ""} ${story.description || ""} ${story.summary || ""}`.toLowerCase(),
  }));

  return Object.fromEntries(
    teams.map((team) => {
      const keywords = [
        team.displayName,
        `${team.location || ""} ${team.name || ""}`.trim(),
        team.location,
        team.name,
        team.abbreviation,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      const matches = normalizedNews
        .filter((story) => keywords.some((keyword) => story.haystack.includes(keyword)))
        .slice(0, 4)
        .map(({ haystack, ...story }) => story);

      return [String(team.id), matches];
    }),
  );
}

export function buildFilteredSearchIndex(teams = [], rosters = {}, playerDirectory = []) {
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
            title: player.fullName || player.displayName || "Player",
            subtitle: `${normalizeNhlPosition(player.position?.abbreviation || player.position?.name || "W")} • ${player.jersey ? `#${player.jersey}` : "NHL"}`,
          })),
        ),
      ),
      ...playerDirectory.map((player) => ({
        id: player.playerId,
        type: "player",
        title: player.fullName || player.shortName || player.playerId,
        subtitle: `${player.team?.abbreviation || "NHL"} • ${player.resolvedPosition} • ${player.overall} OVR`,
      })),
    ],
    (entry) => `${entry.type}:${entry.id}`,
  );

  return [...teamResults, ...playerResults];
}

export function explainTeamSignals(team = null) {
  if (!team) return [];
  return buildTeamPredictionSignals(team);
}
