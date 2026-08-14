/**
 * SARC Docker Tournament Server — entrypoint do backend.
 *
 * Sobe: API REST + WebSocket (tempo real) + serve o frontend estático +
 * inicia o parser de logs do CS 1.6.
 */
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');

const config = require('./utils/config');
const logger = require('./utils/logger');
const store = require('./state/store');
const matchController = require('./state/match-controller');
const { attachWebSocket } = require('./ws-server');
const { startParserBridge } = require('./parser/parser-bridge');

const teamsRouter = require('./routes/teams');
const tournamentRouter = require('./routes/tournament');
const matchesRouter = require('./routes/matches');
const dashboardRouter = require('./routes/dashboard');
const historyRouter = require('./routes/history');
const playersRouter = require('./routes/players');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// --- API ---------------------------------------------------------------
app.use('/api/teams', teamsRouter);
app.use('/api/tournament', tournamentRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/players', playersRouter);
app.use('/api/history', historyRouter);
app.use('/api', dashboardRouter); // /api/status, /api/dashboard

// --- Frontend estático ---------------------------------------------------
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// --- Tratamento de erro genérico ---------------------------------------
app.use((err, req, res, next) => {
  logger.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.', details: err.message });
});

const httpServer = http.createServer(app);
const io = attachWebSocket(httpServer);
matchController.attachBroadcaster(io);

// Propaga qualquer mudança no store para os clientes conectados.
store.onChange((eventType, payload) => {
  io.broadcast({ type: eventType, payload, ts: Date.now() });
});

startParserBridge(io);

httpServer.listen(config.PORT, () => {
  logger.info(`SARC Tournament Server rodando em http://0.0.0.0:${config.PORT}`);
  logger.info(`RCON: ${config.RCON_MOCK ? 'MODO SIMULADO (RCON_MOCK=true)' : `${config.CS_SERVER_HOST}:${config.CS_SERVER_RCON_PORT}`}`);

  // Checagem inicial de conectividade com o servidor CS 1.6, só para dar
  // um sinal claro nos logs assim que o backend sobe (não bloqueia o boot).
  if (!config.RCON_MOCK) {
    const serverController = require('./rcon/server-controller');
    setTimeout(async () => {
      const ok = await serverController.ping();
      if (ok) {
        logger.info('[RCON] Servidor CS 1.6 respondeu ao ping — conexão OK.');
      } else {
        logger.warn('[RCON] Não foi possível alcançar o servidor CS 1.6! Verifique se o container "cs16-server" está rodando (docker compose ps) e se CS_SERVER_HOST/CS_SERVER_RCON_PORT estão corretos.');
      }
    }, 3000);
  }
});
