const SERVICE_BASE =
  process.env.COMPOSITE_CBB_SERVICE_URL ||
  process.env.CBB_SERVICE_URL ||
  '';

function joinUrl(base, path) {
  return `${String(base).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`;
}

async function fetchRemote(path, searchParams = {}) {
  if (!SERVICE_BASE) return null;

  const url = new URL(joinUrl(SERVICE_BASE, path));
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`CBB service error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export function hasRemoteCBBService() {
  return Boolean(SERVICE_BASE);
}

export async function fetchRemoteCBBBootstrap({ force = false } = {}) {
  return fetchRemote('/bootstrap', { force: force ? 1 : 0 });
}

export async function fetchRemoteCBBPlayers({ query = '' } = {}) {
  return fetchRemote('/players', query ? { q: query } : {});
}

export async function fetchRemoteCBBTeam(teamId) {
  return fetchRemote(`/teams/${teamId}`);
}

export async function fetchRemoteCBBPlayer(playerId) {
  return fetchRemote(`/players/${playerId}`);
}

export async function fetchRemoteCBBPredictor({ homeTeamId = '', awayTeamId = '' } = {}) {
  return fetchRemote('/predictor', {
    homeTeamId,
    awayTeamId,
  });
}
