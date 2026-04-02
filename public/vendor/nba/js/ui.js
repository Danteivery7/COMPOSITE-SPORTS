/* ============================================================
   UI — Rendering Engine
   All DOM rendering, navigation, filters, and detail views
   ============================================================ */
const ui = {
    navStack: [],

    init() {
        this.bindNav();
        this.bindTheme();
        this.bindSettings();
        this.bindPlayerFilters();
        
        // Add sync indicator to the header if not present
        this.ensureSyncIndicator();

        setTimeout(() => {
            const activeTab = document.querySelector('.nav-btn.active');
            if (activeTab) activeTab.click();
        }, 500);
    },

    ensureSyncIndicator() {
        const header = document.querySelector('.header-actions');
        if (header && !document.getElementById('sync-indicator')) {
            const span = document.createElement('span');
            span.id = 'sync-indicator';
            span.innerHTML = '<span class="dot-sync"></span> Syncing';
            span.className = 'sync-indicator hidden';
            header.prepend(span);
        }
    },

    setSyncing(isSyncing) {
        const el = document.getElementById('sync-indicator');
        if (el) {
            if (isSyncing) el.classList.remove('hidden');
            else {
                el.classList.add('hidden');
                this.renderLastUpdated();
            }
        }
    },

    renderLastUpdated() {
        const playerTs = document.getElementById('player-timestamp');
        const lastSync = window.store.state.lastUpdated.players || window.store.state.lastUpdated.teams || 0;
        
        if (lastSync > 0) {
            const timeStr = new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (playerTs) playerTs.textContent = `Last Updated: ${timeStr}`;
            
            // Also show a toast or a small label in the header if desired
            console.log(`[UI] Data last updated at ${timeStr}`);
        }
    },

    // ==================== NAVIGATION ====================
    bindNav() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                if (tab) this.switchTab(tab);
            });
        });
    },

    switchTab(tabId, pushToStack = true) {
        console.log('[UI] Switching to tab:', tabId);
        
        const currentPane = document.querySelector('.pane.active')?.id?.replace('pane-', '');
        
        // If switching from main nav (manually), clear the stack
        const isMainNav = document.querySelector(`.nav-btn[data-tab="${tabId}"]`) !== null;
        if (isMainNav && pushToStack && !['player-detail', 'team-detail', 'game-detail'].includes(tabId)) {
            this.navStack = [];
        } else if (pushToStack && currentPane && currentPane !== tabId) {
            this.navStack.push(currentPane);
        }

        window.scrollTo(0, 0);

        // Clear active game detail tracking if switching away from detail
        if (tabId !== 'game-detail') window.store.state.activeGameId = null;
        if (tabId !== 'team-detail') window.store.state.activeTeamId = null;
        if (tabId !== 'player-detail') window.store.state.activePlayerId = null;

        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`.nav-btn[data-tab="${tabId}"]`).forEach(b => b.classList.add('active'));

        document.querySelectorAll('.pane').forEach(p => {
            p.classList.remove('active', 'hidden');
            p.classList.add('hidden');
        });

        const pane = document.getElementById(`pane-${tabId}`);
        if (pane) {
            pane.classList.remove('hidden');
            pane.classList.add('active');
        }

        // Trigger renders on tab switch
        if (tabId === 'overview') {
            this.renderOverview();
        } else if (tabId === 'rankings') {
            this.renderRankings(window.store.state.teamRankings);
            this.renderPredictorSetup();
        } else if (tabId === 'news') {
            this.renderNews(window.store.state.news);
        } else if (tabId === 'teams') {
            this.renderTeamsList(window.store.state.teams);
        } else if (tabId === 'players') {
            this.renderPlayersList(window.store.state.players);
        } else if (tabId === 'live') {
            this.renderLiveGames(window.store.state.games);
        } else if (tabId === 'favorites') {
            this.renderFavorites();
        }
    },

    goBack() {
        if (this.navStack.length > 0) {
            const prev = this.navStack.pop();
            this.switchTab(prev, false); // Don't push to stack when going back
        } else {
            this.switchTab('overview', false);
        }
    },

    bindTheme() {
        document.getElementById('theme-toggle').addEventListener('click', () => {
            window.store.toggleTheme();
        });

        const rankingSort = document.getElementById('ranking-sort');
        if (rankingSort) {
            rankingSort.addEventListener('change', (e) => {
                const sortBy = e.target.value;
                const rankings = [...window.store.state.teamRankings];
                if (sortBy === 'ovr') {
                    rankings.sort((a, b) => parseFloat(b.stats.ovrRating) - parseFloat(a.stats.ovrRating));
                } else if (sortBy === 'off') {
                    rankings.sort((a, b) => parseFloat(b.stats.offRating) - parseFloat(a.stats.offRating));
                } else if (sortBy === 'def') {
                    rankings.sort((a, b) => parseFloat(b.stats.defRating) - parseFloat(a.stats.defRating));
                } else if (sortBy === 'record') {
                    rankings.sort((a, b) => b.stats.winPct - a.stats.winPct);
                } else if (sortBy === 'hot') {
                    rankings.sort((a, b) => (b.stats.trendScore || 0) - (a.stats.trendScore || 0));
                }
                this.renderRankings(rankings);
            });
        }
    },

    bindSettings() {
        const presetSelect = document.getElementById('settings-preset');
        if (presetSelect) {
            presetSelect.addEventListener('change', (e) => {
                window.store.setPreset(e.target.value);
                window.models.updateTeamRankings();
            });
        }
    },

    bindPlayerFilters() {
        const posFilter = document.getElementById('player-position-filter');
        const teamFilter = document.getElementById('player-team-filter');

        if (posFilter) {
            posFilter.addEventListener('change', () => this.renderPlayersList(window.store.state.players));
        }
        if (teamFilter) {
            teamFilter.addEventListener('change', () => this.renderPlayersList(window.store.state.players));
        }
    },

    // ==================== HELPERS ====================
    formatTimestamp(ts) {
        if (!ts) return 'Never';
        return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    },

    getBadgeClass(rating) {
        const r = parseFloat(rating) || 0;
        if (r >= 88) return 'badge-elite';
        if (r >= 82) return 'badge-allstar';
        if (r >= 76) return 'badge-starter';
        if (r >= 67) return 'badge-roleplayer';
        if (r >= 55) return 'badge-bench';
        return 'badge-deepbench';
    },

    getBadgeLabel(rating) {
        const r = parseFloat(rating) || 0;
        if (r >= 88) return 'Elite';
        if (r >= 82) return 'All-Star';
        if (r >= 76) return 'Starter';
        if (r >= 67) return 'Role Player';
        if (r >= 55) return 'Bench';
        return 'Deep Bench';
    },

    formatSigned(value, digits = 1) {
        if (!Number.isFinite(value)) return '--';
        const fixed = Number(value).toFixed(digits);
        return value > 0 ? `+${fixed}` : fixed;
    },

    formatMoneyline(odds) {
        if (odds == null || odds === '') return 'No line';
        const numeric = Number(odds);
        if (!Number.isFinite(numeric)) return String(odds);
        return `${numeric > 0 ? '+' : ''}${numeric}`;
    },

    roundHalf(value) {
        if (!Number.isFinite(value)) return null;
        return Math.round(value * 2) / 2;
    },

    formatDecimal(value, digits = 1) {
        if (!Number.isFinite(value)) return '--';
        return Number(value).toFixed(digits);
    },

    getPlayerOfficialStats(player) {
        const stats = player?.realStats || null;
        if (!stats) return null;
        if (Number(stats.gp || 0) <= 0 && Number(stats.ppg || 0) <= 0) return null;
        return stats;
    },

    getPlayerStatSourceMeta(player) {
        const officialStats = this.getPlayerOfficialStats(player);
        if (officialStats) {
            return {
                isOfficial: true,
                shortLabel: officialStats.seasonLabel || 'Official season',
                longLabel: `Official ESPN ${officialStats.seasonLabel || 'season'} stats`,
            };
        }

        return {
            isOfficial: false,
            shortLabel: 'Syncing official stats',
            longLabel: 'Official ESPN season stats are still syncing for this player',
        };
    },

    formatPlayerLine(player) {
        const official = this.getPlayerOfficialStats(player);
        if (!official) {
            return '<span class="player-sync-pill">Syncing official stats</span>';
        }

        return `${this.formatDecimal(official.ppg)} pts • ${this.formatDecimal(official.rpg)} reb • ${this.formatDecimal(official.apg)} ast`;
    },

    buildPregamePropTargets(teamId, limit = 4) {
        return [...(window.store.state.players || [])]
            .filter((player) => String(player.teamId) === String(teamId))
            .sort((a, b) => (b.rating?.ratingNum || 0) - (a.rating?.ratingNum || 0))
            .slice(0, limit)
            .map((player) => {
                const projection = player.rating?.projection || null;
                const official = this.getPlayerOfficialStats(player);
                return {
                    id: player.id,
                    displayName: player.fullName || player.displayName || 'Player',
                    archetype: player.rating?.primaryArchetype || player.rating?.archetype || 'Rotation Piece',
                    headshot: player.headshot?.href || '',
                    points: projection ? this.roundHalf(projection.points) : null,
                    rebounds: projection ? this.roundHalf(projection.rebounds) : null,
                    assists: projection ? this.roundHalf(projection.assists) : null,
                    baseline:
                        official
                            ? `${this.formatDecimal(official.ppg)} / ${this.formatDecimal(official.rpg)} / ${this.formatDecimal(official.apg)} season line`
                            : 'Official season stats still syncing',
                };
            });
    },

    getToneColor(tone) {
        const label = tone?.label || tone;
        if (label === 'Sizzling') return '#10b981';
        if (label === 'Hot') return '#22c55e';
        if (label === 'Steady') return '#60a5fa';
        if (label === 'Chilly') return '#f59e0b';
        return '#ef4444';
    },

    getGameSortPriority(game, now = new Date()) {
        const state = game?.status?.type?.state || 'pre';
        const start = new Date(game?.date);
        const minsUntil = (start - now) / 60000;
        if (state === 'in') return 0;
        if (state === 'pre') {
            if (minsUntil > 0 && minsUntil <= 5) return 1;
            if (minsUntil > 0 && minsUntil <= 30) return 2;
            return 3;
        }
        if (state === 'post') return 4;
        return 5;
    },

    getFeaturedGames(limit = 5) {
        const now = new Date();
        return [...(window.store.state.games || [])]
            .sort((a, b) => {
                const priorityDiff = this.getGameSortPriority(a, now) - this.getGameSortPriority(b, now);
                if (priorityDiff !== 0) return priorityDiff;
                return new Date(a.date) - new Date(b.date);
            })
            .slice(0, limit);
    },

    getTrendingPlayers(limit = 8) {
        const slateTeamIds = new Set(
            (window.store.state.games || []).flatMap((game) => {
                const competitors = game?.competitions?.[0]?.competitors || [];
                return competitors.map((competitor) => String(competitor?.team?.id));
            }).filter(Boolean)
        );

        return [...(window.store.state.players || [])]
            .sort((a, b) => {
                const aOnSlate = slateTeamIds.has(String(a.teamId)) ? 1 : 0;
                const bOnSlate = slateTeamIds.has(String(b.teamId)) ? 1 : 0;
                if (aOnSlate !== bOnSlate) return bOnSlate - aOnSlate;
                const hotDiff = (b.rating?.hotnessScore || 0) - (a.rating?.hotnessScore || 0);
                if (hotDiff !== 0) return hotDiff;
                return (b.rating?.ratingNum || 0) - (a.rating?.ratingNum || 0);
            })
            .slice(0, limit);
    },

    getOverviewEdges(limit = 5) {
        return (window.store.state.games || [])
            .filter((game) => game?.status?.type?.state === 'pre')
            .map((game) => {
                const competition = game?.competitions?.[0];
                const away = competition?.competitors?.find((competitor) => competitor.homeAway === 'away');
                const home = competition?.competitors?.find((competitor) => competitor.homeAway === 'home');
                if (!away?.team?.id || !home?.team?.id) return null;

                const prediction = window.predictor.predict(away.team.id, home.team.id, true);
                if (!prediction) return null;

                const leaningHome = Number(prediction.homeWinProbability || 0) >= Number(prediction.awayWinProbability || 0);
                const leanTeam = leaningHome ? prediction.teamB : prediction.teamA;
                const edgeScore = Math.max(
                    Math.abs(Number(prediction.marketEdge || 0) * 100),
                    Math.abs(Number(prediction.spreadEdge || 0)),
                    Math.abs(Number(prediction.homeWinProbability || 0) - Number(prediction.awayWinProbability || 0)) * 0.5
                );
                const official = Math.abs(Number(prediction.marketEdge || 0)) >= 0.035 ||
                    Math.abs(Number(prediction.spreadEdge || 0)) >= 1.5 ||
                    prediction.confidence === 'High';

                return {
                    gameId: game.id,
                    matchup: `${away.team.abbreviation} @ ${home.team.abbreviation}`,
                    startTime: game.date,
                    prediction,
                    leanTeam,
                    official,
                    edgeScore,
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.edgeScore - a.edgeScore)
            .slice(0, limit);
    },

    getOverviewPick(edges) {
        if (!edges.length) {
            return {
                hasOfficialPick: false,
                title: 'No official play',
                summary: 'No NBA game is clearing the current edge threshold right now.',
                edge: null,
            };
        }

        const strongestOfficial = edges.find((edge) => edge.official);
        const edge = strongestOfficial || edges[0];
        const leaningHome = Number(edge.prediction.homeWinProbability || 0) >= Number(edge.prediction.awayWinProbability || 0);
        const lineDisplay = edge.prediction.marketEdge !== null
            ? `ML ${edge.leanTeam.team.abbreviation} ${this.formatSigned(Math.abs(edge.prediction.marketEdge * 100), 1)} pts`
            : edge.prediction.spreadEdge !== null
                ? `${edge.prediction.projectedSpread} edge ${this.formatSigned(Math.abs(edge.prediction.spreadEdge), 1)}`
                : edge.prediction.bettingLean;

        return {
            hasOfficialPick: Boolean(strongestOfficial),
            title: strongestOfficial ? `${edge.leanTeam.team.abbreviation} team bet` : 'No official play',
            summary: strongestOfficial
                ? `${edge.prediction.bettingLean} is the strongest qualified side on today’s board, with ${leaningHome ? edge.prediction.teamB.prob : edge.prediction.teamA.prob}% model win odds and ${lineDisplay}.`
                : `Strongest lean is ${edge.prediction.bettingLean}, but the current NBA board does not clear the official-play threshold.`,
            edge,
        };
    },

    renderOverview() {
        const container = document.getElementById('overview-container');
        if (!container) return;

        const featuredGames = this.getFeaturedGames(5);
        const articles = (window.store.state.news || []).slice(0, 4);
        const topTeams = (window.store.state.teamRankings || []).slice(0, 6);
        const trendingPlayers = this.getTrendingPlayers(8);
        const edges = this.getOverviewEdges(5);
        const pick = this.getOverviewPick(edges);
        const hottestPlayer = trendingPlayers[0] || null;
        const hottestPlayerLabel = hottestPlayer
            ? (hottestPlayer.fullName || hottestPlayer.displayName || hottestPlayer.teamAbbr || '--').split(' ').slice(-1)[0]
            : '--';

        const formatPublished = (isoString) => {
            if (!isoString) return 'Latest';
            return new Date(isoString).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
        };

        container.innerHTML = `
            <section class="card overview-panel overview-hero-panel">
                <div class="overview-hero-copy">
                    <div class="overview-kicker">Pick Of The Day</div>
                    <h3>${pick.title}</h3>
                    <p>${pick.summary}</p>
                    ${pick.edge ? `
                        <div class="overview-chip-row">
                            <span class="overview-chip ${pick.hasOfficialPick ? 'success' : 'warning'}">${pick.hasOfficialPick ? 'Official play' : 'Strongest lean'}</span>
                            <span class="overview-chip">${pick.edge.matchup}</span>
                            <span class="overview-chip">${pick.edge.prediction.modelScoreLabel}</span>
                            <span class="overview-chip">${pick.edge.prediction.bettingLean}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="overview-hero-metrics">
                    <div class="card stat-card">
                        <div class="stat-label">Live Games</div>
                        <div class="stat-value">${(window.store.state.games || []).filter((game) => game?.status?.type?.state === 'in').length}</div>
                    </div>
                    <div class="card stat-card">
                        <div class="stat-label">Top Team</div>
                        <div class="stat-value" style="font-size:20px;">${topTeams[0]?.team?.abbreviation || '--'}</div>
                    </div>
                    <div class="card stat-card">
                        <div class="stat-label">Hottest Player</div>
                        <div class="stat-value" style="font-size:20px;">${hottestPlayerLabel}</div>
                    </div>
                </div>
            </section>

            <section class="card overview-panel">
                <div class="overview-panel-head">
                    <h3>Scores Snapshot</h3>
                    <span class="overview-panel-sub">Today</span>
                </div>
                ${featuredGames.length ? `
                    <div class="overview-stack">
                        ${featuredGames.map((game) => {
                            const competition = game?.competitions?.[0];
                            const away = competition?.competitors?.find((competitor) => competitor.homeAway === 'away');
                            const home = competition?.competitors?.find((competitor) => competitor.homeAway === 'home');
                            return `
                                <button class="overview-row-btn" onclick="window.ui.renderGameDetail('${game.id}')">
                                    <div>
                                        <div class="overview-row-title">${away?.team?.abbreviation || 'AWY'} @ ${home?.team?.abbreviation || 'HME'}</div>
                                        <div class="overview-row-subtitle">${game?.status?.type?.shortDetail || new Date(game.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
                                    </div>
                                    <div class="overview-score-stack">
                                        <span>${away?.score || '0'}</span>
                                        <span>${home?.score || '0'}</span>
                                    </div>
                                </button>
                            `;
                        }).join('')}
                    </div>
                ` : '<div class="news-empty">No games on the board yet.</div>'}
            </section>

            <section class="card overview-panel">
                <div class="overview-panel-head">
                    <h3>Top Teams</h3>
                    <span class="overview-panel-sub">Official composite</span>
                </div>
                ${topTeams.length ? `
                    <div class="overview-stack">
                        ${topTeams.map((entry) => `
                            <button class="overview-row-btn" onclick="window.ui.showTeamDetail('${entry.id}')">
                                <div>
                                    <div class="overview-row-title">#${entry.rank} ${entry.team.displayName}</div>
                                    <div class="overview-row-subtitle">${entry.stats.wins}-${entry.stats.losses} • ${entry.stats.recentRecord || '--'} last 5</div>
                                </div>
                                <div class="overview-metric-stack">
                                    <strong>${entry.stats.ovrRating}</strong>
                                    <span>OVR</span>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                ` : '<div class="news-empty">Team board is still loading.</div>'}
            </section>

            <section class="card overview-panel overview-span-two">
                <div class="overview-panel-head">
                    <h3>Trending News</h3>
                    <span class="overview-panel-sub">ESPN feed</span>
                </div>
                ${articles.length ? `
                    <div class="news-grid">
                        ${articles.map((article) => `
                            <a class="card news-card" href="${article.link}" target="_blank" rel="noreferrer">
                                ${article.image ? `<img src="${article.image}" alt="${article.headline}" class="news-card-image" onerror="this.remove()">` : ''}
                                <div class="news-card-body ${article.image ? '' : 'news-card-body-no-image'}">
                                    <div class="news-card-meta">
                                        <span>${article.source || 'ESPN'}</span>
                                        <span>${formatPublished(article.published)}</span>
                                    </div>
                                    <h3>${article.headline}</h3>
                                    ${article.description ? `<p>${article.description}</p>` : ''}
                                    <span class="news-card-link">Open Story</span>
                                </div>
                            </a>
                        `).join('')}
                    </div>
                ` : '<div class="news-empty">No NBA news available.</div>'}
            </section>

            <section class="card overview-panel">
                <div class="overview-panel-head">
                    <h3>Trending Players</h3>
                    <span class="overview-panel-sub">Pulse + rating</span>
                </div>
                ${trendingPlayers.length ? `
                    <div class="overview-stack">
                        ${trendingPlayers.map((player) => `
                            <button class="overview-row-btn" onclick="window.ui.showPlayerDetail('${player.id}')">
                                <div class="overview-player-shell">
                                    <img src="${player.headshot?.href || ''}" class="overview-player-headshot" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 36 36%22><rect fill=%22%23232836%22 width=%2236%22 height=%2236%22 rx=%2218%22/></svg>'">
                                    <div>
                                        <div class="overview-row-title">${player.fullName || player.displayName}</div>
                                        <div class="overview-row-subtitle">${player.teamAbbr} • ${player.rating?.tone?.label || 'Steady'} ${player.rating?.hotnessScore || 0}/5</div>
                                    </div>
                                </div>
                                <div class="overview-metric-stack">
                                    <strong>${player.rating?.rating || '--'}</strong>
                                    <span>${player.rating?.primaryArchetype || player.rating?.archetype || 'Role Player'}</span>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                ` : '<div class="news-empty">No player pulse data available yet.</div>'}
            </section>

            <section class="card overview-panel">
                <div class="overview-panel-head">
                    <h3>Best Model Edges</h3>
                    <span class="overview-panel-sub">Today only</span>
                </div>
                ${edges.length ? `
                    <div class="overview-stack">
                        ${edges.map((edge) => `
                            <button class="overview-row-btn" onclick="window.ui.renderGameDetail('${edge.gameId}')">
                                <div>
                                    <div class="overview-row-title">${edge.prediction.bettingLean}</div>
                                    <div class="overview-row-subtitle">${edge.matchup} • ${edge.prediction.modelScoreLabel}</div>
                                </div>
                                <div class="overview-metric-stack">
                                    <strong>${edge.prediction.marketEdge === null ? edge.prediction.projectedSpread : `ML ${edge.leanTeam.team.abbreviation}`}</strong>
                                    <span>${edge.prediction.marketEdge === null ? 'Model only' : `${this.formatSigned(Math.abs(edge.prediction.marketEdge * 100), 1)} pts`}</span>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                ` : '<div class="news-empty">No scheduled games with model edges right now.</div>'}
            </section>
        `;
    },

    // ==================== LIVE GAMES ====================
    renderLiveGames(games) {
        const container = document.getElementById('live-games-container');
        const statusText = document.getElementById('live-status-text');
        if (!games || games.length === 0) {
            container.innerHTML = '<div class="card" style="padding:32px; text-align:center; color:var(--text-secondary);"><div style="font-size:40px; margin-bottom:12px;">🏀</div>No games scheduled today.</div>';
            if (statusText) statusText.textContent = 'No Games';
            return;
        }

        const now = new Date();
        const activeGames = games.filter(g => {
            const state = g.status?.type?.state;
            if (state === 'post') {
                const endDate = new Date(g.date);
                const hoursSince = (now - endDate) / (1000 * 60 * 60);
                return hoursSince < 15;
            }
            return true;
        });

        const liveCount = activeGames.filter(g => g.status?.type?.state === 'in').length;
        if (statusText) {
            statusText.textContent = liveCount > 0 ? `${liveCount} Live` : 'Updated';
        }

        // --- Custom Sorting Logic ---
        const sortedGames = [...activeGames].sort((a, b) => {
            const getPriority = (g) => {
                const state = g.status?.type?.state;
                const d = new Date(g.date);
                const mins = (d - now) / 60000;

                if (state === 'in') return 0; // 1. LIVE
                if (state === 'pre') {
                    if (mins <= 5) return 1;  // 2. ABOUT TO START (5m)
                    if (mins <= 30) return 2; // 3. STARTING SOON (30m)
                    return 3;                // 4. SCHEDULED
                }
                if (state === 'post') return 4; // 5. FINAL
                return 5;
            };

            const pA = getPriority(a);
            const pB = getPriority(b);

            if (pA !== pB) return pA - pB;
            // Within same priority, sort by game time
            return new Date(a.date) - new Date(b.date);
        });

        container.innerHTML = sortedGames.map(game => this.createGameCard(game, now)).join('');

        // Bind click handlers
        container.querySelectorAll('.game-card[data-game-id]').forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const gameId = card.dataset.gameId;
                this.renderGameDetail(gameId);
            });
        });
    },

    async loadGameDetail(gameId, panel, state) {
        panel.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-tertiary); font-size:12px;">Loading game details...</div>';
        panel.style.maxHeight = panel.scrollHeight + 'px';

        const summary = await window.api.fetchGameSummary(gameId);
        if (!summary) {
            panel.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-tertiary);">Unable to load details</div>';
            panel.style.maxHeight = panel.scrollHeight + 'px';
            return;
        }

        panel.dataset.loaded = 'true';
        let html = '';

        if (state === 'pre') {
            html = this.buildPreGameDetail(summary);
        } else if (state === 'in') {
            html = this.buildLiveGameDetail(summary);
        } else {
            html = this.buildPostGameDetail(summary);
        }

        panel.innerHTML = html;
        panel.style.maxHeight = panel.scrollHeight + 'px';
    },

    // ==================== PRE-GAME DETAIL ====================
    buildPreGameDetail(summary) {
        const boxscore = summary.boxscore;
        const teams = boxscore?.teams || [];
        const away = teams[0];
        const home = teams[1];

        // Get team ratings from our store
        const getTeamRating = (teamId) => {
            const r = window.store.state.teamRankings.find(t => String(t.id) === String(teamId));
            return r ? r.stats : null;
        };

        const awayStats = getTeamRating(away?.team?.id);
        const homeStats = getTeamRating(home?.team?.id);

        // Build team stat comparison
        const comparisons = [];
        if (awayStats && homeStats) {
            comparisons.push({ label: 'OVR', away: awayStats.ovrRating, home: homeStats.ovrRating });
            comparisons.push({ label: 'OFF', away: awayStats.offRating, home: homeStats.offRating });
            comparisons.push({ label: 'DEF', away: awayStats.defRating, home: homeStats.defRating });
        }

        const keyFacts = (summary.article?.keywords || []).slice(0, 3);
        const prediction = away?.team?.id && home?.team?.id
            ? window.predictor.predict(away.team.id, home.team.id, true)
            : null;

        let predHtml = '';
        if (prediction) {
            const edgeLabel = prediction.marketEdge === null
                ? 'Model-only projection'
                : `${prediction.marketEdge > 0 ? home?.team?.abbreviation : away?.team?.abbreviation} ML edge ${this.formatSigned(Math.abs(prediction.marketEdge * 100), 1)} pts`;

            predHtml = `
                <div style="margin-top:12px; padding:14px; background:var(--bg-surface); border-radius:10px; border:1px solid var(--divider);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px; flex-wrap:wrap;">
                        <div>
                            <div style="font-size:10px; color:var(--brand-accent); text-transform:uppercase; font-weight:800; letter-spacing:0.8px; margin-bottom:4px;">Composite Projection</div>
                            <div style="font-size:18px; font-weight:800;">${prediction.modelScoreLabel}</div>
                            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">${prediction.teamB.team.abbreviation} ${prediction.teamB.prob}% win • ${prediction.teamA.team.abbreviation} ${prediction.teamA.prob}%</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:10px; color:var(--text-tertiary); text-transform:uppercase; font-weight:700;">Betting Lean</div>
                            <div style="font-size:12px; font-weight:700; color:var(--brand-accent); margin-top:4px;">${prediction.bettingLean}</div>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px; margin-bottom:10px;">
                        <div class="card stat-card" style="padding:10px;">
                            <div class="stat-label">Spread</div>
                            <div class="stat-value" style="font-size:16px;">${prediction.projectedSpread}</div>
                        </div>
                        <div class="card stat-card" style="padding:10px;">
                            <div class="stat-label">Projected Total</div>
                            <div class="stat-value" style="font-size:16px;">${prediction.projectedTotal}</div>
                        </div>
                        <div class="card stat-card" style="padding:10px;">
                            <div class="stat-label">Market Edge</div>
                            <div class="stat-value" style="font-size:16px; color:${prediction.marketEdge === null ? 'var(--text-secondary)' : (prediction.marketEdge > 0 ? 'var(--success-color)' : 'var(--warning-color)')};">${edgeLabel}</div>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; font-size:11px; color:var(--text-secondary);">
                        <span>${away?.team?.abbreviation} ML ${this.formatMoneyline(prediction.awayMoneyline)}</span>
                        <span>${home?.team?.abbreviation} ML ${this.formatMoneyline(prediction.homeMoneyline)}</span>
                        <span>${prediction.odds?.overUnder ? `O/U ${prediction.odds.overUnder}` : 'No total posted'}</span>
                    </div>
                </div>
            `;
        }

        return `
            <div style="padding:12px 0;">
                <div style="font-size:10px; color:var(--brand-accent); text-transform:uppercase; font-weight:700; letter-spacing:1px; margin-bottom:10px;">📋 Matchup Preview</div>
                ${comparisons.length ? `
                    <div style="display:grid; grid-template-columns:1fr auto 1fr; gap:6px; margin-bottom:12px;">
                        ${comparisons.map(c => {
                            const awayVal = parseFloat(c.away) || 0;
                            const homeVal = parseFloat(c.home) || 0;
                            const awayWins = awayVal > homeVal;
                            return `
                                <div style="text-align:center; font-size:15px; font-weight:800; color:${awayWins ? 'var(--success-color)' : 'var(--text-secondary)'};">${c.away}</div>
                                <div style="text-align:center; font-size:10px; color:var(--text-tertiary); font-weight:600; padding-top:3px;">${c.label}</div>
                                <div style="text-align:center; font-size:15px; font-weight:800; color:${!awayWins ? 'var(--success-color)' : 'var(--text-secondary)'};">${c.home}</div>
                            `;
                        }).join('')}
                    </div>
                ` : ''}
                ${predHtml}
                ${keyFacts.length ? `<div style="margin-top:10px; font-size:11px; color:var(--text-secondary); line-height:1.5;">${keyFacts.join(' • ')}</div>` : ''}
                <div style="margin-top:10px; text-align:center; font-size:10px; color:var(--text-tertiary);">Tap to view more • Data via ESPN</div>
            </div>
        `;
    },

    // ==================== LIVE GAME DETAIL ====================
    buildLiveGameDetail(summary) {
        const boxscore = summary.boxscore;
        const players = boxscore?.players || [];

        let statsHtml = '';
        players.forEach(teamBlock => {
            const teamAbbr = teamBlock.team?.abbreviation || '?';
            const stats = teamBlock.statistics || [];
            if (stats.length === 0) return;

            // Get top 5 scorers from the `athletes` array
            const athleteStats = stats[0]?.athletes || [];
            const sorted = athleteStats.slice().sort((a, b) => {
                const apts = parseFloat(a.stats?.[0]) || 0;  // PTS is usually first
                const bpts = parseFloat(b.stats?.[0]) || 0;
                return bpts - apts;
            }).slice(0, 5);

            const headers = stats[0]?.labels?.slice(0, 6) || ['MIN', 'FG', '3PT', 'FT', 'REB', 'AST'];

            statsHtml += `
                <div style="margin-bottom:10px;">
                    <div style="font-size:11px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">${teamAbbr}</div>
                    <table style="width:100%; border-collapse:collapse; font-size:10px;">
                        <thead>
                            <tr style="color:var(--text-tertiary);">
                                <th style="text-align:left; padding:2px 4px; font-weight:600;">Player</th>
                                ${headers.map(h => `<th style="text-align:center; padding:2px 3px; font-weight:600;">${h}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${sorted.map(a => `
                                <tr style="color:var(--text-secondary);">
                                    <td style="padding:2px 4px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:90px;">${a.athlete?.shortName || '?'}</td>
                                    ${(a.stats || []).slice(0, 6).map((s, i) => `<td style="text-align:center; padding:2px 3px; font-variant-numeric:tabular-nums; ${i === 0 ? 'font-weight:700; color:var(--text-primary);' : ''}">${s}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        });

        return `
            <div style="padding:12px 0;">
                <div style="font-size:10px; color:var(--live-color); text-transform:uppercase; font-weight:700; letter-spacing:1px; margin-bottom:10px;">
                    <span class="dot pulse" style="display:inline-block;width:6px;height:6px;background:var(--live-color);border-radius:50%;margin-right:5px;vertical-align:middle;"></span>
                    Live Box Score
                </div>
                ${statsHtml || '<div style="font-size:11px; color:var(--text-tertiary); text-align:center;">Box score loading...</div>'}
            </div>
        `;
    },

    // ==================== POST-GAME DETAIL ====================
    buildPostGameDetail(summary) {
        const boxscore = summary.boxscore;
        const players = boxscore?.players || [];

        let statsHtml = '';
        players.forEach(teamBlock => {
            const teamAbbr = teamBlock.team?.abbreviation || '?';
            const teamColor = teamBlock.team?.color ? `#${teamBlock.team.color}` : 'var(--brand-accent)';
            const stats = teamBlock.statistics || [];
            if (stats.length === 0) return;

            const athleteStats = stats[0]?.athletes || [];
            const sorted = athleteStats.slice().sort((a, b) => {
                const apts = parseFloat(a.stats?.[0]) || 0;
                const bpts = parseFloat(b.stats?.[0]) || 0;
                return bpts - apts;
            }).slice(0, 6);

            const headers = stats[0]?.labels?.slice(0, 7) || ['MIN', 'FG', '3PT', 'FT', 'REB', 'AST', 'PTS'];

            statsHtml += `
                <div style="margin-bottom:12px;">
                    <div style="font-size:11px; font-weight:700; color:var(--text-primary); margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                        <span style="width:3px; height:14px; background:${teamColor}; border-radius:2px; display:inline-block;"></span>
                        ${teamAbbr}
                    </div>
                    <table style="width:100%; border-collapse:collapse; font-size:10px;">
                        <thead>
                            <tr style="color:var(--text-tertiary);">
                                <th style="text-align:left; padding:2px 4px; font-weight:600;">Player</th>
                                ${headers.map(h => `<th style="text-align:center; padding:2px 3px; font-weight:600;">${h}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${sorted.map(a => {
                                const pts = parseFloat(a.stats?.[a.stats.length - 1]) || 0;
                                const isTopScorer = pts >= 25;
                                return `
                                    <tr style="color:${isTopScorer ? 'var(--text-primary)' : 'var(--text-secondary)'}; ${isTopScorer ? 'font-weight:600;' : ''}">
                                        <td style="padding:2px 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:90px;">${a.athlete?.shortName || '?'}</td>
                                        ${(a.stats || []).slice(0, 7).map((s, i) => `<td style="text-align:center; padding:2px 3px; font-variant-numeric:tabular-nums; ${i === headers.length - 1 ? 'font-weight:700; color:var(--brand-accent);' : ''}">${s}</td>`).join('')}
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        });

        return `
            <div style="padding:12px 0;">
                <div style="font-size:10px; color:var(--text-tertiary); text-transform:uppercase; font-weight:700; letter-spacing:1px; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
                    <span style="width:12px; height:12px; background:var(--success-color); border-radius:3px;"></span>
                    Final Result
                </div>
                ${statsHtml || '<div style="font-size:11px; color:var(--text-tertiary); text-align:center;">Box score unavailable</div>'}
            </div>
        `;
    },

    // ==================== NEW: DEDICATED GAME DETAIL PAGE ====================
    async renderGameDetail(gameId) {
        const pane = document.getElementById('pane-game-detail');
        if (!pane) return;

        // Save active game ID for polling updates
        window.store.state.activeGameId = gameId;

        this.switchTab('game-detail');

        // Initial loading state
        pane.innerHTML = `
            <div class="back-bar">
                <button class="back-btn" onclick="window.ui.goBack()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    Back to Scores
                </button>
            </div>
            <div style="text-align:center; padding:100px 0;">
                <div class="dot pulse" style="width:12px; height:12px; background:var(--brand-primary); border-radius:50%; margin: 0 auto 16px;"></div>
                <div style="font-weight:700; color:var(--text-secondary);">Loading full game details...</div>
            </div>
        `;

        const summary = await window.api.fetchGameSummary(gameId);
        if (!summary) {
            pane.innerHTML = '<div style="padding:40px; text-align:center;">Failed to load game summary.</div>';
            return;
        }

        this.updateGameDetailContent(summary);
    },

    buildPregameGamePage(summary, competition, away, home, prediction) {
        const rankings = window.store.state.teamRankings || [];
        const awayTeam = rankings.find((entry) => String(entry.id) === String(away?.team?.id));
        const homeTeam = rankings.find((entry) => String(entry.id) === String(home?.team?.id));
        const awayStats = awayTeam?.stats || {};
        const homeStats = homeTeam?.stats || {};

        const venue = summary?.gameInfo?.venue?.fullName || competition?.venue?.fullName || 'Venue pending';
        const venueAddress = summary?.gameInfo?.venue?.address || competition?.venue?.address || {};
        const location = [venueAddress?.city, venueAddress?.state, venueAddress?.country].filter(Boolean).join(', ');
        const broadcast = competition?.broadcasts?.[0]?.media?.shortName || competition?.broadcasts?.[0]?.names?.join(', ') || '';
        const tipLabel = competition?.status?.type?.shortDetail || new Date(competition?.date || summary?.header?.competitions?.[0]?.date || Date.now()).toLocaleString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
        const headline = summary?.predictor?.header || summary?.article?.headline || `${away?.team?.displayName || 'Away'} at ${home?.team?.displayName || 'Home'}`;
        const contextPills = [
            tipLabel,
            venue,
            location || null,
            broadcast ? `TV ${broadcast}` : null,
        ].filter(Boolean);

        const comparisonRows = [
            { label: 'OVR', away: awayStats.ovrRating || '--', home: homeStats.ovrRating || '--' },
            { label: 'OFF', away: awayStats.offRating || '--', home: homeStats.offRating || '--' },
            { label: 'DEF', away: awayStats.defRating || '--', home: homeStats.defRating || '--' },
            { label: 'Results', away: awayStats.resultsScore || '--', home: homeStats.resultsScore || '--' },
            { label: 'Recent 5', away: awayStats.recentRecord || '--', home: homeStats.recentRecord || '--' },
        ];

        const marketOdds = prediction?.odds || null;
        const drivers = prediction?.drivers || [headline];
        const awayTargets = away?.team?.id ? this.buildPregamePropTargets(away.team.id) : [];
        const homeTargets = home?.team?.id ? this.buildPregamePropTargets(home.team.id) : [];

        const buildTargetColumn = (team, targets) => `
            <div class="pregame-prop-column">
                <div class="pregame-prop-team">${team?.team?.displayName || 'Team'} · model targets</div>
                ${targets.length ? targets.map((target) => `
                    <button class="pregame-player-target" type="button" onclick="window.ui.showPlayerDetail('${target.id}')">
                        <div>
                            <strong>${target.displayName}</strong>
                            <span>${target.archetype}</span>
                        </div>
                        <div class="pregame-player-lines">
                            <span class="pregame-player-line">PTS ${target.points ?? '--'}</span>
                            <span class="pregame-player-line">REB ${target.rebounds ?? '--'}</span>
                            <span class="pregame-player-line">AST ${target.assists ?? '--'}</span>
                        </div>
                    </button>
                `).join('') : '<div class="news-empty">Top rotation projections will appear once the roster sync is ready.</div>'}
            </div>
        `;

        const favoriteAbbr = Number(prediction?.homeWinProbability || 0) >= Number(prediction?.awayWinProbability || 0)
            ? home?.team?.abbreviation
            : away?.team?.abbreviation;

        return `
            <div class="back-bar">
                <button class="back-btn" onclick="window.ui.goBack()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    Back to Scores
                </button>
            </div>

            <section class="pregame-page-shell">
                <article class="pregame-hero-card">
                    <div class="pregame-matchup-head">
                        <div class="pregame-team-spot">
                            <img src="${away?.team?.logos?.[0]?.href || away?.team?.logo || ''}" class="pregame-team-logo" alt="${away?.team?.displayName || 'Away'}">
                            <div>
                                <div class="pregame-kicker">Away</div>
                                <h2>${away?.team?.displayName || 'Away'}</h2>
                                <p>${away?.records?.[0]?.summary || away?.record?.[0]?.summary || ''}</p>
                            </div>
                        </div>
                        <div class="pregame-versus-block">
                            <span>Pregame</span>
                            <strong>${away?.team?.abbreviation || 'AWY'} @ ${home?.team?.abbreviation || 'HME'}</strong>
                        </div>
                        <div class="pregame-team-spot">
                            <img src="${home?.team?.logos?.[0]?.href || home?.team?.logo || ''}" class="pregame-team-logo" alt="${home?.team?.displayName || 'Home'}">
                            <div>
                                <div class="pregame-kicker">Home</div>
                                <h2>${home?.team?.displayName || 'Home'}</h2>
                                <p>${home?.records?.[0]?.summary || home?.record?.[0]?.summary || ''}</p>
                            </div>
                        </div>
                    </div>
                    <div class="pregame-context-row">
                        ${contextPills.map((pill, index) => `
                            <span class="pregame-context-pill ${index === 0 ? 'highlight' : ''}">${pill}</span>
                        `).join('')}
                    </div>
                    <div class="pregame-grid">
                        <div class="pregame-hero-side">
                            <span class="pregame-side-label">Composite projection</span>
                            <div class="pregame-model-score">${prediction?.modelScoreLabel || 'Projection pending'}</div>
                            <div class="pregame-model-prob">
                                ${home?.team?.abbreviation || 'HOME'} ${prediction?.homeWinProbability ?? '--'}% win · ${away?.team?.abbreviation || 'AWY'} ${prediction?.awayWinProbability ?? '--'}%
                            </div>
                            <p class="pregame-edge-copy">
                                ${prediction
                                    ? `${prediction.bettingLean} is the current edge, with ${favoriteAbbr} carrying the stronger model win path.`
                                    : 'The model preview will appear as soon as both team boards are ready.'}
                            </p>
                        </div>
                        <div class="pregame-panel">
                            <div class="section-headline">
                                <h3>Market Board</h3>
                                <span>${marketOdds?.provider || 'ESPN Odds'}</span>
                            </div>
                            <div class="pregame-market-grid">
                                <div class="card stat-card">
                                    <div class="stat-label">${away?.team?.abbreviation || 'AWY'} ML</div>
                                    <div class="stat-value" style="font-size:18px;">${this.formatMoneyline(prediction?.awayMoneyline ?? marketOdds?.awayMoneyline)}</div>
                                </div>
                                <div class="card stat-card">
                                    <div class="stat-label">${home?.team?.abbreviation || 'HME'} ML</div>
                                    <div class="stat-value" style="font-size:18px;">${this.formatMoneyline(prediction?.homeMoneyline ?? marketOdds?.homeMoneyline)}</div>
                                </div>
                                <div class="card stat-card">
                                    <div class="stat-label">Spread</div>
                                    <div class="stat-value" style="font-size:18px;">${marketOdds?.homeSpread != null ? `${home?.team?.abbreviation} ${this.formatSigned(Number(marketOdds.homeSpread), 1)}` : (prediction?.projectedSpread || '--')}</div>
                                </div>
                                <div class="card stat-card">
                                    <div class="stat-label">Total</div>
                                    <div class="stat-value" style="font-size:18px;">${marketOdds?.overUnder != null ? marketOdds.overUnder : (prediction?.projectedTotal || '--')}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </article>

                <div class="pregame-grid">
                    <article class="pregame-panel pregame-panel-wide">
                        <div class="section-headline">
                            <h3>Team Comparison</h3>
                            <span>${headline}</span>
                        </div>
                        <div class="pregame-comparison-grid">
                            ${comparisonRows.map((row) => `
                                <div class="pregame-compare-row">
                                    <strong>${row.away}</strong>
                                    <span>${row.label}</span>
                                    <strong>${row.home}</strong>
                                </div>
                            `).join('')}
                        </div>
                    </article>

                    <article class="pregame-panel">
                        <div class="section-headline">
                            <h3>Model Drivers</h3>
                            <span>Plain-language edge</span>
                        </div>
                        <div class="overview-stack">
                            ${drivers.map((driver) => `
                                <div class="pregame-driver-row">${driver}</div>
                            `).join('')}
                        </div>
                    </article>
                </div>

                <article class="pregame-panel pregame-panel-wide">
                    <div class="section-headline">
                        <h3>Model-Only Player Targets</h3>
                        <span>Internal projections, not sportsbook lines</span>
                    </div>
                    <div class="pregame-props-grid">
                        ${buildTargetColumn(away, awayTargets)}
                        ${buildTargetColumn(home, homeTargets)}
                    </div>
                </article>
            </section>
        `;
    },

    updateGameDetailContent(summary) {
        const pane = document.getElementById('pane-game-detail');
        if (!pane || pane.classList.contains('hidden')) return;

        const header = summary.header;
        const competitions = header?.competitions?.[0];
        const away = competitions?.competitors?.find(c => c.homeAway === 'away');
        const home = competitions?.competitors?.find(c => c.homeAway === 'home');
        const status = competitions?.status || header?.status;
        const state = status?.type?.state;

        // Score animation logic
        const oldAwayScore = pane.querySelector('#detail-score-away')?.textContent;
        const oldHomeScore = pane.querySelector('#detail-score-home')?.textContent;
        const awayScoreChanged = oldAwayScore !== undefined && oldAwayScore !== away?.score;
        const homeScoreChanged = oldHomeScore !== undefined && oldHomeScore !== home?.score;

        if (state === 'pre') {
            const prediction = away?.team?.id && home?.team?.id
                ? window.predictor.predict(away.team.id, home.team.id, true)
                : null;
            pane.innerHTML = this.buildPregameGamePage(summary, competitions, away, home, prediction);
            return;
        }

        const html = `
            <div class="back-bar">
                <button class="back-btn" onclick="window.ui.goBack()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    Back to Scores
                </button>
            </div>

            <div class="game-detail-hero">
                <div class="hero-matchup">
                    <div class="hero-team">
                        <img src="${away?.team?.logos?.[0]?.href || away?.team?.logo}" class="hero-logo-large" alt="${away?.team?.displayName}">
                        <div class="hero-team-name">${away?.team?.displayName}</div>
                        <div class="hero-team-record">${away?.record?.[0]?.summary || ''}</div>
                    </div>

                    <div class="hero-score-box">
                        <div style="display:flex; justify-content:center; align-items:center; gap:24px;">
                            <div id="detail-score-away" class="hero-score ${awayScoreChanged ? 'score-animate' : ''}">${away?.score || '0'}</div>
                            <div style="font-size:24px; font-weight:900; color:var(--text-tertiary); opacity:0.5;">-</div>
                            <div id="detail-score-home" class="hero-score ${homeScoreChanged ? 'score-animate' : ''}">${home?.score || '0'}</div>
                        </div>
                        <div class="hero-status-tag ${state === 'in' ? 'hero-status-live' : ''}">
                            ${state === 'in' ? '<span class="dot pulse" style="width:6px; height:6px; background:red; display:inline-block; margin-right:6px; vertical-align:middle;"></span>' : ''}
                            ${status?.type?.shortDetail || status?.type?.detail || 'Scheduled'}
                        </div>
                    </div>

                    <div class="hero-team">
                        <img src="${home?.team?.logos?.[0]?.href || home?.team?.logo}" class="hero-logo-large" alt="${home?.team?.displayName}">
                        <div class="hero-team-name">${home?.team?.displayName}</div>
                        <div class="hero-team-record">${home?.record?.[0]?.summary || ''}</div>
                    </div>
                </div>

                <div class="game-info-strip">
                    <div class="info-item">
                        <div class="info-label">Venue</div>
                        <div class="info-value">${summary?.gameInfo?.venue?.fullName || competitions?.venue?.fullName || 'N/A'}</div>
                    </div>
                    ${competitions?.attendance ? `
                    <div class="info-item">
                        <div class="info-label">Attendance</div>
                        <div class="info-value">${competitions.attendance.toLocaleString()}</div>
                    </div>
                    ` : ''}
                    ${competitions?.broadcasts?.length ? `
                    <div class="info-item">
                        <div class="info-label">Watch</div>
                        <div class="info-value">${competitions.broadcasts[0].media?.shortName || competitions.broadcasts[0].names?.join(', ') || 'N/A'}</div>
                    </div>
                    ` : ''}
                </div>
            </div>

            <div class="box-score-container">
                ${this.buildFullBoxScore(summary)}
            </div>
        `;

        pane.innerHTML = html;

        // Remove animation class after it plays
        setTimeout(() => {
            pane.querySelectorAll('.score-animate').forEach(el => el.classList.remove('score-animate'));
        }, 1000);
    },

    buildFullBoxScore(summary) {
        const teams = summary.boxscore?.players || [];
        if (!teams.length) return '<div style="text-align:center; padding:40px; color:var(--text-tertiary);">Box Score Coming Soon</div>';

        return teams.map(teamBlock => {
            const team = teamBlock.team;
            const statsGroups = teamBlock.statistics || [];
            if (statsGroups.length === 0) return '';
            
            const stats = statsGroups[0];
            const athletes = stats.athletes || [];
            const labels = stats.labels || [];

            return `
                <div style="margin-bottom:40px;">
                    <div class="box-score-section-header">
                        <img src="${team.logos?.[0]?.href || team.logo}" style="width:32px; height:32px;">
                        <h3>${team.displayName} Box Score</h3>
                    </div>
                    <div class="box-score-table-wrapper">
                        <table class="box-score-table">
                            <thead>
                                <tr>
                                    <th class="player-cell">Player</th>
                                    ${labels.map(l => `<th>${l}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${athletes.map(a => {
                                    const isStarter = a.starter;
                                    const statsArray = a.stats || [];
                                    const ptsIdx = labels.indexOf('PTS');
                                    const pts = parseFloat(statsArray[ptsIdx]) || 0;
                                    
                                    return `
                                        <tr style="cursor:pointer; ${!isStarter ? 'opacity:0.85;' : ''}" onclick="window.ui.showPlayerDetail('${a.athlete?.id}')">
                                            <td class="player-cell">
                                                <div style="display:flex; flex-direction:column;">
                                                    <span style="font-weight:700;">${a.athlete?.displayName}</span>
                                                    <span style="font-size:9px; color:var(--text-tertiary); font-weight:600;">${a.athlete?.position?.abbreviation || ''} ${isStarter ? '• STARTER' : ''}</span>
                                                </div>
                                            </td>
                                            ${statsArray.map((s, idx) => {
                                                const isPts = idx === ptsIdx;
                                                const isHigh = isPts && pts >= 25;
                                                return `<td class="${isPts ? 'stat-primary' : ''} ${isHigh ? 'high-stat' : ''}">${s}</td>`;
                                            }).join('')}
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');
    },

    createGameCard(game, now) {
        const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
        const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
        const state = game.status?.type?.state || 'pre';
        const clock = game.status?.displayClock || '';
        const period = game.status?.period || 0;
        const date = new Date(game.date);
        const gameId = game.id;
        const projection = state === 'pre' && away?.team?.id && home?.team?.id
            ? window.predictor.predict(away.team.id, home.team.id, true)
            : null;

        let statusText = '';
        let isLive = false;
        let statusClass = '';

        if (state === 'pre') {
            const minsToTip = (date - now) / 60000;
            if (minsToTip > 0 && minsToTip <= 5) {
                statusText = 'About to Start';
                statusClass = 'color:var(--warning-color)';
            } else if (minsToTip > 5 && minsToTip <= 30) {
                statusText = 'Starting Soon';
                statusClass = 'color:var(--warning-color)';
            } else {
                statusText = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            }
        } else if (state === 'in') {
            isLive = true;
            statusClass = 'color:var(--live-color)';
            if (period === 2 && clock === '0.0') {
                statusText = 'Halftime';
            } else if (clock === '0.0' && period < 4) {
                statusText = `End of Q${period}`;
            } else {
                statusText = `Q${period} ${clock}`;
            }
        } else if (state === 'post') {
            statusText = period > 4 ? `Final/OT${period - 4 > 1 ? period - 4 : ''}` : 'Final';
            statusClass = 'color:var(--text-secondary)';
        }

        const liveIndicator = isLive
            ? '<span class="dot pulse" style="display:inline-block;width:7px;height:7px;background:var(--live-color);border-radius:50%;margin-right:6px;vertical-align:middle;"></span>'
            : '';

        // ---- Quarter scores box score ----
        let quarterHtml = '';
        const homeLinescores = home?.linescores || [];
        const awayLinescores = away?.linescores || [];
        if ((state === 'in' || state === 'post') && (homeLinescores.length > 0 || awayLinescores.length > 0)) {
            const numQtrs = Math.max(homeLinescores.length, awayLinescores.length);
            let qHeaders = '';
            let awayQScores = '';
            let homeQScores = '';
            for (let q = 0; q < numQtrs; q++) {
                const label = q < 4 ? `Q${q + 1}` : `OT${q - 3}`;
                qHeaders += `<th style="font-size:10px; color:var(--text-tertiary); font-weight:600; padding:2px 6px; text-align:center;">${label}</th>`;
                awayQScores += `<td style="font-size:11px; padding:2px 6px; text-align:center; font-variant-numeric:tabular-nums;">${awayLinescores[q]?.value ?? '-'}</td>`;
                homeQScores += `<td style="font-size:11px; padding:2px 6px; text-align:center; font-variant-numeric:tabular-nums;">${homeLinescores[q]?.value ?? '-'}</td>`;
            }
            quarterHtml = `
                <div style="margin-top:10px; border-top:1px solid var(--divider); padding-top:8px;">
                    <table style="width:100%; border-collapse:collapse; font-size:11px;">
                        <thead><tr>
                            <th style="width:40px;"></th>
                            ${qHeaders}
                            <th style="font-size:10px; color:var(--text-secondary); font-weight:700; padding:2px 6px; text-align:center;">T</th>
                        </tr></thead>
                        <tbody>
                            <tr style="color:var(--text-secondary);">
                                <td style="font-weight:700; font-size:11px; padding:2px 0;">${away?.team?.abbreviation || ''}</td>
                                ${awayQScores}
                                <td style="font-weight:800; padding:2px 6px; text-align:center; color:var(--text-primary);">${away?.score || 0}</td>
                            </tr>
                            <tr style="color:var(--text-secondary);">
                                <td style="font-weight:700; font-size:11px; padding:2px 0;">${home?.team?.abbreviation || ''}</td>
                                ${homeQScores}
                                <td style="font-weight:800; padding:2px 6px; text-align:center; color:var(--text-primary);">${home?.score || 0}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        }

        // ---- Leaders section ----
        let leadersHtml = '';
        const buildLeaderLine = (competitor) => {
            if (!competitor?.leaders || competitor.leaders.length === 0) return '';
            const lines = [];
            competitor.leaders.forEach(cat => {
                if (cat.leaders && cat.leaders[0]) {
                    const leader = cat.leaders[0];
                    const shortName = leader.athlete?.shortName || leader.athlete?.displayName || '?';
                    const val = leader.displayValue;
                    const label = cat.shortDisplayName || cat.abbreviation;
                    lines.push(`${shortName} ${val} ${label}`);
                }
            });
            return lines.slice(0, 2).join(' · ');
        };

        if (state === 'pre') {
            const awayLeaders = buildLeaderLine(away);
            const homeLeaders = buildLeaderLine(home);
            if (awayLeaders || homeLeaders) {
                leadersHtml = `
                    <div style="margin-top:10px; border-top:1px solid var(--divider); padding-top:8px;">
                        ${awayLeaders ? `<div style="font-size:10px; color:var(--text-tertiary); margin-bottom:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🔥 ${awayLeaders}</div>` : ''}
                        ${homeLeaders ? `<div style="font-size:10px; color:var(--text-tertiary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🔥 ${homeLeaders}</div>` : ''}
                    </div>
                `;
            }
        } else if (state === 'in') {
            const awayLeaders = buildLeaderLine(away);
            const homeLeaders = buildLeaderLine(home);
            if (awayLeaders || homeLeaders) {
                leadersHtml = `
                    <div style="margin-top:8px; border-top:1px solid var(--divider); padding-top:8px;">
                        ${awayLeaders ? `<div style="font-size:10px; color:var(--text-tertiary); margin-bottom:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">⚡ ${awayLeaders}</div>` : ''}
                        ${homeLeaders ? `<div style="font-size:10px; color:var(--text-tertiary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">⚡ ${homeLeaders}</div>` : ''}
                    </div>
                `;
            }
        } else if (state === 'post') {
            const allLeaders = [];
            [away, home].forEach(comp => {
                if (comp?.leaders) {
                    comp.leaders.forEach(cat => {
                        if (cat.name === 'rating' && cat.leaders && cat.leaders[0]) {
                            const l = cat.leaders[0];
                            allLeaders.push({
                                name: l.athlete?.shortName || l.athlete?.displayName || '?',
                                headshot: l.athlete?.headshot || '',
                                statline: l.displayValue || '',
                                value: l.value || 0
                            });
                        }
                    });
                }
            });
            if (allLeaders.length > 0) {
                allLeaders.sort((a, b) => b.value - a.value);
                const potg = allLeaders[0];
                leadersHtml = `
                    <div style="margin-top:8px; border-top:1px solid var(--divider); padding-top:8px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <img src="${potg.headshot}" width="24" height="24" style="border-radius:50%; background:var(--bg-elevated); flex-shrink:0;" onerror="this.style.display='none'">
                            <div style="min-width:0;">
                                <div style="font-size:10px; color:var(--brand-accent); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">⭐ Player of the Game</div>
                                <div style="font-size:11px; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${potg.name} — ${potg.statline}</div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // State-based accent bar
        let accentBar = '';
        if (state === 'in') {
            accentBar = 'border-left:3px solid var(--live-color);';
        } else if (state === 'post') {
            accentBar = 'border-left:3px solid var(--text-tertiary);';
        } else {
            accentBar = 'border-left:3px solid var(--brand-accent);';
        }

        const detailHint = `<div style="text-align:center; margin-top:8px; font-size:10px; color:var(--text-tertiary); opacity:0.72;">${state === 'pre' ? 'Tap for matchup preview' : state === 'in' ? 'Tap for live box score' : 'Tap for full box score'}</div>`;

        const modelHtml = projection ? `
            <div style="margin-top:10px; border-top:1px solid var(--divider); padding-top:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;">
                    <div style="font-size:10px; color:var(--brand-accent); font-weight:800; text-transform:uppercase; letter-spacing:0.6px;">Composite Model</div>
                    <div style="font-size:10px; color:${projection.marketEdge === null ? 'var(--text-tertiary)' : (projection.marketEdge > 0 ? 'var(--success-color)' : 'var(--warning-color)')}; font-weight:700;">
                        ${projection.marketEdge === null ? 'No market line' : `ML ${projection.marketEdge > 0 ? home?.team?.abbreviation : away?.team?.abbreviation} ${this.formatSigned(Math.abs(projection.marketEdge * 100), 1)} pts`}
                    </div>
                </div>
                <div style="font-size:12px; font-weight:700; margin-bottom:6px;">${projection.modelScoreLabel}</div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; font-size:10px; color:var(--text-secondary);">
                    <span class="badge badge-roleplayer">${projection.projectedSpread}</span>
                    <span class="badge badge-roleplayer">Total ${projection.projectedTotal}</span>
                    <span class="badge badge-roleplayer">${projection.bettingLean}</span>
                </div>
            </div>
        ` : '';

        return `
            <div class="card game-card" data-game-id="${gameId}" data-game-state="${state}" style="cursor:pointer; ${accentBar} transition: all 0.2s ease;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                    <span style="font-size:12px; font-weight:700; ${statusClass}">
                        ${liveIndicator}${statusText}
                    </span>
                    <span style="font-size:11px; color:var(--text-tertiary); font-weight:500;">${game.shortName || ''}</span>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${away?.team?.logo || ''}" width="32" height="32" style="border-radius:4px;" onerror="this.style.display='none'">
                        <div>
                            <div style="font-weight:700; font-size:15px;">${away?.team?.abbreviation || '???'}</div>
                            <div style="font-size:11px; color:var(--text-tertiary);">${away?.records?.[0]?.summary || ''}</div>
                        </div>
                    </div>
                    <div style="font-size:24px; font-weight:800; opacity:${state === 'pre' ? '0.25' : '1'}; font-variant-numeric:tabular-nums;">${away?.score || '0'}</div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${home?.team?.logo || ''}" width="32" height="32" style="border-radius:4px;" onerror="this.style.display='none'">
                        <div>
                            <div style="font-weight:700; font-size:15px;">${home?.team?.abbreviation || '???'}</div>
                            <div style="font-size:11px; color:var(--text-tertiary);">${home?.records?.[0]?.summary || ''}</div>
                        </div>
                    </div>
                    <div style="font-size:24px; font-weight:800; opacity:${state === 'pre' ? '0.25' : '1'}; font-variant-numeric:tabular-nums;">${home?.score || '0'}</div>
                </div>

                ${quarterHtml}
                ${leadersHtml}
                ${modelHtml}
                ${detailHint}
            </div>
        `;
    },

    renderNews(articles) {
        const container = document.getElementById('news-grid-container');
        if (!container) return;

        if (!articles || articles.length === 0) {
            container.innerHTML = `
                <div class="card news-empty">
                    <div style="font-size:40px; margin-bottom:12px;">📰</div>
                    <h3 style="margin-bottom:8px;">No NBA news available</h3>
                    <p style="color:var(--text-secondary);">ESPN has not returned any stories right now.</p>
                </div>
            `;
            return;
        }

        const formatPublished = (isoString) => {
            if (!isoString) return 'Latest';
            return new Date(isoString).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
        };

        container.innerHTML = articles.map((article) => `
            <a class="card news-card" href="${article.link}" target="_blank" rel="noreferrer">
                ${article.image
                    ? `<img src="${article.image}" alt="${article.headline}" class="news-card-image" onerror="this.remove()">`
                    : ''}
                <div class="news-card-body ${article.image ? '' : 'news-card-body-no-image'}">
                    <div class="news-card-meta">
                        <span>${article.source || 'ESPN'}</span>
                        <span>${formatPublished(article.published)}</span>
                    </div>
                    <h3>${article.headline}</h3>
                    ${article.description ? `<p>${article.description}</p>` : ''}
                    <span class="news-card-link">Open Story</span>
                </div>
            </a>
        `).join('');
    },

    // ==================== RANKINGS ====================
    renderRankings(rankings) {
        const tbody = document.getElementById('rankings-table-body');
        if (!rankings || rankings.length === 0) return;

        tbody.innerHTML = rankings.map((r, i) => `
            <tr style="cursor:pointer;" onclick="window.ui.showTeamDetail('${r.id}')">
                <td style="font-weight:800; color:var(--text-tertiary); width:40px;">${i + 1}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${r.team?.logos?.[0]?.href || ''}" width="28" height="28" style="border-radius:4px;" onerror="this.style.display='none'">
                        <span style="font-weight:600;">${r.team?.displayName || 'Unknown'}</span>
                    </div>
                </td>
                <td style="font-weight:700; color:var(--brand-accent); font-variant-numeric:tabular-nums;">${r.stats?.ovrRating || '0.00'}</td>
                <td style="font-weight:600; font-variant-numeric:tabular-nums;">${r.stats?.offRating || '0.00'}</td>
                <td style="font-weight:600; font-variant-numeric:tabular-nums;">${r.stats?.defRating || '0.00'}</td>
                <td style="color:var(--text-secondary); font-variant-numeric:tabular-nums;">${r.stats?.wins || 0}-${r.stats?.losses || 0}</td>
                <td style="color:var(--text-tertiary); font-size:12px;">${r.stats?.streak || '--'}</td>
            </tr>
        `).join('');
    },

    // ==================== TEAMS GRID ====================
    renderTeamsList(teams) {
        const container = document.getElementById('teams-grid-container');
        if (!teams || teams.length === 0) return;

        const rankMap = {};
        window.store.state.teamRankings.forEach(r => { rankMap[r.id] = r; });

        container.innerHTML = teams.map(team => {
            const rk = rankMap[team.id];
            const ovr = rk ? rk.stats.ovrRating : '--';
            const record = rk ? `${rk.stats.wins}-${rk.stats.losses}` : '';

            return `
                <div class="card team-card" onclick="window.ui.showTeamDetail('${team.id}')">
                    <img src="${team.logos?.[0]?.href || ''}" width="48" height="48" style="border-radius:6px;" onerror="this.style.display='none'">
                    <div style="flex:1; min-width:0;">
                        <h3 style="font-size:15px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${team.displayName}</h3>
                        <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${record}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:18px; font-weight:800; color:var(--brand-accent);">${ovr}</div>
                        <div style="font-size:10px; color:var(--text-tertiary); font-weight:600; text-transform:uppercase;">OVR</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // ==================== TEAM DETAIL ====================
    async showTeamDetail(teamId) {
        console.log('[UI] Showing team detail:', teamId);
        window.store.state.activeTeamId = teamId;
        const team = window.store.state.teams.find(t => String(t.id) === String(teamId));
        const stats = window.store.state.teamStats[teamId];
        if (!team) return;

        const adv = stats ? window.models.generateAdvancedTeamStats(stats) : null;

        const rosterObj = window.store.state.rosters[teamId] || { athletes: [], coach: 'N/A' };
        const coachName = rosterObj.coach;

        const rankData = window.store.state.teamRankings.find(r => String(r.id) === String(teamId));
        const displayStats = rankData ? rankData.stats : adv;

        let roster = window.store.state.players.filter(p => String(p.teamId) === String(teamId));
        roster.sort((a, b) => (b.rating?.ratingNum || 0) - (a.rating?.ratingNum || 0));
        const topPlayer = roster[0];

        const nextGame = (window.store.state.games || []).find((game) => {
            const competitors = game?.competitions?.[0]?.competitors || [];
            return game?.status?.type?.state === 'pre' && competitors.some((competitor) => String(competitor?.team?.id) === String(teamId));
        }) || null;
        const nextCompetition = nextGame?.competitions?.[0] || null;
        const nextAway = nextCompetition?.competitors?.find((competitor) => competitor.homeAway === 'away');
        const nextHome = nextCompetition?.competitors?.find((competitor) => competitor.homeAway === 'home');
        const nextProjection = nextAway?.team?.id && nextHome?.team?.id
            ? window.predictor.predict(nextAway.team.id, nextHome.team.id, true)
            : null;
        const syncedRosterCount = roster.filter((player) => this.getPlayerOfficialStats(player)).length;

        const container = document.getElementById('pane-team-detail');

        const statsHtml = displayStats ? `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-bottom:28px;">
                <div class="card stat-card"><div class="stat-label">Record</div><div class="stat-value">${displayStats.wins}-${displayStats.losses}</div></div>
                <div class="card stat-card"><div class="stat-label">Results</div><div class="stat-value" style="color:var(--brand-accent);">${displayStats.resultsScore || '--'}</div></div>
                <div class="card stat-card"><div class="stat-label">Recent 5</div><div class="stat-value">${displayStats.recentRecord || '--'}</div></div>
                <div class="card stat-card"><div class="stat-label">OVR</div><div class="stat-value" style="color:var(--brand-accent);">${displayStats.ovrRating}</div></div>
                <div class="card stat-card"><div class="stat-label">OFF</div><div class="stat-value">${displayStats.offRating}</div></div>
                <div class="card stat-card"><div class="stat-label">DEF</div><div class="stat-value">${displayStats.defRating}</div></div>
                <div class="card stat-card"><div class="stat-label">Off Eff</div><div class="stat-value">${displayStats.offensiveEfficiency ? Number(displayStats.offensiveEfficiency).toFixed(1) : '--'}</div></div>
                <div class="card stat-card"><div class="stat-label">Net RTG</div><div class="stat-value" style="color:${displayStats.netRtg >= 0 ? 'var(--success-color)' : 'var(--live-color)'};">${displayStats.netRtg >= 0 ? '+' : ''}${displayStats.netRtg?.toFixed?.(1) || displayStats.netRtg || '--'}</div></div>
                <div class="card stat-card"><div class="stat-label">Streak</div><div class="stat-value">${displayStats.streak || '--'}</div></div>
            </div>
        ` : '<div class="card" style="padding:20px; text-align:center; color:var(--text-secondary);">Team stats loading...</div>';

        const teamOverviewHtml = displayStats ? `
            <div class="card" style="padding:20px; margin-bottom:24px; border:1px solid var(--divider);">
                <div style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start; flex-wrap:wrap;">
                    <div style="max-width:720px;">
                        <div style="font-size:10px; color:var(--brand-accent); text-transform:uppercase; font-weight:800; letter-spacing:0.8px; margin-bottom:6px;">Composite Team Read</div>
                        <div style="font-size:16px; font-weight:800; margin-bottom:8px;">${displayStats.tone?.label || 'Steady'} form • ${displayStats.trendScore || 0}/5 pulse</div>
                        <div style="font-size:14px; line-height:1.6; color:var(--text-secondary);">
                            ${team.displayName} is carrying a ${displayStats.ovrRating} overall built from official team outputs, not player rollups: ${displayStats.resultsScore || '--'} results/form, ${displayStats.offRating} offense, and ${displayStats.defRating} defense. The board is leaning on ${displayStats.wins}-${displayStats.losses}, a ${displayStats.netRtg >= 0 ? '+' : ''}${displayStats.netRtg?.toFixed?.(1) || displayStats.netRtg || '--'} net rating, ${displayStats.offensiveEfficiency ? Number(displayStats.offensiveEfficiency).toFixed(1) : '--'} offensive efficiency, ${displayStats.trueShootingPct ? Number(displayStats.trueShootingPct).toFixed(1) : '--'}% true shooting, and a ${displayStats.recentRecord || '--'} run over the last five. ${topPlayer ? `${topPlayer.fullName || topPlayer.displayName} still leads the roster context at ${topPlayer.rating?.rating || '--'} OVR, but star power only shapes matchup context rather than the core team rank.` : ''} ${nextProjection ? `The next slate projection leans ${nextProjection.bettingLean.toLowerCase()} with ${nextProjection.modelScoreLabel}.` : 'No next-game line is active on the current scoreboard.'}
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(2, minmax(120px, 1fr)); gap:10px; min-width:min(100%, 320px);">
                        <div class="card stat-card" style="padding:12px;">
                            <div class="stat-label">Results</div>
                            <div class="stat-value">${displayStats.resultsScore || '--'}</div>
                        </div>
                        <div class="card stat-card" style="padding:12px;">
                            <div class="stat-label">Recent 5</div>
                            <div class="stat-value">${displayStats.recentRecord || '--'}</div>
                        </div>
                        <div class="card stat-card" style="padding:12px;">
                            <div class="stat-label">Off Eff</div>
                            <div class="stat-value">${displayStats.offensiveEfficiency ? Number(displayStats.offensiveEfficiency).toFixed(1) : '--'}</div>
                        </div>
                        <div class="card stat-card" style="padding:12px;">
                            <div class="stat-label">Pace</div>
                            <div class="stat-value">${displayStats.pace ? Number(displayStats.pace).toFixed(1) : '--'}</div>
                        </div>
                        <div class="card stat-card" style="padding:12px;">
                            <div class="stat-label">Star Context</div>
                            <div class="stat-value">${displayStats.starPower || '--'}</div>
                        </div>
                        <div class="card stat-card" style="padding:12px;">
                            <div class="stat-label">Depth Context</div>
                            <div class="stat-value">${displayStats.depth || '--'}</div>
                        </div>
                    </div>
                </div>
                <div class="team-context-strip">
                    <div class="context-card">
                        <span class="stat-label">True Shooting</span>
                        <strong>${displayStats.trueShootingPct ? Number(displayStats.trueShootingPct).toFixed(1) : '--'}${displayStats.trueShootingPct ? '%' : ''}</strong>
                    </div>
                    <div class="context-card">
                        <span class="stat-label">AST / TO</span>
                        <strong>${displayStats.assistTurnoverRatio ? Number(displayStats.assistTurnoverRatio).toFixed(2) : '--'}</strong>
                    </div>
                    <div class="context-card">
                        <span class="stat-label">Rebound Rate</span>
                        <strong>${displayStats.reboundRate ? Number(displayStats.reboundRate).toFixed(1) : '--'}${displayStats.reboundRate ? '%' : ''}</strong>
                    </div>
                    <div class="context-card">
                        <span class="stat-label">Pressure</span>
                        <strong>${displayStats.pressureRate ? Number(displayStats.pressureRate).toFixed(1) : '--'}${displayStats.pressureRate ? '%' : ''}</strong>
                    </div>
                </div>
                ${nextProjection ? `
                    <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap; font-size:11px; color:var(--text-secondary);">
                        <span class="badge badge-roleplayer">${nextProjection.projectedSpread}</span>
                        <span class="badge badge-roleplayer">Total ${nextProjection.projectedTotal}</span>
                        <span class="badge badge-roleplayer">${String(teamId) === String(nextHome?.team?.id) ? `${team.displayName} ML ${this.formatMoneyline(nextProjection.homeMoneyline)}` : `${team.displayName} ML ${this.formatMoneyline(nextProjection.awayMoneyline)}`}</span>
                    </div>
                ` : ''}
            </div>
        ` : '';

        container.innerHTML = `
            <div class="pane-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
                <div style="display:flex; align-items:center; gap:20px;">
                    <button class="back-btn" onclick="window.ui.goBack()">← Back</button>
                    <div style="display:flex; align-items:center; gap:14px;">
                        <img src="${team.logos?.[0]?.href || ''}" width="48" height="48" style="border-radius:8px;">
                        <div>
                            <h2 style="font-size:20px;">${team.displayName}</h2>
                            <div style="font-size:12px; color:var(--text-secondary);">Coach: ${coachName}</div>
                        </div>
                    </div>
                </div>
                <button class="action-btn" onclick="window.store.toggleFavorite('team', '${team.id}'); window.ui.showTeamDetail('${team.id}');" style="background:var(--bg-elevated); border:1px solid var(--border); padding:8px 16px; border-radius:var(--radius-md); color:var(--text-primary); cursor:pointer;">
                    ${window.store.state.favorites.teams.includes(String(team.id)) ? '⭐ Favorited' : '☆ Favorite'}
                </button>
            </div>
            ${statsHtml}
            ${teamOverviewHtml}
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:14px;">
                <h3 style="font-size:16px; font-weight:700;">Roster <span style="color:var(--text-tertiary); font-weight:500; font-size:13px;">(${roster.length} players)</span></h3>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Player</th><th>Pos</th><th>Style</th><th>OVR</th><th>OFF</th><th>DEF</th><th>PTS</th><th>REB</th><th>AST</th><th>GP</th><th>Tier</th></tr></thead>
                    <tbody>
                        ${roster.map(p => `
                            <tr style="cursor:pointer;" onclick="window.ui.showPlayerDetail('${p.id}')">
                                <td>
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <img src="${p.headshot?.href || ''}" width="30" height="30" style="border-radius:50%; background:var(--bg-elevated); object-fit:cover; flex-shrink:0;">
                                        <span style="font-weight:600; font-size:13px;">${p.fullName || p.displayName || 'Unknown'}</span>
                                    </div>
                                </td>
                                <td style="font-size:12px; color:var(--text-secondary);">${p.rating?.posAbbrev || p.position?.abbreviation || '--'}</td>
                                <td style="font-size:12px; color:var(--text-secondary);">${p.rating?.primaryArchetype || p.rating?.archetype || '--'}</td>
                                <td style="font-weight:700; color:var(--brand-accent);">${p.rating?.rating || '--'}</td>
                                <td style="font-size:12px; color:var(--success-color);">${p.rating?.offRating || '--'}</td>
                                <td style="font-size:12px; color:var(--info-color, #5bc0de);">${p.rating?.defRating || '--'}</td>
                                <td>${window.ui.getPlayerOfficialStats(p) ? window.ui.formatDecimal(window.ui.getPlayerOfficialStats(p).ppg) : '<span class="player-sync-pill">Syncing</span>'}</td>
                                <td>${window.ui.getPlayerOfficialStats(p) ? window.ui.formatDecimal(window.ui.getPlayerOfficialStats(p).rpg) : '<span class="player-sync-pill">Syncing</span>'}</td>
                                <td>${window.ui.getPlayerOfficialStats(p) ? window.ui.formatDecimal(window.ui.getPlayerOfficialStats(p).apg) : '<span class="player-sync-pill">Syncing</span>'}</td>
                                <td>${window.ui.getPlayerOfficialStats(p)?.gp ?? '<span class="player-sync-pill">Syncing</span>'}</td>
                                <td><span class="badge ${this.getBadgeClass(p.rating?.rating)}">${this.getBadgeLabel(p.rating?.rating)}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:16px; font-size:11px; color:var(--text-tertiary); text-align:center;">
                Player stats sync via ESPN APIs. ${syncedRosterCount}/${roster.length} players with official current-season stats attached.
            </div>
            <div id="team-schedule-container" style="margin-top:28px;"></div>
        `;

        this.switchTab('team-detail');
        const scheduleContainer = document.getElementById('team-schedule-container');
        try {
            const schedule = await window.api.fetchTeamSchedule(teamId);
            if (schedule && schedule.length > 0 && scheduleContainer) {
                scheduleContainer.innerHTML = `
                    <h3 style="font-size:16px; font-weight:700; margin-bottom:12px;">Last 5 Games</h3>
                    <div style="display:flex; gap:12px; overflow-x:auto; padding-bottom:8px;">
                        ${schedule.map(game => {
                            const comp = game.competitions[0];
                            const us = comp.competitors.find(c => c.team.id === String(teamId));
                            const opp = comp.competitors.find(c => c.team.id !== String(teamId));
                            if (!us || !opp) return '';
                            const isWin = us.winner;
                            const isHome = us.homeAway === 'home';
                            return `
                                <div class="card" style="min-width:140px; padding:12px; flex-shrink:0;">
                                    <div style="font-size:11px; color:var(--text-secondary); margin-bottom:8px;">${new Date(game.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})} • ${isHome ? 'vs' : '@'} ${opp.team.abbreviation}</div>
                                    <div style="display:flex; align-items:center; justify-content:space-between;">
                                        <img src="${opp.team?.logos?.[0]?.href || opp.team?.logo}" width="24" height="24">
                                        <div style="font-weight:700; font-size:14px;">${us.score?.displayValue || us.score?.value} - ${opp.score?.displayValue || opp.score?.value}</div>
                                    </div>
                                    <div style="margin-top:8px; font-size:11px; font-weight:700; color:${isWin ? 'var(--success-color)' : 'var(--live-color)'}; text-transform:uppercase;">${isWin ? 'W' : 'L'}</div>
                                </div>`;
                        }).join('')}
                    </div>`;
            }
        } catch (e) { console.error('Failed to load schedule', e); }
    },

    // ==================== PLAYER DETAIL ====================
    async showPlayerDetail(playerId) {
        try {
            console.log('showPlayerDetail called for:', playerId);
            window.store.state.activePlayerId = playerId;
            const p = window.store.state.players.find(x => String(x.id) === String(playerId));
            if (!p) {
                console.error('Player not found in window.store.state.players!', playerId);
                return;
            }
            if (!p.rating) {
            console.warn('Player rating is missing! Attempting to generate on the fly...');
            const rosterAthlete = window.store.state.rosters[p.teamId]?.athletes?.find(a => String(a.id) === String(playerId));
            if (rosterAthlete) {
                p.rating = window.models.generatePlayerRating(rosterAthlete, window.store.state.teamStats[p.teamId]);
            }
        }
        
        const team = window.store.state.teams.find(t => String(t.id) === String(p.teamId));
        const s = p.rating || { ratingNum: 0, offRating: "0", defRating: "0", pts: "0", reb: "0", ast: "0", stl: "0", blk: "0", gp: 0, mpg: "0" };
        const container = document.getElementById('pane-player-detail');
        const officialStats = this.getPlayerOfficialStats(p);
        const statSource = this.getPlayerStatSourceMeta(p);

        const tone = s.tone || { label: 'Steady' };
        const toneColor = this.getToneColor(tone);
        const projection = s.projection || null;
        const skillBucketLabels = {
            shotCreation: 'Shot Creation',
            shootingGravity: 'Shooting Gravity',
            rimPressure: 'Rim Pressure',
            playmaking: 'Playmaking',
            stopPower: 'Defensive Pressure',
            interiorControl: 'Interior Control',
        };
        const skillBuckets = Object.entries(s.skillBuckets || {})
            .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
        const aiAnalysis = s.aiOverview || (
            !officialStats
                ? `${p.fullName || p.displayName} is still syncing official ESPN season stats, so the rating card is temporarily leaning on the model baseline rather than a confirmed live stat line.`
                : `${p.fullName || p.displayName} is grading ${tone.label.toLowerCase()} right now at ${s.hotnessScore || 0}/5 on the composite pulse meter, with the official ${statSource.shortLabel.toLowerCase()} production driving the ${s.ratingNum || 0} overall.`
        );

        const isFav = (window.store.state.favorites.players || []).includes(String(p.id));

        container.innerHTML = `
            <div class="pane-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
                <button class="back-btn" onclick="window.ui.goBack()">← Back</button>
                <button class="action-btn" onclick="window.store.toggleFavorite('player', '${p.id}'); window.ui.showPlayerDetail('${p.id}');" style="background:var(--bg-elevated); border:1px solid var(--border); padding:8px 16px; border-radius:var(--radius-md); color:var(--text-primary); cursor:pointer;">
                    ${isFav ? '⭐ Favorited' : '☆ Favorite'}
                </button>
            </div>

            <div class="player-detail-layout">
                <div class="nba2k-player-card">
                    <div class="nba2k-card-top">
                        <div>
                            <div class="nba2k-ovr">${Number(s.ratingNum || 0).toFixed(1)}</div>
                            <div class="nba2k-ovr-label">Overall</div>
                            <div class="nba2k-chip">${s.primaryArchetype || s.archetype || 'Role Player'}</div>
                            <div class="nba2k-chip tone" style="background:${toneColor};">${tone.label} ${s.hotnessScore || 0}/5</div>
                        </div>
                        <div class="nba2k-team-mark">
                            <div class="nba2k-pos">${s.posAbbrev || p.position?.abbreviation || '--'}</div>
                            <img src="${team?.logos?.[0]?.href || ''}" width="42" height="42" style="margin-top:10px;" onerror="this.style.display='none'">
                        </div>
                    </div>
                    <div class="nba2k-card-body">
                        <img src="${p.headshot?.href || ''}" class="nba2k-player-image" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 30 30%22><rect fill=%22transparent%22 width=%2230%22 height=%2230%22/></svg>'">
                        <div class="nba2k-card-name">${p.fullName || p.displayName}</div>
                        <div class="nba2k-card-meta">${team?.displayName || p.teamName || 'NBA'} • ${s.secondaryStyle || 'Balanced Support'}</div>
                        <div class="nba2k-card-style">Takeover: ${s.takeoverStyle || 'Steady Force'}</div>
                    </div>
                    <div class="nba2k-card-ratings">
                        <div class="nba2k-rating-box">
                            <div class="nba2k-rating-value" style="color:var(--success-color);">${s.offRating}</div>
                            <div class="nba2k-ovr-label">OFF</div>
                        </div>
                        <div class="nba2k-rating-box">
                            <div class="nba2k-rating-value" style="color:#5bc0de;">${s.defRating}</div>
                            <div class="nba2k-ovr-label">DEF</div>
                        </div>
                    </div>
                </div>

                <div class="player-detail-main">
                    <div class="card player-intel-panel">
                        <div class="player-intel-head">
                            <span class="overview-kicker">Composite AI Report</span>
                            <span class="overview-chip" style="border-color:${toneColor}; color:${toneColor};">${s.primaryArchetype || s.archetype || 'Role Player'}</span>
                        </div>
                        <p>${aiAnalysis}</p>
                        <div class="player-intel-tags">
                            <span class="player-intel-tag">${statSource.longLabel}</span>
                            <span class="player-intel-tag">Secondary Style: ${s.secondaryStyle || 'Balanced Support'}</span>
                            <span class="player-intel-tag">Takeover: ${s.takeoverStyle || 'Steady Force'}</span>
                            <span class="player-intel-tag">Tier: ${this.getBadgeLabel(s.rating)}</span>
                            <span class="player-intel-tag">Team Context: ${team?.abbreviation || p.teamAbbr || '--'} ${window.store.state.teamRankings.find((entry) => String(entry.id) === String(p.teamId))?.stats?.ovrRating || '--'} OVR</span>
                        </div>
                    </div>

                    <div class="player-profile-grid">
                        <div class="card stat-card"><div class="stat-label">Pulse</div><div class="stat-value" style="color:${toneColor};">${tone.label}</div></div>
                        <div class="card stat-card"><div class="stat-label">Hotness</div><div class="stat-value">${s.hotnessScore || 0}/5</div></div>
                        <div class="card stat-card"><div class="stat-label">Proj PPG</div><div class="stat-value">${projection ? projection.points.toFixed(1) : '--'}</div></div>
                        <div class="card stat-card"><div class="stat-label">Proj APG</div><div class="stat-value">${projection ? projection.assists.toFixed(1) : '--'}</div></div>
                        <div class="card stat-card"><div class="stat-label">Proj RPG</div><div class="stat-value">${projection ? projection.rebounds.toFixed(1) : '--'}</div></div>
                        <div class="card stat-card"><div class="stat-label">OVR Band</div><div class="stat-value">${projection ? `${projection.floor.toFixed(1)}-${projection.ceiling.toFixed(1)}` : '--'}</div></div>
                    </div>

                    <div class="card skill-dna-panel">
                        <div class="section-headline">
                            <h3>Skill DNA</h3>
                            <span>${s.secondaryStyle || 'Balanced Support'}</span>
                        </div>
                        <div class="skill-dna-grid">
                            ${skillBuckets.map(([key, value]) => `
                                <div class="skill-dna-row">
                                    <div class="skill-dna-head">
                                        <span>${skillBucketLabels[key] || key}</span>
                                        <strong>${Number(value || 0)}</strong>
                                    </div>
                                    <div class="skill-dna-bar">
                                        <div class="skill-dna-fill" style="width:${Math.max(4, Number(value || 0))}%"></div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="card badge-panel">
                        <div class="section-headline">
                            <h3>Badge Loadout</h3>
                            <span>${s.takeoverStyle || 'Steady Force'}</span>
                        </div>
                        <div class="badge-list">
                            ${(s.skillBadges || []).map((badge) => `
                                <span class="badge-pill">${badge}</span>
                            `).join('')}
                        </div>
                    </div>

                    <div class="card season-stats-panel">
                        <div class="section-headline">
                            <h3>Official Season Stats</h3>
                            <span>${statSource.shortLabel}</span>
                        </div>
                        ${officialStats ? `
                            <div class="season-stats-grid">
                                <div class="card stat-card"><div class="stat-label">PPG</div><div class="stat-value">${this.formatDecimal(officialStats.ppg)}</div></div>
                                <div class="card stat-card"><div class="stat-label">RPG</div><div class="stat-value">${this.formatDecimal(officialStats.rpg)}</div></div>
                                <div class="card stat-card"><div class="stat-label">APG</div><div class="stat-value">${this.formatDecimal(officialStats.apg)}</div></div>
                                <div class="card stat-card"><div class="stat-label">SPG</div><div class="stat-value">${this.formatDecimal(officialStats.spg)}</div></div>
                                <div class="card stat-card"><div class="stat-label">BPG</div><div class="stat-value">${this.formatDecimal(officialStats.bpg)}</div></div>
                                <div class="card stat-card"><div class="stat-label">FG%</div><div class="stat-value">${this.formatDecimal(officialStats.fgPct)}%</div></div>
                                <div class="card stat-card"><div class="stat-label">3P%</div><div class="stat-value">${this.formatDecimal(officialStats.threePct)}%</div></div>
                                <div class="card stat-card"><div class="stat-label">eFG%</div><div class="stat-value">${this.formatDecimal(officialStats.efgPct)}%</div></div>
                                <div class="card stat-card"><div class="stat-label">TS%</div><div class="stat-value">${this.formatDecimal(officialStats.tsPct)}%</div></div>
                                <div class="card stat-card"><div class="stat-label">PER</div><div class="stat-value">${this.formatDecimal(officialStats.per)}</div></div>
                                <div class="card stat-card"><div class="stat-label">MPG</div><div class="stat-value">${this.formatDecimal(officialStats.mpg)}</div></div>
                                <div class="card stat-card"><div class="stat-label">GP</div><div class="stat-value">${officialStats.gp}</div></div>
                            </div>
                        ` : `
                            <div class="player-sync-panel">
                                <strong>Syncing official ESPN season stats</strong>
                                <p>The rating card is live, but the confirmed current-season stat row has not attached yet for ${p.fullName || p.displayName}.</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;

        this.switchTab('player-detail');
        } catch (e) {
            console.error('[UI] Error in showPlayerDetail:', e);
            toast.show('Error loading player details', 'error');
        }
    },

    // ==================== PLAYERS LIST (ALL) ====================
    renderPlayersList(players) {
        const tbody = document.getElementById('players-table-body');
        const countEl = document.getElementById('player-count');
        const tsEl = document.getElementById('player-timestamp');

        if (!players || players.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-secondary);">Loading players from all 30 rosters...</td></tr>';
            return;
        }

        // Apply filters
        const posFilter = document.getElementById('player-position-filter')?.value || 'all';
        const teamFilter = document.getElementById('player-team-filter')?.value || 'all';

        let filtered = players;
        if (posFilter !== 'all') {
            filtered = filtered.filter(p => {
                const pos = (p.position?.abbreviation || p.rating?.posAbbrev || '').toUpperCase();
                if (posFilter === 'G') return /^(G|PG|SG)$/i.test(pos);
                if (posFilter === 'F') return /^(F|SF|PF)$/i.test(pos);
                if (posFilter === 'C') return /^C$/i.test(pos);
                return true;
            });
        }
        if (teamFilter !== 'all') {
            filtered = filtered.filter(p => String(p.teamId) === teamFilter);
        }

        // TOP 25 LIMIT — only show the best 25 players
        const TOP_N = 25;
        const display = filtered.slice(0, TOP_N);

        if (countEl) countEl.textContent = `Top ${display.length} of ${players.length} players`;
        if (tsEl) tsEl.textContent = `Updated: ${this.formatTimestamp(window.store.state.lastUpdated.players)}`;

        // Populate team filter dropdown if empty
        this.populateTeamFilter();

        tbody.innerHTML = display.map((p, i) => `
            <tr style="cursor:pointer;" onclick="window.ui.showPlayerDetail('${p.id}')">
                <td style="font-weight:800; color:var(--text-tertiary); width:36px; font-variant-numeric:tabular-nums;">${i + 1}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${p.headshot?.href || ''}" width="32" height="32" style="border-radius:50%; background:var(--bg-elevated); object-fit:cover; flex-shrink:0;" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><rect fill=%22%23232836%22 width=%2232%22 height=%2232%22 rx=%2216%22/></svg>'">
                        <div style="min-width:0;">
                            <div style="font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.fullName || p.displayName || 'Unknown'}</div>
                            <div style="font-size:11px; color:var(--text-tertiary);">${p.rating?.posAbbrev || '--'} · ${p.teamAbbr || ''}</div>
                        </div>
                    </div>
                </td>
                <td style="font-weight:700; color:var(--brand-accent); font-size:15px; font-variant-numeric:tabular-nums;">${p.rating?.rating || '--'}</td>
                <td style="color:var(--text-secondary); font-size:12px;">${this.formatPlayerLine(p)}</td>
                <td style="font-variant-numeric:tabular-nums; font-size:12px;">${this.getPlayerOfficialStats(p)?.gp ?? '<span class="player-sync-pill">Syncing</span>'}</td>
                <td><span class="badge ${this.getBadgeClass(p.rating?.rating)}">${this.getBadgeLabel(p.rating?.rating)}</span></td>
            </tr>
        `).join('');
    },

    populateTeamFilter() {
        const teamFilter = document.getElementById('player-team-filter');
        if (!teamFilter || teamFilter.options.length > 1) return;

        const teams = window.store.state.teams.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
        teams.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.displayName;
            teamFilter.appendChild(opt);
        });
    },

    // ==================== LOADING PROGRESS ====================
    renderLoadingProgress() {
        const bar = document.getElementById('loading-bar-inner');
        const label = document.getElementById('loading-label');
        if (!bar || !label) return;

        const rp = window.store.state.loadingProgress.rosters;
        const sp = window.store.state.loadingProgress.playerStats;

        if (rp.phase === 'loading') {
            const pct = Math.round((rp.loaded / rp.total) * 100);
            bar.style.width = pct + '%';
            label.textContent = `Loading rosters: ${rp.loaded}/${rp.total} teams`;
        } else if (sp.phase === 'loading') {
            const pct = Math.round((sp.loaded / sp.total) * 100);
            bar.style.width = pct + '%';
            label.textContent = `Syncing player stats: ${sp.loaded}/${sp.total}`;
        } else {
            bar.style.width = '100%';
            label.textContent = window.store.state.players.length > 0
                ? `${window.store.state.players.length} players loaded`
                : 'Ready';
        }
    },

    // ==================== FAVORITES ====================
    renderFavorites() {
        const container = document.getElementById('favorites-container');
        if (!container) return;

        const favTeams = window.store.state.favorites.teams || [];
        const favPlayers = window.store.state.favorites.players || [];

        if (favTeams.length === 0 && favPlayers.length === 0) {
            container.innerHTML = '<div class="card" style="padding:40px; text-align:center; color:var(--text-secondary);"><div style="font-size:40px; margin-bottom:12px;">⭐</div>No favorites yet. Star teams and players to see them here.</div>';
            return;
        }

        let html = '';
        if (favTeams.length > 0) {
            html += '<h3 style="margin-bottom:16px; font-weight:700;">Favorite Teams</h3><div class="teams-grid" style="margin-bottom:32px;">';
            favTeams.forEach(tid => {
                const team = window.store.state.teams.find(t => String(t.id) === String(tid));
                const rankData = window.store.state.teamRankings.find(r => String(r.id) === String(tid));
                if (team) {
                    const stats = rankData ? rankData.stats : null;
                    html += `
                    <div class="card team-card" onclick="window.ui.showTeamDetail('${team.id}')" style="display:flex; flex-direction:column; align-items:center;">
                        <img src="${team.logos?.[0]?.href || ''}" width="56" height="56" style="margin-bottom:12px;">
                        <span style="font-weight:700; font-size:16px; margin-bottom:4px;">${team.displayName}</span>
                        ${stats ? `<div style="font-size:12px; color:var(--text-secondary);">${stats.wins}-${stats.losses} • <span style="color:var(--brand-accent); font-weight:700;">${stats.ovrRating} OVR</span></div>` : ''}
                    </div>`;
                }
            });
            html += '</div>';
        }

        if (favPlayers.length > 0) {
            html += '<h3 style="margin-bottom:16px; font-weight:700;">Favorite Players</h3><div class="teams-grid" style="margin-bottom:32px; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));">';
            favPlayers.forEach(pid => {
                const p = window.store.state.players.find(x => String(x.id) === String(pid));
                if (p && p.rating) {
                    const s = p.rating;
                    html += `
                    <div class="card team-card" onclick="window.ui.showPlayerDetail('${p.id}')" style="display:flex; flex-direction:column; align-items:center; position:relative;">
                        <div style="position:absolute; top:12px; right:12px; font-size:18px; font-weight:900; color:${s.rating >= 90 ? '#f1c40f' : s.rating >= 80 ? '#3498db' : 'var(--text-secondary)'};">${s.rating}</div>
                        <img src="${p.headshot?.href || ''}" width="80" height="60" style="object-fit:contain; margin-bottom:12px;" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 30 30%22><rect fill=%22transparent%22 width=%2230%22 height=%2230%22/></svg>'">
                        <span style="font-weight:700; font-size:14px; text-align:center;">${p.fullName || p.displayName}</span>
                        <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">${s.posAbbrev || '--'}</div>
                    </div>`;
                }
            });
            html += '</div>';
        }
        
        container.innerHTML = html;
    },

    // ==================== PREDICTOR ====================
    renderPredictorSetup() {
        const container = document.querySelector('.predictor-container');
        if (!container) return;
        const rankings = window.store.state.teamRankings;

        if (!rankings.length) {
            container.innerHTML = '<div class="card" style="padding:32px; text-align:center; color:var(--text-secondary);">Loading team data...</div>';
            return;
        }

        const sorted = [...rankings].sort((a, b) => a.team.displayName.localeCompare(b.team.displayName));
        const options = sorted.map(r => `<option value="${r.id}">${r.team.displayName}</option>`).join('');

        const defaultB = sorted.length > 1 ? sorted[1].id : sorted[0].id;

        container.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
                <div class="card pred-team-box">
                    <h3 style="margin-bottom:10px; font-size:13px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.5px;">Away Team</h3>
                    <select id="pred-team-a" style="width:100%;">${options}</select>
                </div>
                <div class="card pred-team-box">
                    <h3 style="margin-bottom:10px; font-size:13px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.5px;">Home Team</h3>
                    <select id="pred-team-b" style="width:100%;">
                        ${options.replace(`value="${defaultB}"`, `value="${defaultB}" selected`)}
                    </select>
                </div>
            </div>
            <div style="text-align:center; margin-bottom:20px;">
                <button id="run-predictor-btn" class="run-btn">Run Prediction</button>
            </div>
            <div id="predictor-results"></div>
        `;

        document.getElementById('run-predictor-btn').addEventListener('click', () => {
            const teamAId = document.getElementById('pred-team-a').value;
            const teamBId = document.getElementById('pred-team-b').value;
            this.renderPredictorResults(teamAId, teamBId);
        });
    },

    renderPredictorResults(teamAId, teamBId) {
        if (teamAId === teamBId) {
            alert('Please select different teams.');
            return;
        }

        const res = predictor.predict(teamAId, teamBId, true);
        if (!res) return;

        const resultsNode = document.getElementById('predictor-results');
        const confColor = res.confidence === 'High' ? 'var(--success-color)' : res.confidence === 'Low' ? 'var(--live-color)' : 'var(--warning-color)';

        resultsNode.innerHTML = `
            <div class="card" style="padding:24px; animation:fadeSlideIn var(--transition-base);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:28px;">
                    <div style="text-align:center; width:30%;">
                        <img src="${res.teamA.team.logos?.[0]?.href || ''}" width="56" height="56" style="margin-bottom:8px; border-radius:8px;">
                        <h3 style="font-size:28px; font-weight:800;">${res.teamA.score}</h3>
                        <div style="font-size:13px; color:var(--text-secondary);">${res.teamA.prob}% Win</div>
                        <div style="font-size:11px; color:var(--text-tertiary); margin-top:2px;">${res.teamA.team.abbreviation}</div>
                    </div>

                    <div style="text-align:center; width:40%;">
                        <div style="font-size:10px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">Projected Spread</div>
                        <div style="font-size:20px; font-weight:800; padding:8px 18px; background:var(--bg-elevated); border-radius:var(--radius-lg); display:inline-block; margin-bottom:10px;">
                            ${res.projectedSpread}
                        </div>
                        <div style="font-size:11px; color:${confColor}; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">
                            ${res.confidence} Confidence
                        </div>
                        <div style="font-size:11px; color:var(--text-secondary); margin-top:8px;">Total ${res.projectedTotal} • ${res.bettingLean}</div>
                    </div>

                    <div style="text-align:center; width:30%;">
                        <img src="${res.teamB.team.logos?.[0]?.href || ''}" width="56" height="56" style="margin-bottom:8px; border-radius:8px;">
                        <h3 style="font-size:28px; font-weight:800;">${res.teamB.score}</h3>
                        <div style="font-size:13px; color:var(--text-secondary);">${res.teamB.prob}% Win</div>
                        <div style="font-size:11px; color:var(--text-tertiary); margin-top:2px;">${res.teamB.team.abbreviation}</div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-bottom:20px;">
                    <div class="card stat-card" style="padding:14px;">
                        <div class="stat-label">Model Score</div>
                        <div class="stat-value" style="font-size:16px;">${res.modelScoreLabel}</div>
                    </div>
                    <div class="card stat-card" style="padding:14px;">
                        <div class="stat-label">Away ML</div>
                        <div class="stat-value" style="font-size:16px;">${this.formatMoneyline(res.awayMoneyline)}</div>
                    </div>
                    <div class="card stat-card" style="padding:14px;">
                        <div class="stat-label">Home ML</div>
                        <div class="stat-value" style="font-size:16px;">${this.formatMoneyline(res.homeMoneyline)}</div>
                    </div>
                    <div class="card stat-card" style="padding:14px;">
                        <div class="stat-label">Moneyline Edge</div>
                        <div class="stat-value" style="font-size:16px; color:${res.marketEdge === null ? 'var(--text-secondary)' : (res.marketEdge > 0 ? 'var(--success-color)' : 'var(--warning-color)')};">
                            ${res.marketEdge === null ? 'No line' : `${res.marketEdge > 0 ? res.teamB.team.abbreviation : res.teamA.team.abbreviation} ${this.formatSigned(Math.abs(res.marketEdge * 100), 1)} pts`}
                        </div>
                    </div>
                    <div class="card stat-card" style="padding:14px;">
                        <div class="stat-label">Spread Edge</div>
                        <div class="stat-value" style="font-size:16px; color:${res.spreadEdge === null ? 'var(--text-secondary)' : (res.spreadEdge > 0 ? 'var(--success-color)' : 'var(--warning-color)')};">
                            ${res.spreadEdge === null ? 'No spread' : `${res.spreadEdge > 0 ? res.teamB.team.abbreviation : res.teamA.team.abbreviation} ${this.formatSigned(Math.abs(res.spreadEdge), 1)}`}
                        </div>
                    </div>
                    <div class="card stat-card" style="padding:14px;">
                        <div class="stat-label">Total Edge</div>
                        <div class="stat-value" style="font-size:16px; color:${res.totalEdge === null ? 'var(--text-secondary)' : (res.totalEdge > 0 ? 'var(--success-color)' : 'var(--warning-color)')};">
                            ${res.totalEdge === null ? 'No total' : `${res.totalEdge > 0 ? 'Over' : 'Under'} ${Math.abs(res.totalEdge).toFixed(1)}`}
                        </div>
                    </div>
                </div>

                <div style="border-top:1px solid var(--divider); padding-top:20px;">
                    <h4 style="font-size:12px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.8px; margin-bottom:12px;">Key Matchup Drivers</h4>
                    <ul style="list-style:none; padding:0;">
                        ${res.drivers.map(d => `
                            <li style="padding:6px 0; font-size:13px; color:var(--text-secondary); display:flex; align-items:flex-start; gap:8px;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-accent)" stroke-width="2" style="margin-top:2px; flex-shrink:0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                ${d}
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <div style="margin-top:14px; font-size:10px; color:var(--text-tertiary); text-align:right;">
                    Computed: ${res.timestamp}
                </div>
            </div>
        `;
    }
};

window.ui = ui;
