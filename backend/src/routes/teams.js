const express = require('express');
const multer = require('multer');
const store = require('../state/store');
const { validateTeam, validateTeamList } = require('../validation/team-validator');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// GET /api/teams - lista equipes cadastradas
router.get('/', (req, res) => {
  res.json({ teams: store.getTeams() });
});

// POST /api/teams - cadastro manual de uma equipe
router.post('/', (req, res) => {
  const existingTags = store.getTeams().map(t => t.tag);
  const result = validateTeam(req.body, existingTags);
  if (!result.valid) {
    return res.status(400).json({ error: 'Equipe inválida.', details: result.errors });
  }
  try {
    const team = store.addTeam(req.body);
    res.status(201).json({ team });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// DELETE /api/teams/:id
router.delete('/:id', (req, res) => {
  try {
    store.removeTeam(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/teams/import - importa lista de equipes via JSON (arquivo ou body)
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

  const teams = Array.isArray(payload) ? payload : payload.teams;
  const result = validateTeamList(teams);
  if (!result.valid) {
    return res.status(400).json({ error: 'Falha na validação das equipes.', details: result.errors });
  }
  try {
    const saved = store.replaceTeams(result.teams);
    res.status(201).json({ teams: saved });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

module.exports = router;
