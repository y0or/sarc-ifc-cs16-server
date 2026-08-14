const express = require('express');
const store = require('../state/store');

const router = express.Router();

// GET /api/players - jogadores da partida atual (para a tela Players / Monitor)
router.get('/', (req, res) => {
  const match = store.getCurrentMatch();
  if (!match) return res.json({ players: [] });
  const players = [];
  if (match.teamA) {
    for (const p of (store.getTeams().find(t => t.id === match.teamA.id)?.players || [])) {
      players.push({ nick: p.nick, team: match.teamA.name, tag: match.teamA.tag, side: match.side?.teamA || null });
    }
  }
  if (match.teamB) {
    for (const p of (store.getTeams().find(t => t.id === match.teamB.id)?.players || [])) {
      players.push({ nick: p.nick, team: match.teamB.name, tag: match.teamB.tag, side: match.side?.teamB || null });
    }
  }
  res.json({ players });
});

module.exports = router;
