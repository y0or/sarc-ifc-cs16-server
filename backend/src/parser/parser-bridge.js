/**
 * Ponte entre o LogParser (eventos brutos do jogo) e o MatchController
 * (máquina de estados do torneio). Aqui é onde os logs "viram" ações reais
 * na partida ao vivo.
 */
const { LogParser } = require('./log-parser');
const store = require('../state/store');
const matchController = require('../state/match-controller');
const config = require('../utils/config');
const logger = require('../utils/logger');

function startParserBridge(io) {
  const parser = new LogParser({ logsDir: config.LOGS_DIR });
  let pendingWinSide = null; // guarda o lado vencedor do round até o World Round_End confirmar

  parser.on('round_win', ({ side }) => {
    pendingWinSide = side;
  });

  parser.on('round_end', async () => {
    const match = store.getCurrentMatch();
    if (!match || match.status !== 'live') {
      pendingWinSide = null;
      return;
    }
    if (!pendingWinSide) {
      logger.warn('[parser] Round_End sem vencedor de round detectado antes — ignorando.');
      return;
    }
    try {
      await matchController.onRoundEnd(match.id, pendingWinSide);
    } catch (err) {
      logger.error('[parser] erro processando fim de round:', err.message);
    } finally {
      pendingWinSide = null;
    }
  });

  parser.on('player_entered', async ({ nick }) => {
    logger.info(`[parser] jogador conectado: ${nick}`);
    try {
      await matchController.onPlayerConnected(nick);
    } catch (err) {
      logger.error('[parser] erro tratando conexão de jogador:', err.message);
    }
  });

  parser.on('player_disconnected', ({ nick }) => {
    logger.info(`[parser] jogador desconectado: ${nick}`);
    if (io) io.broadcast({ type: 'player:disconnected', payload: { nick }, ts: Date.now() });
  });

  parser.on('match_start', () => {
    if (io) io.broadcast({ type: 'server:match_start', payload: {}, ts: Date.now() });
  });

  parser.start();
  return parser;
}

module.exports = { startParserBridge };
