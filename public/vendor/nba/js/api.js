/* ============================================================
   API — ESPN Data Fetching Layer
   Handles all ESPN public API calls with error handling
   ============================================================ */
const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const INTERNAL_API_BASE = '/api/nba';

const api = {
    async fetchBootstrap(force = false) {
        try {
            const response = await fetch(`${INTERNAL_API_BASE}/bootstrap${force ? '?force=1' : ''}`, {
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`Bootstrap failed: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch NBA bootstrap snapshot:', error);
            return null;
        }
    },

    async fetchScoreboard() {
        try {
            const response = await fetch(`${API_BASE}/scoreboard`);
            const data = await response.json();
            return data.events || [];
        } catch (error) {
            console.error('Failed to fetch scoreboard:', error);
            return [];
        }
    },

    async fetchNews() {
        try {
            const response = await fetch(`${INTERNAL_API_BASE}/news`, { cache: 'no-store' });
            const data = await response.json();
            return data.articles || [];
        } catch (error) {
            console.error('Failed to fetch NBA news:', error);
            return [];
        }
    },

    async fetchNewsStory(storyId, apiHref = '') {
        try {
            const response = await fetch(`${INTERNAL_API_BASE}/news/${storyId}${apiHref ? `?apiHref=${encodeURIComponent(apiHref)}` : ''}`, {
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`Story failed: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Failed to fetch NBA story ${storyId}:`, error);
            return null;
        }
    },

    async fetchTeams() {
        try {
            const response = await fetch(`${API_BASE}/teams?limit=30`);
            const data = await response.json();
            const teams = data.sports[0].leagues[0].teams.map(t => t.team);
            return teams;
        } catch (error) {
            console.error('Failed to fetch teams:', error);
            return [];
        }
    },

    async fetchTeamStats(teamId) {
        try {
            const response = await fetch(`${API_BASE}/teams/${teamId}`);
            const data = await response.json();
            return data.team;
        } catch (error) {
            console.error(`Failed to fetch stats for team ${teamId}:`, error);
            return null;
        }
    },

    /**
     * Fetch team roster. ESPN groups athletes by position.
     */
    async fetchTeamRoster(teamId) {
        try {
            const response = await fetch(`${API_BASE}/teams/${teamId}/roster`);
            const data = await response.json();

            let coachName = 'N/A';
            if (data.coach && data.coach.length > 0) {
                coachName = `${data.coach[0].firstName} ${data.coach[0].lastName}`;
            }

            let allAthletes = [];
            if (Array.isArray(data.athletes)) {
                data.athletes.forEach(group => {
                    if (group && Array.isArray(group.items)) {
                        group.items.forEach(athlete => {
                            if (!athlete.position && group.position) {
                                athlete.position = { name: group.position, abbreviation: group.position.charAt(0) };
                            }
                            allAthletes.push(athlete);
                        });
                    } else if (group && group.id) {
                        allAthletes.push(group);
                    }
                });
            }

            return { athletes: allAthletes, coach: coachName };
        } catch (error) {
            console.error(`Failed to fetch roster for team ${teamId}:`, error);
            return { athletes: [], coach: 'N/A' };
        }
    },

    /**
     * Helper to get the correct NBA season year.
     * Often ESPN's core API 404s for the 'future' year during the transition.
     */
    getSeasonYear() {
        const d = new Date();
        const year = d.getFullYear();
        // If we are in Jan-Sept, it's the current year's season. 
        // If Oct-Dec, it's the next year's.
        return d.getMonth() >= 9 ? year + 1 : year;
    },

    getEntryGamesPlayed(category, entry) {
        if (!category || !entry) return 0;
        const mapped = this.mapCategoryValues(category, entry?.stats);
        return Number(mapped.gamesPlayed ?? mapped.gp ?? 0);
    },

    pickSeasonEntry(statistics = [], seasonYear = this.getSeasonYear(), category = null) {
        if (!Array.isArray(statistics) || statistics.length === 0) return null;
        const exactSeason = statistics.filter((entry) => Number(entry?.season?.year) === Number(seasonYear));
        const exactWithGames = exactSeason.find((entry) => this.getEntryGamesPlayed(category, entry) > 0);
        if (exactWithGames) return exactWithGames;
        if (exactSeason.length) return exactSeason[0];

        const sampled = statistics.filter((entry) => this.getEntryGamesPlayed(category, entry) > 0);
        return sampled[sampled.length - 1] || statistics[statistics.length - 1] || null;
    },

    pickPreviousSeasonEntry(statistics = [], seasonYear = this.getSeasonYear(), category = null) {
        if (!Array.isArray(statistics) || statistics.length === 0) return null;
        const previous = statistics.filter((entry) => Number(entry?.season?.year) < Number(seasonYear));
        const sampled = previous.filter((entry) => this.getEntryGamesPlayed(category, entry) > 0);
        return sampled[sampled.length - 1] || (previous.length ? previous[previous.length - 1] : null);
    },

    assignMappedStat(target, name, rawValue) {
        if (!target || !name || rawValue == null) return;

        const nameParts = String(name).split('-');
        const valueParts = String(rawValue).split('-');

        if (nameParts.length > 1 && nameParts.length === valueParts.length) {
            nameParts.forEach((part, idx) => {
                const parsed = parseFloat(valueParts[idx]);
                if (Number.isFinite(parsed)) {
                    target[part] = parsed;
                }
            });
            return;
        }

        const parsed = parseFloat(rawValue);
        if (Number.isFinite(parsed)) {
            target[name] = parsed;
        }
    },

    mapCategoryValues(category, values) {
        const mapped = {};
        const names = category?.names || [];
        const rawValues = Array.isArray(values) ? values : [];

        names.forEach((name, idx) => {
            this.assignMappedStat(mapped, name, rawValues[idx]);
        });

        return mapped;
    },

    normalizePercent(value) {
        if (!Number.isFinite(value) || value <= 0) return 0;
        return value <= 1.5 ? value * 100 : value;
    },

    /**
     * Fetch FULL player stats from the high-reliability Site API.
     * Uses the /stats endpoint to get the complete dictionary of metrics.
     */
    async fetchPlayerStats(playerId) {
        try {
            const url = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${playerId}/stats`;
            const statsRes = await fetch(url);
            if (!statsRes.ok) return null;

            const data = await statsRes.json();
            const categories = data.categories || [];

            const seasonYear = this.getSeasonYear();
            const nameMap = {};
            const careerMap = {};
            const lastSeasonMap = {};
            let resolvedSeasonEntry = null;

            categories.forEach((cat) => {
                const currentSeasonEntry = this.pickSeasonEntry(cat.statistics, seasonYear, cat);
                const previousSeasonEntry = this.pickPreviousSeasonEntry(cat.statistics, seasonYear, cat);

                if (!resolvedSeasonEntry && currentSeasonEntry?.season) {
                    resolvedSeasonEntry = currentSeasonEntry;
                }

                Object.assign(nameMap, this.mapCategoryValues(cat, currentSeasonEntry?.stats));
                Object.assign(careerMap, this.mapCategoryValues(cat, cat?.totals));

                if (previousSeasonEntry?.stats) {
                    Object.assign(lastSeasonMap, this.mapCategoryValues(cat, previousSeasonEntry.stats));
                }
            });

            // Failsafe for missing keys
            const getStat = (keys) => {
                for (let k of keys) {
                    if (nameMap[k] !== undefined) return nameMap[k];
                }
                return 0;
            };

            const ppg = getStat(['avgPoints', 'points', 'avgPts']);
            if (ppg === 0 && !nameMap['gamesPlayed']) return null;

            const apg = getStat(['avgAssists', 'assists', 'avgAst']);
            const tovPg = getStat(['avgTurnovers', 'turnovers', 'avgTov']);
            const spg = getStat(['avgSteals', 'steals', 'avgStl']);
            const bpg = getStat(['avgBlocks', 'blocks', 'avgBlk']);
            const mpg = getStat(['avgMinutes', 'minutes', 'mpg']);
            const rpg = getStat(['avgRebounds', 'rebounds', 'avgReb']);
            const gp = getStat(['gamesPlayed', 'gp']);
            const gs = getStat(['gamesStarted', 'gs']);

            const fgm = getStat(['avgFieldGoalsMade', 'fieldGoalsMade']);
            const fga = getStat(['avgFieldGoalsAttempted', 'fieldGoalsAttempted', 'fga']);
            const threePm = getStat(['avgThreePointFieldGoalsMade', 'threePointFieldGoalsMade']);
            const threePa = getStat(['avgThreePointFieldGoalsAttempted', 'threePointFieldGoalsAttempted', 'threePA']);
            const ftm = getStat(['avgFreeThrowsMade', 'freeThrowsMade']);
            const fta = getStat(['avgFreeThrowsAttempted', 'freeThrowsAttempted', 'fta']);

            const fgPct = this.normalizePercent(getStat(['fieldGoalPct', 'fg%'])) || (fga > 0 ? (fgm / fga) * 100 : 0);
            const threePct = this.normalizePercent(getStat(['threePointFieldGoalPct', 'threePointPct', '3p%'])) || (threePa > 0 ? (threePm / threePa) * 100 : 0);
            const ftPct = this.normalizePercent(getStat(['freeThrowPct', 'ft%'])) || (fta > 0 ? (ftm / fta) * 100 : 0);
            const efgPct = this.normalizePercent(getStat(['effectiveFGPct', 'efg%'])) ||
                this.normalizePercent(nameMap['shootingEfficiency']) ||
                (fga > 0 ? ((fgm + 0.5 * threePm) / fga) * 100 : 0);
            const tsPct = this.normalizePercent(getStat(['trueShootingPct', 'ts%'])) ||
                (fga + (0.44 * fta) > 0 ? (ppg / (2 * (fga + (0.44 * fta)))) * 100 : 55);

            const usageApprox = Math.max(12, Math.min(38, ((fga + (0.44 * fta) + tovPg) / Math.max(mpg, 1)) * 18));
            const perApprox = Math.max(
                8,
                Math.min(
                    34,
                    11 +
                    (ppg * 0.32) +
                    (rpg * 0.35) +
                    (apg * 0.60) +
                    (spg * 1.80) +
                    (bpg * 1.70) -
                    (tovPg * 0.90) -
                    ((getStat(['avgFouls', 'fouls']) || 0) * 0.25)
                )
            );
            const vorpApprox = Math.max(-0.5, Math.min(6, ((ppg - 10) * 0.05) + (apg * 0.11) + (rpg * 0.06) + ((spg + bpg) * 0.45) + ((tsPct - 55) * 0.03)));

            const buildBaseline = (sourceMap) => {
                const baselineGet = (keys) => {
                    for (const key of keys) {
                        if (sourceMap[key] !== undefined) return sourceMap[key];
                    }
                    return 0;
                };

                const basePpg = baselineGet(['avgPoints', 'points', 'avgPts']);
                const baseFga = baselineGet(['avgFieldGoalsAttempted', 'fieldGoalsAttempted', 'fga']);
                const baseFta = baselineGet(['avgFreeThrowsAttempted', 'freeThrowsAttempted', 'fta']);
                const baseFgm = baselineGet(['avgFieldGoalsMade', 'fieldGoalsMade']);
                const baseThreePm = baselineGet(['avgThreePointFieldGoalsMade', 'threePointFieldGoalsMade']);
                const baseThreePa = baselineGet(['avgThreePointFieldGoalsAttempted', 'threePointFieldGoalsAttempted', 'threePA']);

                return {
                    ppg: basePpg,
                    rpg: baselineGet(['avgRebounds', 'rebounds', 'avgReb']),
                    apg: baselineGet(['avgAssists', 'assists', 'avgAst']),
                    spg: baselineGet(['avgSteals', 'steals', 'avgStl']),
                    bpg: baselineGet(['avgBlocks', 'blocks', 'avgBlk']),
                    gp: baselineGet(['gamesPlayed', 'gp']),
                    fgPct: this.normalizePercent(baselineGet(['fieldGoalPct', 'fg%'])) || (baseFga > 0 ? (baseFgm / baseFga) * 100 : 0),
                    threePct: this.normalizePercent(baselineGet(['threePointFieldGoalPct', 'threePointPct', '3p%'])) || (baseThreePa > 0 ? (baseThreePm / baseThreePa) * 100 : 0),
                    ftPct: this.normalizePercent(baselineGet(['freeThrowPct', 'ft%'])),
                    astTovRatio: baselineGet(['assistTurnoverRatio']) || 0,
                    shootingEfficiency: this.normalizePercent(baselineGet(['shootingEfficiency'])),
                    tsPct: this.normalizePercent(baselineGet(['trueShootingPct', 'ts%'])) ||
                        (baseFga + (0.44 * baseFta) > 0 ? (basePpg / (2 * (baseFga + (0.44 * baseFta)))) * 100 : 0),
                };
            };

            const career = buildBaseline(careerMap);
            const lastSeason = buildBaseline(lastSeasonMap);

            // Build the EXACT object models.js expects
            return {
                ppg: ppg,
                rpg: rpg,
                apg: apg,
                spg: spg,
                bpg: bpg,
                tovPg: tovPg,
                foulsPg: getStat(['avgFouls', 'fouls']),
                mpg: mpg,
                gp: gp,
                gs: gs,
                
                // Efficiency (Must match models.js keys exactly)
                fgPct: fgPct,
                threePct: threePct, // models.js uses 'threePct'
                ftPct: ftPct,
                efgPct: efgPct || 50,
                tsPct: tsPct || 55,
                
                // Volume
                fga: fga,
                fta: fta,
                fgm: fgm,
                ftm: ftm,
                threePm: threePm,
                threePa: threePa,

                // Advanced / Derived
                per: getStat(['PER', 'per']) || perApprox,
                usage: getStat(['usageRate', 'usage']) || usageApprox,
                vorp: getStat(['VORP', 'vorp']) || vorpApprox,
                plusMinus: getStat(['plusMinus', 'avgPlusMinus']),
                assistRatio: getStat(['assistRatio']),
                astTovRatio: nameMap['assistTurnoverRatio'] || (apg / (tovPg || 0.1)),
                defRebPg: getStat(['avgDefensiveRebounds', 'defensiveRebounds']),
                stl48: nameMap['avg48Steals'] || (spg / (mpg || 30) * 48),
                blk48: nameMap['avg48Blocks'] || (bpg / (mpg || 30) * 48),
                estimatedPossessions: getStat(['avgEstimatedPossessions', 'estimatedPossessions']) || (mpg * 2),
                totalMinutes: mpg * gp,
                shootingEfficiency: this.normalizePercent(nameMap['shootingEfficiency']) || efgPct || 50,
                career,
                lastSeason,
                seasonYear: Number(resolvedSeasonEntry?.season?.year || seasonYear),
                seasonLabel: resolvedSeasonEntry?.season?.displayName || `${seasonYear - 1}-${String(seasonYear).slice(-2)}`,
                statSource: 'official',
            };
        } catch (error) {
            console.warn(`[Stats] Full fetch failed for ${playerId}:`, error.message);
            return null;
        }
    },

    /**
     * Fetch detailed team statistics from ESPN Core API.
     * Returns offensive/defensive/general team-level stats.
     */
    async fetchTeamStatistics(teamId) {
        try {
            let seasonYear = this.getSeasonYear();

            let res = await fetch(
                `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${seasonYear}/types/2/teams/${teamId}/statistics`
            );

            if (!res.ok) {
                seasonYear--;
                res = await fetch(
                    `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${seasonYear}/types/2/teams/${teamId}/statistics`
                );
            }

            if (!res.ok) return null;

            const data = await res.json();
            const categories = data.splits?.categories || [];

            let nameMap = {};
            categories.forEach(cat => {
                if (cat.stats && Array.isArray(cat.stats)) {
                    cat.stats.forEach(s => {
                        nameMap[s.name] = parseFloat(s.value) || 0;
                    });
                }
            });

            return {
                ppg: nameMap['avgPoints'] || 0,
                rpg: nameMap['avgRebounds'] || 0,
                apg: nameMap['avgAssists'] || 0,
                spg: nameMap['avgSteals'] || 0,
                bpg: nameMap['avgBlocks'] || 0,
                tovPg: nameMap['avgTurnovers'] || 0,
                fgPct: nameMap['fieldGoalPct'] || 0,
                threePct: nameMap['threePointPct'] || nameMap['threePointFieldGoalPct'] || 0,
                ftPct: nameMap['freeThrowPct'] || 0,
                efgPct: nameMap['effectiveFGPct'] || nameMap['shootingEfficiency'] || 0,
                twoPtPct: nameMap['twoPointFieldGoalPct'] || 0,
                fta: nameMap['avgFreeThrowsAttempted'] || 0,
                threePA: nameMap['avgThreePointFieldGoalsAttempted'] || 0,
                offRebPg: nameMap['avgOffensiveRebounds'] || 0,
                defRebPg: nameMap['avgDefensiveRebounds'] || 0,
                gp: nameMap['gamesPlayed'] || 0,
                pace: nameMap['paceFactor'] || nameMap['avgEstimatedPossessions'] || 98,
                estimatedPossessions: nameMap['avgEstimatedPossessions'] || nameMap['estimatedPossessions'] || 98,
                assistTurnoverRatio: nameMap['assistTurnoverRatio'] || nameMap['teamAssistTurnoverRatio'] || 1.7,
                turnoverRatio: nameMap['turnoverRatio'] || 13,
                reboundRate: nameMap['reboundRate'] || 50,
                trueShootingPct: this.normalizePercent(nameMap['trueShootingPct']) || 57,
                shootingEfficiency: this.normalizePercent(nameMap['shootingEfficiency']) || 53,
                scoringEfficiency: nameMap['scoringEfficiency'] || 1.25,
                offensiveEfficiency: (nameMap['pointsPerEstimatedPossessions'] || 1.12) * 100,
                avgEstimatedPossessions: nameMap['avgEstimatedPossessions'] || 98,
            };
        } catch (error) {
            console.error(`Failed to fetch team statistics for ${teamId}:`, error);
            return null;
        }
    },

    /**
     * Fetch game summary/boxscore from ESPN.
     */
    async fetchGameSummary(gameId) {
        try {
            const response = await fetch(`${API_BASE}/summary?event=${gameId}`);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error(`Failed to fetch game summary for ${gameId}:`, error);
            return null;
        }
    },

    /**
     * Fetch player stats in PARALLEL BATCHES of 6.
     */
    async fetchPlayerStatsParallel(playerEntries, onProgress, onBatchComplete) {
        const results = {};
        let fetched = 0;
        const DELAY = 100; // 100ms between players = stable

        for (const entry of playerEntries) {
            try {
                const stats = await this.fetchPlayerStats(entry.id);
                if (stats) {
                    const res = { [entry.id]: { stats, teamId: entry.teamId } };
                    results[entry.id] = res[entry.id];
                    if (onBatchComplete) onBatchComplete(res);
                }
            } catch (error) {
                console.warn(`[API] Failed to fetch stats for ${entry.id}:`, error);
            }

            fetched++;
            if (onProgress) onProgress(fetched, playerEntries.length);
            
            // Throttle to avoid ESPN 403
            await new Promise(r => setTimeout(r, DELAY));
        }

        return results;
    },

    /**
     * Fetch the schedule for a specific team (last 5 games)
     */
    async fetchTeamSchedule(teamId) {
        try {
            let seasonYear = this.getSeasonYear();

            // Using ESPN's team events endpoint
            let res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule?season=${seasonYear}`);
            
            if (!res.ok) {
                seasonYear--;
                res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule?season=${seasonYear}`);
            }

            if (!res.ok) return [];

            const data = await res.json();
            if (!data.events) return [];

            // Filter for completed games
            const completedEvents = data.events.filter(e => e.competitions[0].status.type.completed);

            // Return the 5 most recent completed games
            return completedEvents.slice(-5).reverse(); // Reverse so most recent is first
        } catch (error) {
            console.error(`[API] Error fetching schedule for team ${teamId}:`, error);
            return [];
        }
    }
};

window.api = api;
