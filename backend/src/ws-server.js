/**
 * Camada de WebSocket em tempo real (nativo, via biblioteca "ws" — sem
 * dependência de CDN externo no frontend, importante para uso 100% offline
 * em LAN).
 */
const { WebSocketServer } = require('ws');
const logger = require('./utils/logger');

function attachWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket) => {
    logger.info('[ws] novo cliente conectado');
    socket.send(JSON.stringify({ type: 'connected', payload: { ok: true }, ts: Date.now() }));

    socket.on('close', () => logger.info('[ws] cliente desconectado'));
    socket.on('error', (err) => logger.warn('[ws] erro no socket:', err.message));
  });

  return {
    broadcast(message) {
      const data = JSON.stringify(message);
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) {
          client.send(data);
        }
      }
    },
  };
}

module.exports = { attachWebSocket };
