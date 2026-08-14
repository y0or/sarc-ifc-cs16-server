// Cliente HTTP simples para a API local do backend.
const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* resposta sem corpo (ex: download) */ }
  if (!res.ok) {
    const error = new Error(data?.error || `Erro ${res.status}`);
    error.details = data?.details || [];
    throw error;
  }
  return data;
}

export const api = {
  // status / dashboard
  status: () => request('/status'),
  dashboard: () => request('/dashboard'),

  // teams
  listTeams: () => request('/teams'),
  addTeam: (team) => request('/teams', { method: 'POST', body: JSON.stringify(team) }),
  removeTeam: (id) => request(`/teams/${id}`, { method: 'DELETE' }),
  importTeamsFile: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/teams/import', { method: 'POST', body: fd });
  },

  // tournament
  tournament: () => request('/tournament'),
  bracket: () => request('/tournament/bracket'),
  draw: () => request('/tournament/draw', { method: 'POST' }),
  startTournament: () => request('/tournament/start', { method: 'POST' }),
  advance: () => request('/tournament/advance', { method: 'POST' }),
  resetTournament: () => request('/tournament/reset', { method: 'POST' }),
  importTournamentFile: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/tournament/import', { method: 'POST', body: fd });
  },

  // matches
  listMatches: () => request('/matches'),
  currentMatch: () => request('/matches/current'),
  getMatch: (id) => request(`/matches/${id}`),
  startMatch: (id, map) => request(`/matches/${id}/start`, { method: 'POST', body: JSON.stringify({ map }) }),
  roundWin: (id, side) => request(`/matches/${id}/round-win`, { method: 'POST', body: JSON.stringify({ side }) }),
  swapSides: (id) => request(`/matches/${id}/swap-sides`, { method: 'POST' }),
  setMatchTeams: (id, teamAId, teamBId) => request(`/matches/${id}/set-teams`, { method: 'POST', body: JSON.stringify({ teamAId, teamBId }) }),
  finishMatch: (id, reason) => request(`/matches/${id}/finish`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // players / history
  players: () => request('/players'),
  history: () => request('/history'),
};
