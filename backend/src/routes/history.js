const express = require('express');
const store = require('../state/store');

const router = express.Router();

// GET /api/history - todas as partidas já finalizadas
router.get('/', (req, res) => {
  res.json({ history: store.getHistory() });
});

module.exports = router;
