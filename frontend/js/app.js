import { connectWS } from './ws.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderTournament } from './pages/tournament.js';
import { renderMatches } from './pages/matches.js';
import { renderLive } from './pages/live.js';
import { renderBracket } from './pages/bracket.js';
import { renderPlayers } from './pages/players.js';
import { renderHistory } from './pages/history.js';
import { renderImport } from './pages/import.js';
import { renderSettings } from './pages/settings.js';
import { renderMatchDetail } from './pages/match-detail.js';

const root = document.getElementById('page-root');
let currentPageHandle = null;

// Token de navegação: incrementado a cada troca de rota. Uma renderização
// de página só é "aplicada" (currentPageHandle atribuído) se o token ainda
// for o mais recente quando ela terminar — evita que uma navegação lenta e
// antiga sobrescreva uma navegação mais nova que já terminou primeiro.
let navToken = 0;

const ROUTES = {
  dashboard: () => renderDashboard(root),
  tournament: () => renderTournament(root),
  matches: () => renderMatches(root),
  live: () => renderLive(root),
  bracket: () => renderBracket(root),
  players: () => renderPlayers(root),
  history: () => renderHistory(root),
  import: () => renderImport(root),
  settings: () => renderSettings(root),
};

function setActiveNav(routeKey) {
  document.querySelectorAll('#nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === routeKey);
  });
}

async function router() {
  const myToken = ++navToken;
  const hash = location.hash.replace(/^#\//, '') || 'dashboard';
  const [routeKey, param] = hash.split('/');

  setActiveNav(routeKey === 'match' ? 'matches' : routeKey);

  try {
    let handle;
    if (routeKey === 'match' && param) {
      handle = await renderMatchDetail(root, param);
    } else if (ROUTES[routeKey]) {
      handle = await ROUTES[routeKey]();
    } else {
      handle = await ROUTES.dashboard();
    }
    if (myToken === navToken) currentPageHandle = handle;
  } catch (err) {
    if (myToken === navToken) {
      root.innerHTML = `<div class="empty-state">Erro ao carregar página: ${err.message}</div>`;
    }
  }
}

window.addEventListener('hashchange', router);
router();

// Tempo real: qualquer evento relevante do backend recarrega a página atual.
const RELEVANT_EVENTS = new Set([
  'team:added', 'team:removed', 'team:imported',
  'bracket:drawn', 'bracket:advanced', 'match:updated', 'match:preparing',
  'match:round_end', 'match:side_swap', 'match:overtime', 'match:processing', 'match:finished',
  'match:advanced', 'tournament:started', 'tournament:advanced',
  'tournament:finished', 'tournament:reset', 'player:connected', 'player:disconnected',
]);

// Vários eventos do WebSocket podem chegar em rajada (ex.: ao preparar uma
// partida, o backend dispara "match:preparing" e "match:updated" quase ao
// mesmo tempo). Se cada evento disparasse seu próprio onEvent() de forma
// independente, chamadas concorrentes de load() poderiam se entrelaçar e
// duplicar conteúdo na tela (cada uma limpa a página, mas ambas inserem seu
// resultado por cima uma da outra). Esta fila serializa as recargas: nunca
// roda duas ao mesmo tempo, e rajadas de eventos viram uma única recarga
// final (a mais recente vence).
let reloadRunning = false;
let reloadQueued = false;

async function safeReload() {
  if (reloadRunning) {
    reloadQueued = true;
    return;
  }
  reloadRunning = true;
  do {
    reloadQueued = false;
    try {
      await currentPageHandle?.onEvent?.();
    } catch (err) {
      // Uma falha de recarga em tempo real não deve travar os próximos
      // eventos — a próxima navegação/refresh manual se recupera sozinha.
    }
  } while (reloadQueued);
  reloadRunning = false;
}

connectWS((msg) => {
  if (RELEVANT_EVENTS.has(msg.type)) {
    safeReload();
  }
});
