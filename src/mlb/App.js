'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '@/src/mlb/components/Navbar';
import OverviewPage from '@/src/mlb/components/OverviewPage';
import LivePage from '@/src/mlb/components/LivePage';
import RankingsPage from '@/src/mlb/components/RankingsPage';
import TeamsPage from '@/src/mlb/components/TeamsPage';
import PredictorPage from '@/src/mlb/components/PredictorPage';
import SettingsPage from '@/src/mlb/components/SettingsPage';
import TeamDetailPage from '@/src/mlb/components/TeamDetailPage';
import PlayersPage from '@/src/mlb/components/PlayersPage';
import PlayerDetailPage from '@/src/mlb/components/PlayerDetailPage';
import GameDetailPage from '@/src/mlb/components/GameDetailPage';
import NewsPage from '@/src/mlb/components/NewsPage';
import NewsStoryPage from '@/src/mlb/components/NewsStoryPage';
import { fetchMLBRouteJson, prefetchMLBRoutes } from '@/src/mlb/lib/clientPrefetch';

const MLB_BOOTSTRAP_ROUTES = [
  '/api/mlb/overview',
  '/api/mlb/scores',
  '/api/mlb/rankings',
  '/api/mlb/players',
  '/api/mlb/news',
];
const MLB_PRIMARY_REFRESH_ROUTES = [
  '/api/mlb/warm',
  '/api/mlb/overview',
  '/api/mlb/scores',
  '/api/mlb/rankings',
];

export default function Home({ theme = 'dark', toggleTheme, initialEntry = null }) {
  const [currentPage, setCurrentPage] = useState('overview');
  const [favorites, setFavorites] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [selectedStory, setSelectedStory] = useState(null);
  const prevPageRef = useRef('players'); // Track where user came from
  const initialEntryHandledRef = useRef(false);

  useEffect(() => {
    const savedFavs = localStorage.getItem('composite-hub-mlb-favorites');
    if (savedFavs) setFavorites(JSON.parse(savedFavs));

    // Warm the server cache first, then keep the main MLB tabs hot in the browser.
    fetchMLBRouteJson('/api/mlb/warm', { force: true, allowStaleOnError: true }).catch(() => { });
    prefetchMLBRoutes(MLB_BOOTSTRAP_ROUTES, { allowStaleOnError: true }).catch(() => { });

    const primaryRefresh = setInterval(() => {
      prefetchMLBRoutes(MLB_PRIMARY_REFRESH_ROUTES, { force: true, allowStaleOnError: true }).catch(() => { });
    }, 15000);

    const playersRefresh = setInterval(() => {
      fetchMLBRouteJson('/api/mlb/players', { force: true, allowStaleOnError: true }).catch(() => { });
    }, 60000);

    const newsRefresh = setInterval(() => {
      fetchMLBRouteJson('/api/mlb/news', { force: true, allowStaleOnError: true }).catch(() => { });
    }, 300000);

    return () => {
      clearInterval(primaryRefresh);
      clearInterval(playersRefresh);
      clearInterval(newsRefresh);
    };
  }, []);

  const toggleFavorite = useCallback((teamId) => {
    setFavorites(prev => {
      const next = prev.includes(teamId)
        ? prev.filter(id => id !== teamId)
        : [...prev, teamId];
      localStorage.setItem('composite-hub-mlb-favorites', JSON.stringify(next));
      return next;
    });
  }, []);

  const navigateToTeam = useCallback((teamId) => {
    if (teamId) {
      fetchMLBRouteJson(`/api/mlb/teams/${teamId}`, { force: true, allowStaleOnError: true }).catch(() => { });
    }
    setSelectedTeamId(teamId);
    setCurrentPage('team-detail');
  }, []);

  const navigateToPlayer = useCallback((playerId, fromPage) => {
    if (playerId) {
      fetchMLBRouteJson(`/api/mlb/players/${playerId}`, { force: true, allowStaleOnError: true }).catch(() => { });
    }
    prevPageRef.current = fromPage || currentPage;
    setSelectedPlayerId(playerId);
    setCurrentPage('player-detail');
  }, [currentPage]);

  const navigateToGame = useCallback((gameId) => {
    if (gameId) {
      fetchMLBRouteJson(`/api/mlb/games/${gameId}`, { force: true, allowStaleOnError: true }).catch(() => { });
    }
    setSelectedGameId(gameId);
    setCurrentPage('game-detail');
  }, []);

  const navigateToStory = useCallback((story, fromPage = 'news') => {
    if (!story?.storyId) return;
    fetchMLBRouteJson(`/api/mlb/news/${story.storyId}?apiHref=${encodeURIComponent(story.apiHref || '')}`, {
      force: true,
      allowStaleOnError: true,
    }).catch(() => { });
    prevPageRef.current = fromPage;
    setSelectedStory(story);
    setCurrentPage('story-detail');
  }, []);

  useEffect(() => {
    if (initialEntryHandledRef.current) return;
    if (!initialEntry?.playerId) return;
    initialEntryHandledRef.current = true;
    navigateToPlayer(initialEntry.playerId, initialEntry.fromHub ? 'hub' : 'players');
  }, [initialEntry, navigateToPlayer]);

  const goBack = useCallback(() => {
    setCurrentPage('teams');
    setSelectedTeamId(null);
  }, []);

  const goBackFromPlayer = useCallback(() => {
    setSelectedPlayerId(null);
    // Go back to where user came from
    const prev = prevPageRef.current;
    if (prev === 'hub') {
      window.location.assign('/');
    } else if (prev === 'team-detail') {
      setCurrentPage('team-detail');
    } else {
      setCurrentPage('players');
    }
  }, []);

  const goBackFromGame = useCallback(() => {
    setSelectedGameId(null);
    setCurrentPage('live');
  }, []);

  const goBackFromStory = useCallback(() => {
    setSelectedStory(null);
    setCurrentPage(prevPageRef.current === 'overview' ? 'overview' : 'news');
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'overview':
        return <OverviewPage onGameClick={navigateToGame} onTeamClick={navigateToTeam} onPlayerClick={(id) => navigateToPlayer(id, 'overview')} onStoryClick={(story) => navigateToStory(story, 'overview')} />;
      case 'live':
        return <LivePage onGameClick={navigateToGame} />;
      case 'rankings':
        return <RankingsPage favorites={favorites} toggleFavorite={toggleFavorite} onTeamClick={navigateToTeam} />;
      case 'teams':
        return <TeamsPage favorites={favorites} toggleFavorite={toggleFavorite} onTeamClick={navigateToTeam} />;
      case 'players':
        return <PlayersPage onPlayerClick={(id) => navigateToPlayer(id, 'players')} />;
      case 'team-detail':
        return <TeamDetailPage teamId={selectedTeamId} onBack={goBack} favorites={favorites} toggleFavorite={toggleFavorite} onPlayerClick={(id) => navigateToPlayer(id, 'team-detail')} />;
      case 'player-detail':
        return <PlayerDetailPage playerId={selectedPlayerId} onBack={goBackFromPlayer} />;
      case 'game-detail':
        return <GameDetailPage gameId={selectedGameId} onBack={goBackFromGame} />;
      case 'predictor':
        return <PredictorPage />;
      case 'news':
        return <NewsPage onStoryClick={(story) => navigateToStory(story, 'news')} />;
      case 'story-detail':
        return <NewsStoryPage story={selectedStory} onBack={goBackFromStory} onStoryClick={(story) => navigateToStory(story, 'news')} />;
      case 'settings':
        return <SettingsPage favorites={favorites} toggleFavorite={toggleFavorite} theme={theme} toggleTheme={toggleTheme} />;
      default:
        return <OverviewPage onGameClick={navigateToGame} onTeamClick={navigateToTeam} onPlayerClick={(id) => navigateToPlayer(id, 'overview')} onStoryClick={(story) => navigateToStory(story, 'overview')} />;
    }
  };

  return (
    <>
      <Navbar currentPage={currentPage} onNavigate={setCurrentPage} theme={theme} toggleTheme={toggleTheme} />
      {renderPage()}
    </>
  );
}
