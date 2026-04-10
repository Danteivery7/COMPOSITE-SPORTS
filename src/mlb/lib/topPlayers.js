import { ALL_TEAMS } from '@/src/mlb/lib/teams';
import { fetchTeamRoster, fetchBatchPlayerStats } from '@/src/mlb/lib/espn';
import { computePlayerRating } from '@/src/mlb/lib/players';
import { cacheGet, cacheSet, CACHE_TTL } from '@/src/mlb/lib/cache';

const TOP_PLAYERS_CACHE_KEY = 'top_50_players_v2';
const TOP_PLAYERS_STALE_KEY = 'top_50_players_stale_v2';

function mapMlbPitchingSplit(raw = {}) {
    return {
        ERA: parseFloat(raw.era) || 0,
        earnedRunAverage: parseFloat(raw.era) || 0,
        IP: parseFloat(raw.inningsPitched) || 0,
        innings: parseFloat(raw.inningsPitched) || 0,
        inningsPitched: parseFloat(raw.inningsPitched) || 0,
        K: parseInt(raw.strikeOuts) || 0,
        SO: parseInt(raw.strikeOuts) || 0,
        strikeouts: parseInt(raw.strikeOuts) || 0,
        WHIP: parseFloat(raw.whip) || 0,
        wins: parseInt(raw.wins) || 0,
        W: parseInt(raw.wins) || 0,
        losses: parseInt(raw.losses) || 0,
        L: parseInt(raw.losses) || 0,
        walks: parseInt(raw.baseOnBalls) || 0,
        BB: parseInt(raw.baseOnBalls) || 0,
        homeRuns: parseInt(raw.homeRuns) || 0,
        HR: parseInt(raw.homeRuns) || 0,
        gamesPlayed: parseInt(raw.gamesPlayed) || 0,
        GP: parseInt(raw.gamesPlayed) || 0,
        gamesStarted: parseInt(raw.gamesStarted) || 0,
        GS: parseInt(raw.gamesStarted) || 0,
        strikeoutsPerNineInnings: parseFloat(raw.strikeoutsPer9Inn) || 0,
        'K/9': parseFloat(raw.strikeoutsPer9Inn) || 0,
        winPct: parseFloat(raw.winPercentage) || 0,
        'W%': parseFloat(raw.winPercentage) || 0,
        hits: parseInt(raw.hits) || 0,
        H: parseInt(raw.hits) || 0,
    };
}

function mapMlbBattingSplit(raw = {}) {
    return {
        AVG: parseFloat(raw.avg) || 0,
        avg: parseFloat(raw.avg) || 0,
        SLG: parseFloat(raw.slg) || 0,
        slugAvg: parseFloat(raw.slg) || 0,
        OBP: parseFloat(raw.obp) || 0,
        onBasePct: parseFloat(raw.obp) || 0,
        OPS: parseFloat(raw.ops) || 0,
        ops: parseFloat(raw.ops) || 0,
        HR: parseInt(raw.homeRuns) || 0,
        homeRuns: parseInt(raw.homeRuns) || 0,
        GP: parseInt(raw.gamesPlayed) || 0,
        gamesPlayed: parseInt(raw.gamesPlayed) || 0,
        RBIs: parseInt(raw.rbi) || 0,
        RBI: parseInt(raw.rbi) || 0,
        hits: parseInt(raw.hits) || 0,
        H: parseInt(raw.hits) || 0,
        runs: parseInt(raw.runs) || 0,
        R: parseInt(raw.runs) || 0,
        walks: parseInt(raw.baseOnBalls) || 0,
        BB: parseInt(raw.baseOnBalls) || 0,
        stolenBases: parseInt(raw.stolenBases) || 0,
        SB: parseInt(raw.stolenBases) || 0,
        strikeouts: parseInt(raw.strikeOuts) || 0,
        SO: parseInt(raw.strikeOuts) || 0,
    };
}

async function fetchJSON(url) {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'MLBRankings/1.0' } });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

async function hydrateOhtaniTwoWayStats(player, stats) {
    if (String(player?.id) !== '39832') return stats;
    try {
        const searchRes = await fetchJSON(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(player.name)}`);
        const mlbId = searchRes?.people?.[0]?.id;
        if (!mlbId) return stats;
        const mlbStats = await fetchJSON(`https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=career,season&group=hitting,pitching`);
        const statBlocks = mlbStats?.stats || [];
        const merged = {
            batting: { ...(stats?.batting || {}) },
            pitching: { ...(stats?.pitching || {}) },
            career: {
                batting: { ...(stats?.career?.batting || {}) },
                pitching: { ...(stats?.career?.pitching || {}) },
            },
        };

        for (const block of statBlocks) {
            const isPitchBlock = block.group?.displayName === 'pitching';
            const isCareer = block.type?.displayName === 'career';
            const isSeason = block.type?.displayName === 'season';
            const raw = block.splits?.[0]?.stat || {};
            if (isCareer) {
                if (isPitchBlock) merged.career.pitching = { ...merged.career.pitching, ...mapMlbPitchingSplit(raw) };
                else merged.career.batting = { ...merged.career.batting, ...mapMlbBattingSplit(raw) };
            }
            if (isSeason) {
                if (isPitchBlock) merged.pitching = { ...merged.pitching, ...mapMlbPitchingSplit(raw) };
                else merged.batting = { ...merged.batting, ...mapMlbBattingSplit(raw) };
            }
        }

        return merged;
    } catch {
        return stats;
    }
}

export async function computeTopPlayers(limit = 50) {
    const cacheKey = limit === 50 ? TOP_PLAYERS_CACHE_KEY : `${TOP_PLAYERS_CACHE_KEY}_${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const allPlayers = [];

    await Promise.all(ALL_TEAMS.map(async (team) => {
        try {
            const roster = await fetchTeamRoster(team.espnId);
            for (const player of roster.players || []) {
                const existing = allPlayers.find((entry) => entry.id === player.id);
                if (existing) {
                    if (!existing.position.includes(player.position)) {
                        existing.position = `${existing.position}/${player.position}`;
                    }
                    if (player.isPitcher) existing.isPitcher = true;
                    existing.isTwoWay = true;
                    continue;
                }

                allPlayers.push({
                    ...player,
                    teamId: team.id,
                    teamName: team.name,
                    teamAbbr: team.abbr,
                    teamCity: team.city,
                    teamColor: team.color,
                    teamLogo: `https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${team.abbr.toLowerCase()}.png`,
                });
            }
        } catch (error) {
            console.error(`Roster fetch failed for ${team.id}:`, error.message);
        }
    }));

    const statsMap = await fetchBatchPlayerStats(allPlayers.map((player) => player.id), 50);
    const ratedPlayers = await Promise.all(allPlayers.map(async (player) => {
        const baseStats = statsMap[player.id] || { batting: {}, pitching: {}, career: { batting: {}, pitching: {} } };
        const isOhtani = String(player.id) === '39832';
        const stats = isOhtani ? await hydrateOhtaniTwoWayStats(player, baseStats) : baseStats;
        const careerRaw = stats.career || { batting: {}, pitching: {} };
        const isRosterTwoWay = (player.position === 'SP/DH' || player.position === 'DH/SP') && isOhtani;
        const ratingData = computePlayerRating(
            stats,
            isRosterTwoWay ? 'two-way' : player.isPitcher,
            player.position,
            player.id,
            careerRaw,
            player.age
        );

        return {
            ...player,
            rating: isOhtani ? 99 : ratingData.rating,
            ratingType: ratingData.type,
            isTwoWay: ratingData.type === 'two-way' || isRosterTwoWay,
        };
    }));

    ratedPlayers.sort((a, b) => b.rating - a.rating);
    const players = ratedPlayers.slice(0, limit).map((player, index) => ({
        ...player,
        rank: index + 1,
    }));

    const result = {
        players,
        totalPlayers: ratedPlayers.length,
        lastUpdated: new Date().toISOString(),
    };

    cacheSet(cacheKey, result, CACHE_TTL.PLAYERS_TOP);
    if (limit === 50) {
        cacheSet(TOP_PLAYERS_STALE_KEY, result, 3600);
    }

    return result;
}

export function getCachedTopPlayers(limit = 50) {
    const cacheKey = limit === 50 ? TOP_PLAYERS_CACHE_KEY : `${TOP_PLAYERS_CACHE_KEY}_${limit}`;
    return cacheGet(cacheKey);
}

export function getStaleTopPlayers() {
    return cacheGet(TOP_PLAYERS_STALE_KEY);
}
