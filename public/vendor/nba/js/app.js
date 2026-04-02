/* ============================================================
   APP — Main Controller
   Snapshot-first architecture: hydrate from warm backend data,
   then refresh lightweight feeds in the background
   ============================================================ */
const app = {

    async init() {
        console.log('[CompositeNBA] Initializing...');

        await window.store.loadCache();
        window.ui.init();

        window.store.subscribe((key) => {
            if (key === 'games') window.ui.renderLiveGames(window.store.state.games);
            if (key === 'news') window.ui.renderNews(window.store.state.news);
            if (key === 'rankings') {
                window.ui.renderRankings(window.store.state.teamRankings);
                window.ui.renderPredictorSetup();
            }
            if (key === 'teams') window.ui.renderTeamsList(window.store.state.teams);
            if (key === 'players') window.ui.renderPlayersList(window.store.state.players);
            if (key === 'loading' && !window.store.state.cacheLoaded) {
                window.ui.renderLoadingProgress();
            }
            if (['games', 'news', 'rankings', 'teams', 'players'].includes(key)) {
                window.ui.renderOverview();
            }
        });

        if (window.store.state.cacheLoaded) {
            console.log('[CompositeNBA] Rendering cached snapshot instantly...');
            this.recomputeFromHydratedState();
            this.renderPrimarySurfaces();
        }

        await this.fetchBaseData();
        this.startLivePolling();

        setInterval(() => {
            console.log('[CompositeNBA] 5-minute backend refresh triggered...');
            this.fetchBaseData(true);
        }, 5 * 60 * 1000);

        console.log('[CompositeNBA] Boot complete.');
    },

    recomputeFromHydratedState() {
        window.models.updateAllPlayers();
        window.models.updateTeamRankings();
        this.runOfficialPlayerStatAudit();
    },

    renderPrimarySurfaces() {
        window.ui.renderLiveGames(window.store.state.games || []);
        window.ui.renderNews(window.store.state.news || []);
        window.ui.renderRankings(window.store.state.teamRankings || []);
        window.ui.renderTeamsList(window.store.state.teams || []);
        window.ui.renderPlayersList(window.store.state.players || []);
        window.ui.renderPredictorSetup();
        window.ui.renderOverview();
        window.ui.renderLastUpdated();
    },

    applyBootstrapSnapshot(snapshot) {
        if (!snapshot) return;

        window.store.hydrateSnapshot(snapshot);
        window.store.updateLoadingProgress('bootstrap', 1, 1, 'done');
        this.recomputeFromHydratedState();
        window.store.saveCache();
        this.renderPrimarySurfaces();
    },

    async fetchBaseData(force = false) {
        window.ui.setSyncing(true);
        window.store.updateLoadingProgress('bootstrap', 0, 1, 'loading');

        try {
            const snapshot = await window.api.fetchBootstrap(force);
            if (snapshot) {
                this.applyBootstrapSnapshot(snapshot);
            }
        } catch (error) {
            console.error('[CompositeNBA] Bootstrap failure:', error);
        } finally {
            window.ui.setSyncing(false);
        }
    },

    getPlayerAuditSamples(limit = 8) {
        const players = window.store.state.players || [];
        const sorted = [...players]
            .filter((player) => player?.realStats || player?.rating?.hasRealStats)
            .sort((a, b) => (b.rating?.ratingNum || 0) - (a.rating?.ratingNum || 0));

        const buckets = [
            sorted[0],
            sorted[Math.floor(sorted.length * 0.12)],
            sorted[Math.floor(sorted.length * 0.25)],
            sorted[Math.floor(sorted.length * 0.4)],
            sorted[Math.floor(sorted.length * 0.55)],
            sorted[Math.floor(sorted.length * 0.7)],
            sorted[Math.floor(sorted.length * 0.85)],
            sorted[sorted.length - 1],
        ].filter(Boolean);

        const seen = new Set();
        return buckets.filter((player) => {
            if (seen.has(player.id)) return false;
            seen.add(player.id);
            return true;
        }).slice(0, limit);
    },

    runOfficialPlayerStatAudit() {
        const samples = this.getPlayerAuditSamples();
        if (!samples.length) return;

        const auditRows = samples.map((player) => {
            const official = player.realStats || null;
            return {
                player: player.fullName || player.displayName,
                season: official?.seasonLabel || '--',
                source: official?.statSource || (player.rating?.hasRealStats ? 'official' : 'syncing'),
                ppg: official?.ppg ?? null,
                rpg: official?.rpg ?? null,
                apg: official?.apg ?? null,
                gp: official?.gp ?? null,
                rating: player.rating?.rating || '--',
            };
        });

        console.table(auditRows);
    },

    startLivePolling() {
        let pollTimer = null;

        const poll = async () => {
            try {
                const games = await window.api.fetchScoreboard();
                if (games?.length) {
                    window.store.setGames(games);
                }

                if (window.store.state.activeGameId) {
                    const summary = await window.api.fetchGameSummary(window.store.state.activeGameId);
                    if (summary) {
                        window.ui.updateGameDetailContent(summary);
                    }
                }

                const hasLive = (games || []).some((game) => game.status?.type?.state === 'in');
                const nextDelay = hasLive ? 10000 : 60000;
                clearTimeout(pollTimer);
                pollTimer = setTimeout(poll, nextDelay);
            } catch (error) {
                console.warn('[CompositeNBA] Live poll failed:', error);
                clearTimeout(pollTimer);
                pollTimer = setTimeout(poll, 60000);
            }
        };

        pollTimer = setTimeout(poll, 15000);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
