/* ============================================================
   STORE — Centralized State Management
   Snapshot-first architecture with IndexedDB persistence
   ============================================================ */
const DB_NAME = 'composite-nba-cache';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const SNAPSHOT_KEY = 'bootstrap-v1';
const MAX_CACHE_AGE = 4 * 60 * 60 * 1000;

const store = {
    state: {
        games: [],
        news: [],
        newsStories: {},
        teams: [],
        teamStats: {},
        teamDetailedStats: {},
        teamRecentForm: {},
        teamRankings: [],
        players: [],
        rosters: {},
        leagueStats: {},
        roleStats: {},
        favorites: {
            teams: [],
            players: []
        },
        settings: {
            theme: 'dark',
            preset: 'balanced'
        },
        lastUpdated: {
            games: 0,
            news: 0,
            teams: 0,
            players: 0,
            rosters: 0
        },
        loadingProgress: {
            bootstrap: { loaded: 0, total: 1, phase: 'idle' },
            playerStats: { loaded: 0, total: 0, phase: 'idle' }
        },
        cacheLoaded: false,
        activeGameId: null,
        activeTeamId: null,
        activePlayerId: null,
        activeStoryId: null,
    },

    listeners: [],

    init() {
        const savedFavs = localStorage.getItem('nbaCompFavs');
        if (savedFavs) {
            try { this.state.favorites = JSON.parse(savedFavs); } catch (_error) {}
        }

        const savedSettings = localStorage.getItem('nbaCompSettings');
        if (savedSettings) {
            try { this.state.settings = JSON.parse(savedSettings); } catch (_error) {}
        }

        document.body.setAttribute('data-theme', this.state.settings.theme);
    },

    openDb() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB unavailable'));
                return;
            }

            const request = window.indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
                    db.createObjectStore(SNAPSHOT_STORE);
                }
            };
            request.onsuccess = () => resolve(request.result);
        });
    },

    async readSnapshotFromDb() {
        try {
            const db = await this.openDb();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
                const request = tx.objectStore(SNAPSHOT_STORE).get(SNAPSHOT_KEY);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result || null);
            });
        } catch (_error) {
            return null;
        }
    },

    async writeSnapshotToDb(snapshot) {
        try {
            const db = await this.openDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.objectStore(SNAPSHOT_STORE).put(snapshot, SNAPSHOT_KEY);
            });
        } catch (error) {
            console.warn('[Cache] IndexedDB snapshot write failed:', error?.message || error);
        }
    },

    subscribe(callback) {
        this.listeners.push(callback);
    },

    notify(key) {
        this.listeners.forEach((callback) => {
            try { callback(key, this.state); } catch (error) { console.error('Store listener error:', error); }
        });
    },

    hydrateSnapshot(snapshot, { notify = false } = {}) {
        if (!snapshot) return;

        this.state.games = snapshot.games || [];
        this.state.news = snapshot.news || [];
        this.state.teams = snapshot.teams || [];
        this.state.teamStats = snapshot.teamStats || {};
        this.state.teamDetailedStats = snapshot.teamDetailedStats || {};
        this.state.teamRecentForm = snapshot.teamRecentForm || {};
        this.state.rosters = snapshot.rosters || {};
        this.state.lastUpdated = {
            ...this.state.lastUpdated,
            games: snapshot.bootstrapUpdated ? Date.parse(snapshot.bootstrapUpdated) : (snapshot.lastUpdated ? Date.parse(snapshot.lastUpdated) : this.state.lastUpdated.games),
            news: snapshot.bootstrapUpdated ? Date.parse(snapshot.bootstrapUpdated) : (snapshot.lastUpdated ? Date.parse(snapshot.lastUpdated) : this.state.lastUpdated.news),
            teams: snapshot.lastUpdated ? Date.parse(snapshot.lastUpdated) : this.state.lastUpdated.teams,
            rosters: snapshot.lastUpdated ? Date.parse(snapshot.lastUpdated) : this.state.lastUpdated.rosters,
            players: snapshot.lastUpdated ? Date.parse(snapshot.lastUpdated) : this.state.lastUpdated.players,
        };
        this.state.cacheLoaded = true;

        if (notify) {
            this.notify('games');
            this.notify('news');
            this.notify('teams');
            this.notify('players');
            this.notify('rankings');
        }
    },

    async saveCache() {
        try {
            const snapshot = {
                games: this.state.games,
                news: this.state.news,
                teams: this.state.teams,
                teamStats: this.state.teamStats,
                teamDetailedStats: this.state.teamDetailedStats,
                teamRecentForm: this.state.teamRecentForm,
                rosters: this.state.rosters,
                lastUpdated: this.state.lastUpdated,
                timestamp: Date.now()
            };

            localStorage.setItem('nbaCompCacheMeta', JSON.stringify({
                timestamp: snapshot.timestamp,
                teams: this.state.teams.length,
                games: this.state.games.length,
                lastUpdated: this.state.lastUpdated,
            }));

            await this.writeSnapshotToDb(snapshot);
        } catch (error) {
            console.warn('[Cache] Save failed:', error?.message || error);
        }
    },

    async loadCache() {
        try {
            const snapshot = await this.readSnapshotFromDb();
            const age = Date.now() - Number(snapshot?.timestamp || 0);
            if (!snapshot || age > MAX_CACHE_AGE) {
                if (snapshot && age > MAX_CACHE_AGE) {
                    console.log('[Cache] IndexedDB snapshot expired, fetching fresh.');
                }
                return;
            }

            this.hydrateSnapshot(snapshot);
            const ageMins = Math.round(age / 60000);
            console.log(`[Cache] Restored NBA snapshot (${this.state.teams.length} teams, ${Object.keys(this.state.rosters || {}).length} rosters, ${ageMins}m old)`);
        } catch (error) {
            console.warn('[Cache] Load failed:', error?.message || error);
        }
    },

    toggleFavorite(type, id) {
        if (!this.state.favorites.teams) this.state.favorites.teams = [];
        if (!this.state.favorites.players) this.state.favorites.players = [];
        const list = type === 'team' ? this.state.favorites.teams : this.state.favorites.players;
        const idx = list.indexOf(String(id));
        if (idx === -1) list.push(String(id));
        else list.splice(idx, 1);
        this.saveState();
        this.notify('favorites');
    },

    setGames(games) {
        this.state.games = games;
        this.state.lastUpdated.games = Date.now();
        this.notify('games');
    },

    setNews(news) {
        this.state.news = news;
        this.state.lastUpdated.news = Date.now();
        this.notify('news');
    },

    setNewsStory(storyId, story) {
        this.state.newsStories[String(storyId)] = story;
        this.state.activeStoryId = String(storyId);
        this.notify('news-story');
    },

    setTeams(teams) {
        this.state.teams = teams;
        this.state.lastUpdated.teams = Date.now();
        this.notify('teams');
    },

    setTeamStats(teamId, stats) {
        this.state.teamStats[String(teamId)] = stats;
    },

    setRoster(teamId, roster) {
        this.state.rosters[String(teamId)] = roster;
        this.state.lastUpdated.rosters = Date.now();
    },

    setTeamRecentForm(teamId, games) {
        this.state.teamRecentForm[String(teamId)] = games;
    },

    setAllPlayers(players) {
        this.state.players = players;
        this.state.lastUpdated.players = Date.now();
        this.notify('players');
        this.saveCache();
    },

    setRankings(rankings) {
        this.state.teamRankings = rankings;
        this.notify('rankings');
        this.saveCache();
    },

    updateLoadingProgress(type, current, total, phase) {
        this.state.loadingProgress[type] = { loaded: current, total, phase };
        this.notify('loading');
    },

    toggleTheme() {
        this.state.settings.theme = this.state.settings.theme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', this.state.settings.theme);
        this.saveState();
        this.notify('settings');
        this.broadcastTheme();
    },

    setTheme(theme) {
        if (theme !== 'light' && theme !== 'dark') return;
        if (this.state.settings.theme === theme) return;
        this.state.settings.theme = theme;
        document.body.setAttribute('data-theme', this.state.settings.theme);
        this.saveState();
        this.notify('settings');
        this.broadcastTheme();
    },

    broadcastTheme() {
        try {
            window.parent.postMessage(
                {
                    type: 'composite-theme-changed',
                    sport: 'nba',
                    theme: this.state.settings.theme,
                },
                window.location.origin
            );
        } catch (_error) {}
    },

    setPreset(preset) {
        this.state.settings.preset = preset;
        this.saveState();
        this.notify('settings');
    },

    saveState() {
        localStorage.setItem('nbaCompFavs', JSON.stringify(this.state.favorites));
        localStorage.setItem('nbaCompSettings', JSON.stringify(this.state.settings));
    },

    setLastUpdated(key) {
        if (this.state.lastUpdated[key] !== undefined) {
            this.state.lastUpdated[key] = Date.now();
            this.saveCache();
            this.notify('lastUpdated');
        }
    }
};

window.store = store;
window.store.init();

window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data?.type === 'composite-theme' && data?.sport === 'nba' && (data?.theme === 'light' || data?.theme === 'dark')) {
        window.store.setTheme(data.theme);
    }
});
