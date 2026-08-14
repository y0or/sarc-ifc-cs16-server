const express = require('express');
const store = require('../state/store');
const matchController = require('../state/match-controller');
const { matchToJSON, matchToXML } = require('../utils/export');

const router = express.Router();

// GET /api/matches - lista todas as partidas do bracket
router.get('/', (req, res) => {
  const bracket = store.getBracket();
  res.json({ matches: bracket ? bracket.matches : [] });
});

// GET /api/matches/current - partida (ou fase) atual da fila de execução
router.get('/current', (req, res) => {
  res.json({
    match: store.getCurrentMatch(),
    waitingTeams: store.getWaitingTeams(),
  });
});

// GET /api/matches/:id - detalhes de uma partida específica
router.get('/:id', (req, res) => {
  const match = store.findMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'Partida não encontrada.' });
  res.json({ match });
});

// POST /api/matches/:id/start - operador clica "Iniciar partida" (prepara + envia ao servidor)
router.post('/:id/start', async (req, res) => {
  try {
    const match = await matchController.prepareMatch(req.params.id, { map: req.body?.map });
    res.json({ match });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/matches/:id/set-teams - define manualmente teamA/teamB de uma
// partida que ainda não tem os dois lados preenchidos (usado nos cenários
// de fase de grupos — 3 e 6 equipes — onde a classificação dos grupos não
// é decidida automaticamente pelo motor de bracket; o operador confirma a
// classificação e define quem joga a semifinal/final).
router.post('/:id/set-teams', (req, res) => {
  const match = store.findMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'Partida não encontrada.' });
  if (match.status !== 'waiting') {
    return res.status(400).json({ error: 'Só é possível definir equipes em partidas aguardando.' });
  }
  const { teamAId, teamBId } = req.body || {};
  const teams = store.getTeams();
  const teamA = teamAId ? teams.find(t => t.id === teamAId) : match.teamA;
  const teamB = teamBId ? teams.find(t => t.id === teamBId) : match.teamB;
  if (teamAId && !teamA) return res.status(400).json({ error: 'teamAId inválido.' });
  if (teamBId && !teamB) return res.status(400).json({ error: 'teamBId inválido.' });
  const updated = store.updateMatch(req.params.id, {
    teamA: teamA ? { id: teamA.id, name: teamA.name, tag: teamA.tag } : match.teamA,
    teamB: teamB ? { id: teamB.id, name: teamB.name, tag: teamB.tag } : match.teamB,
  });
  res.json({ match: updated });
});

// POST /api/matches/:id/round-win - operador registra manualmente quem
// venceu o round atual ({ side: "CT" | "TR" }). Reaproveita a mesma
// lógica do parser automático (troca de lado, fim de partida por placar
// decidido, prorrogação em caso de empate no round de corte).
router.post('/:id/round-win', async (req, res) => {
  const { side } = req.body || {};
  if (side !== 'CT' && side !== 'TR') {
    return res.status(400).json({ error: 'Campo "side" deve ser "CT" ou "TR".' });
  }
  try {
    await matchController.onRoundEnd(req.params.id, side);
    const match = store.findMatch(req.params.id);
    res.json({ match });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/matches/:id/swap-sides - operador força a troca de lado na mão
// (fora do gatilho automático do round 3) — reinvoca/recarrega o servidor
// exatamente como o swap automático.
router.post('/:id/swap-sides', async (req, res) => {
  try {
    const match = await matchController.manualSwapSides(req.params.id);
    res.json({ match });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/matches/:id/finish - operador força o encerramento (abandono/regra interna)
router.post('/:id/finish', async (req, res) => {
  try {
    const match = await matchController.finishMatch(req.params.id, {
      forced: true,
      reason: req.body?.reason || 'Encerrada manualmente pelo operador.',
    });
    res.json({ match });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/matches/:id/download/json
router.get('/:id/download/json', (req, res) => {
  const match = store.findMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'Partida não encontrada.' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="match-${match.id}.json"`);
  res.send(matchToJSON(match));
});

// GET /api/matches/:id/download/xml
router.get('/:id/download/xml', (req, res) => {
  const match = store.findMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'Partida não encontrada.' });
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="match-${match.id}.xml"`);
  res.send(matchToXML(match));
});

module.exports = router;
