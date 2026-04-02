import { ALL_TEAMS } from '@/src/mlb/lib/teams';
import { fetchTeamRoster, fetchBatchPlayerStats } from '@/src/mlb/lib/espn';
import { computePlayerRating } from '@/src/mlb/lib/players';
import { cacheGet, cacheSet, CACHE_TTL } from '@/src/mlb/lib/cache';

const TOP_PLAYERS_CACHE_KEY = 'top_50_players';
const TOP_PLAYERS_STALE_KEY = 'top_50_players_stale';

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
    const ratedPlayers = allPlayers.map((player) => {
        const stats = statsMap[player.id] || { batting: {}, pitching: {}, career: { batting: {}, pitching: {} } };
        const careerRaw = stats.career || { batting: {}, pitching: {} };
        const isOhtani = String(player.id) === '39832';
        const isRosterTwoWay = (player.position === 'SP/DH' || player.position === 'DH/SP') && isOhtani;
        const ratingData = computePlayerRating(
            stats,
            isRosterTwoWay ? 'two-way' : (player.isPitcher || player.position === 'DH'),
            player.position,
            player.id,
            careerRaw,
            player.age
        );

        return {
            ...player,
            rating: ratingData.rating,
            ratingType: ratingData.type,
            isTwoWay: ratingData.type === 'two-way' || isRosterTwoWay,
        };
    });

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
