const express = require('express');
const os = require('os');
const store = require('../state/store');
const config = require('../utils/config');
const serverController = require('../rcon/server-controller');

const router = express.Router();
const processStart = Date.now();

function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// GET /api/status - status real dos serviços (usado nos cards do topo).
// "server" reflete se o RCON do CS 1.6 respondeu de verdade — não é mais
// um valor fixo, para que o operador saiba imediatamente se o servidor de
// jogo está inacessível (ex.: container não subiu, firewall bloqueando).
router.get('/status', async (req, res) => {
  const serverOnline = await serverController.ping();
  res.json({
    server: serverOnline ? 'online' : 'offline',
    parser: 'online',
    api: 'online',
    monitor: 'online',
    rconMode: config.RCON_MOCK ? 'mock' : 'live',
  });
});

// GET /api/dashboard - agregação completa para a tela Dashboard
router.get('/dashboard', (req, res) => {
  const state = store.getState();
  const currentMatch = store.getCurrentMatch();
  const history = store.getHistory();
  const lastResult = history[history.length - 1] || null;

  const cpuLoad = os.loadavg()[0];
  const memUsedMB = Math.round((os.totalmem() - os.freemem()) / (1024 * 1024));

  res.json({
    uptime: formatUptime(Date.now() - processStart),
    cpuLoadPercent: Math.min(100, Math.round(cpuLoad * 100) / 1),
    ramUsedMB: memUsedMB,
    playersConnected: currentMatch
      ? [currentMatch.teamA, currentMatch.teamB].filter(Boolean).length * 3
      : 0,
    phase: state.bracket ? (currentMatch ? currentMatch.round : 'Concluído') : 'Cadastro de equipes',
    currentMap: currentMatch?.map || null,
    matchesCompleted: history.length,
    lastResult: lastResult ? {
      label: lastResult.label,
      scoreA: lastResult.scoreA,
      scoreB: lastResult.scoreB,
      winnerId: lastResult.winnerId,
      teamA: lastResult.teamA,
      teamB: lastResult.teamB,
    } : null,
    waitingTeams: store.getWaitingTeams().map(t => ({ id: t.id, name: t.name, tag: t.tag })),
    currentMatch,
    tournamentStatus: state.tournament.status,
  });
});

module.exports = router;
