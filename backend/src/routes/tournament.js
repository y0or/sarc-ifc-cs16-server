const express = require('express');
const multer = require('multer');
const store = require('../state/store');
const { generateBracket } = require('../bracket/bracket-engine');
const { validateTournamentImport } = require('../validation/tournament-validator');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/tournament - estado geral do torneio
router.get('/', (req, res) => {
  const state = store.getState();
  res.json({ tournament: state.tournament, teamCount: state.teams.length });
});

// GET /api/tournament/bracket - chaveamento atual (somente leitura no frontend)
router.get('/bracket', (req, res) => {
  res.json({ bracket: store.getBracket() });
});

// POST /api/tournament/draw - "Sortear" / "Iniciar campeonato".
// Só pode acontecer uma vez, e só com equipes válidas (3 a 8, todas completas).
router.post('/draw', (req, res) => {
  const state = store.getState();
  if (state.tournament.status !== 'registration') {
    return res.status(409).json({ error: 'O chaveamento já foi sorteado para este torneio.' });
  }
  const teams = store.getTeams();
  if (teams.length < 3 || teams.length > 8) {
    return res.status(400).json({ error: `É necessário entre 3 e 8 equipes cadastradas e válidas para sortear (atual: ${teams.length}).` });
  }
  try {
    const bracketData = generateBracket(teams);
    const bracket = store.setBracket(bracketData);
    res.status(201).json({ bracket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/tournament/start - marca o torneio como "em andamento" (após o sorteio)
router.post('/start', (req, res) => {
  try {
    store.startTournament();
    res.json({ tournament: store.getState().tournament });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// POST /api/tournament/advance - operador confirma resultado, reinicia o
// round do servidor de jogo e libera a próxima partida
router.post('/advance', async (req, res) => {
  try {
    const next = await require('../state/match-controller').advanceTournament();
    res.json({ nextMatch: next, tournament: store.getState().tournament });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// POST /api/tournament/reset - reinicia o estado completo do torneio
router.post('/reset', (req, res) => {
  store.reset();
  res.json({ tournament: store.getState().tournament });
});

// POST /api/tournament/import - importa um tournament.json completo
// (nome + equipes). O bracket em si é sempre gerado pelo /draw local,
// nunca aceito "pronto" de fora, para preservar a integridade do sorteio.
router.post('/import', upload.single('file'), (req, res) => {
  let payload;
  try {
    if (req.file) {
      payload = JSON.parse(req.file.buffer.toString('utf-8'));
    } else {
      payload = req.body;
    }
  } catch (err) {
    return res.status(400).json({ error: 'Arquivo JSON inválido.', details: [err.message] });
  }

  const result = validateTournamentImport(payload);
  if (!result.valid) {
    return res.status(400).json({ error: 'Falha na validação do torneio importado.', details: result.errors });
  }

  try {
    const teams = store.replaceTeams(result.teams);
    const state = store.getState();
    state.tournament.name = result.name;
    res.status(201).json({ teams, tournament: state.tournament });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

module.exports = router;
