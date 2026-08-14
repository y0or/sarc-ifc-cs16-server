/**
 * Configuração central do backend, lida via variáveis de ambiente
 * (definidas no docker-compose.yml). Todos os valores têm defaults
 * sensatos para rodar localmente sem Docker também.
 */
module.exports = {
  PORT: parseInt(process.env.PORT || '8080', 10),

  CS_SERVER_HOST: process.env.CS_SERVER_HOST || 'cs16-server',
  CS_SERVER_RCON_PORT: parseInt(process.env.CS_SERVER_RCON_PORT || '27015', 10),
  RCON_PASSWORD: process.env.RCON_PASSWORD || 'admin123',
  RCON_MOCK: String(process.env.RCON_MOCK || 'false').toLowerCase() === 'true',

  LOGS_DIR: process.env.LOGS_DIR || '/app/logs',
  DATA_DIR: process.env.DATA_DIR || '/app/data',

  DEFAULT_MAP: process.env.DEFAULT_MAP || 'de_dust2',
  MATCH_ROUNDS: parseInt(process.env.MATCH_ROUNDS || '6', 10),
};
