/**
 * Camada de alto nível sobre o GoldSrcRcon: comandos de domínio do torneio
 * (bots, mapa, troca de lado, mensagens no jogo, etc).
 *
 * Se RCON_MOCK=true (ou se a conexão falhar), o controlador funciona em modo
 * "simulado" — todos os comandos são apenas logados, permitindo testar o
 * fluxo do torneio sem um servidor CS 1.6 real (útil em desenvolvimento).
 */
const { GoldSrcRcon } = require('./goldsrc-rcon');
const config = require('../utils/config');
const logger = require('../utils/logger');

class ServerController {
  constructor() {
    this.mock = config.RCON_MOCK;
    this.rcon = new GoldSrcRcon({
      host: config.CS_SERVER_HOST,
      port: config.CS_SERVER_RCON_PORT,
      password: config.RCON_PASSWORD,
      timeout: 2000,
    });
  }

  async _exec(command) {
    if (this.mock) {
      logger.info(`[RCON-MOCK] ${command}`);
      return '';
    }
    try {
      const result = await this.rcon.exec(command);
      logger.info(`[RCON] ${command} -> ${result || '(sem resposta)'}`);
      return result;
    } catch (err) {
      logger.warn(`[RCON] falha ao executar "${command}": ${err.message}`);
      throw err;
    }
  }

  /** Troca o mapa atual do servidor. */
  async changeMap(mapName) {
    return this._exec(`changelevel ${mapName}`);
  }

  /** Define quantidade máxima de rounds da partida (mp_maxrounds). */
  async setMaxRounds(rounds) {
    return this._exec(`mp_maxrounds ${rounds}`);
  }

  /** Reseta o placar/estado da partida no servidor. */
  async restartRound(delay = 1) {
    return this._exec(`sv_restart ${delay}`);
  }

  /** Troca os lados (CT <-> TR). */
  async swapTeams() {
    return this._exec('mp_swapteams 1');
  }

  /** Envia uma mensagem visível para todos os jogadores no servidor. */
  async say(message) {
    return this._exec(`say "${message}"`);
  }

  /** Preenche vagas com bots até o total desejado por lado. */
  async addBots({ ctCount = 0, tCount = 0 } = {}) {
    const cmds = [];
    for (let i = 0; i < ctCount; i++) cmds.push('bot_add_ct');
    for (let i = 0; i < tCount; i++) cmds.push('bot_add_t');
    for (const c of cmds) await this._exec(c);
    return cmds.length;
  }

  /** Remove todos os bots do servidor (usado quando um jogador real entra). */
  async kickAllBots() {
    return this._exec('bot_kick');
  }

  /** Remove um bot específico pelo nome (fallback caso não use bot_kick geral). */
  async kickBotByName(name) {
    return this._exec(`bot_kick "${name}"`);
  }

  /** Kicka um jogador (usado em desconexões/abandonos administrativos). */
  async kickPlayer(name) {
    return this._exec(`kick "${name}"`);
  }

  /** Consulta o status atual do servidor (jogadores conectados, mapa, etc). */
  async status() {
    return this._exec('status');
  }

  /**
   * Verifica rapidamente se o servidor CS 1.6 está de fato alcançável via
   * RCON (sem enviar comando algum — só o "challenge" inicial do protocolo).
   * Usado pelo Dashboard para reportar o status real do servidor, em vez de
   * assumir "online" sempre.
   */
  async ping(timeoutMs = 1200) {
    if (this.mock) return true;
    try {
      await Promise.race([
        this.rcon.getChallenge(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
      ]);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Prepara o servidor para uma nova partida do bracket.
   *
   * Não mexemos em bots aqui de propósito: o servidor já roda com ZBot em
   * modo "fill" (bot_quota 6 / bot_quota_mode fill, ver cstrike/server.cfg),
   * que mantém as vagas jogáveis sempre ocupadas e remove bots sozinho
   * conforme jogadores reais entram — mexer nisso manualmente aqui só
   * arriscaria conflitar com a quota nativa (ex.: passar de 6 bots).
   */
  async prepareMatch({ map, teamA, teamB, maxRounds = 6 }) {
    await this.say(`Preparando partida: ${teamA.tag} vs ${teamB.tag}`);
    if (map) await this.changeMap(map);
    await this.setMaxRounds(maxRounds);
    await this.say(`Sala pronta. ${teamA.name} (CT) x ${teamB.name} (TR)`);
  }
}

module.exports = new ServerController();
