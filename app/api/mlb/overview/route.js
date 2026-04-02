import { fetchScoreboard } from '@/src/mlb/lib/espn';
import { fetchMLBNews } from '@/src/mlb/lib/news';
import { computeTopPlayers, getCachedTopPlayers, getStaleTopPlayers } from '@/src/mlb/lib/topPlayers';
import { computeRankings } from '@/src/mlb/lib/rankings';
import { predict } from '@/src/mlb/lib/predictor';
import { cacheGet, cacheSet, CACHE_TTL } from '@/src/mlb/lib/cache';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const OVERVIEW_CACHE_KEY = 'mlb_overview_v1';
const OVERVIEW_STALE_KEY = 'mlb_overview_stale_v1';
let isRefreshingOverview = false;

function getGamePriority(game) {
    const now = Date.now();
    const start = game.startTime ? new Date(game.startTime).getTime() : null;
    const minsUntil = start ? (start - now) / 60000 : null;

    if (game.state === 'in') return 0;
    if (game.state === 'pre') {
        if (minsUntil !== null && minsUntil <= 5 && minsUntil > 0) return 1;
        if (minsUntil !== null && minsUntil <= 30 && minsUntil > 0) return 2;
        return 3;
    }
    if (game.state === 'post') return 4;
    return 5;
}

function buildBestEdges(games) {
    return games
        .filter((game) => game.state === 'pre' && game.prediction)
        .map((game) => {
            const prediction = game.prediction;
            const awayWinPct = Number(prediction?.teamA?.winPct || 0);
            const homeWinPct = Number(prediction?.teamB?.winPct || 0);
            const awayFavored = awayWinPct >= homeWinPct;
            const lean = awayFavored ? prediction.teamA : prediction.teamB;
            const fade = awayFavored ? prediction.teamB : prediction.teamA;
            const dominance = Math.abs(awayWinPct - homeWinPct);

            return {
                gameId: game.id,
                matchup: `${game.away?.abbr || 'AWY'} @ ${game.home?.abbr || 'HME'}`,
                startTime: game.startTime || null,
                confidence: prediction.confidence || (dominance >= 18 ? 'High' : dominance >= 11 ? 'Moderate' : 'Low'),
                projectedScore: `${prediction.teamA?.abbr || game.away?.abbr} ${prediction.teamA?.projectedScore || 0} - ${prediction.teamB?.abbr || game.home?.abbr} ${prediction.teamB?.projectedScore || 0}`,
                leanTeamId: lean?.teamId || null,
                leanTeam: lean?.name || '',
                leanAbbr: lean?.abbr || '',
                fadeTeam: fade?.name || '',
                winPct: lean?.winPct || 0,
                spread: prediction.spread || 0,
                whyBullets: prediction.whyBullets || [],
                dominance,
            };
        })
        .sort((a, b) => b.dominance - a.dominance);
}

function buildPickOfTheDay(bestEdges) {
    if (!bestEdges.length) {
        return {
            hasOfficialPick: false,
            title: 'No official play',
            summary: 'No same-day MLB matchup is clearing the current confidence threshold.',
            lean: null,
        };
    }

    const strongest = bestEdges[0];
    const hasOfficialPick = strongest.confidence === 'High' || strongest.winPct >= 61;

    return {
        hasOfficialPick,
        title: hasOfficialPick ? `${strongest.leanAbbr} moneyline` : 'No official play',
        summary: hasOfficialPick
            ? `${strongest.leanTeam} is the strongest model side on today’s board at ${strongest.winPct.toFixed(1)}% with a projected ${strongest.projectedScore}.`
            : `Strongest lean is ${strongest.leanTeam} at ${strongest.winPct.toFixed(1)}%, but it stays below the official-play threshold.`,
        lean: strongest,
    };
}

async function buildOverviewPayload() {
        const [scores, news, rankingsData] = await Promise.all([
            fetchScoreboard(),
            fetchMLBNews(),
            computeRankings(),
        ]);

        let playersData = getCachedTopPlayers(50);
        if (!playersData) {
            try {
                playersData = await computeTopPlayers(50);
            } catch (error) {
                playersData = getStaleTopPlayers() || { players: [], totalPlayers: 0, lastUpdated: null };
            }
        }

        const scheduleWithPredictions = await Promise.all(
            (scores?.games || []).map(async (game) => {
                if (game.state === 'pre' && game.away?.teamId && game.home?.teamId) {
                    try {
                        const prediction = await predict(game.away.teamId, game.home.teamId, { neutralSite: false });
                        return { ...game, prediction };
                    } catch (error) {
                        return game;
                    }
                }
                return game;
            })
        );

        const todayTeamIds = new Set(
            scheduleWithPredictions.flatMap((game) => [game.away?.teamId, game.home?.teamId]).filter(Boolean)
        );

        const scoresSnapshot = [...scheduleWithPredictions]
            .sort((a, b) => getGamePriority(a) - getGamePriority(b))
            .slice(0, 6);

        const trendingPlayers = [...(playersData?.players || [])]
            .sort((a, b) => {
                const aOnSlate = todayTeamIds.has(a.teamId) ? 1 : 0;
                const bOnSlate = todayTeamIds.has(b.teamId) ? 1 : 0;
                if (aOnSlate !== bOnSlate) return bOnSlate - aOnSlate;
                return (b.rating || 0) - (a.rating || 0);
            })
            .slice(0, 8);

        const topTeams = (rankingsData?.rankings || []).slice(0, 6);
        const bestEdges = buildBestEdges(scheduleWithPredictions).slice(0, 5);
        const pickOfTheDay = buildPickOfTheDay(bestEdges);

        return {
            scores: scoresSnapshot,
            news: (news?.articles || []).slice(0, 4),
            topTeams,
            trendingPlayers,
            bestEdges,
            pickOfTheDay,
            lastUpdated: new Date().toISOString(),
        };
}

function refreshOverviewInBackground() {
    if (isRefreshingOverview) return;
    isRefreshingOverview = true;
    buildOverviewPayload()
        .then((result) => {
            cacheSet(OVERVIEW_CACHE_KEY, result, CACHE_TTL.OVERVIEW);
            cacheSet(OVERVIEW_STALE_KEY, result, CACHE_TTL.OVERVIEW * 8);
        })
        .catch((error) => {
            console.error('MLB overview background refresh error:', error);
        })
        .finally(() => {
            isRefreshingOverview = false;
        });
}

export async function GET() {
    const cached = cacheGet(OVERVIEW_CACHE_KEY);
    if (cached) {
        const age = cached.lastUpdated ? Date.now() - new Date(cached.lastUpdated).getTime() : 0;
        if (age > CACHE_TTL.OVERVIEW * 1000) {
            refreshOverviewInBackground();
        }
        return NextResponse.json(cached);
    }

    try {
        const result = await buildOverviewPayload();
        cacheSet(OVERVIEW_CACHE_KEY, result, CACHE_TTL.OVERVIEW);
        cacheSet(OVERVIEW_STALE_KEY, result, CACHE_TTL.OVERVIEW * 8);
        return NextResponse.json(result);
    } catch (error) {
        console.error('MLB overview API error:', error);
        const stale = cacheGet(OVERVIEW_STALE_KEY);
        if (stale) {
            return NextResponse.json({ ...stale, stale: true });
        }
        return NextResponse.json(
            {
                scores: [],
                news: [],
                topTeams: [],
                trendingPlayers: [],
                bestEdges: [],
                pickOfTheDay: null,
                error: error.message,
                lastUpdated: null,
            },
            { status: 500 }
        );
    }
}
