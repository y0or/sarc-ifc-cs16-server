/**
 * Controlador de partida — orquestra a máquina de estados de uma partida:
 *
 *   waiting -> preparing -> live -> processing -> finished
 *
 * Fluxo padrão de 6 rounds (mesmo formato em TODAS as fases do chaveamento):
 *   Rounds 1-3: CT   [troca de lado — Half-Time]   Rounds 4-6: TR
 *
 * Se empatar 3x3 depois do 6º round, a partida entra em "prorrogação": os
 * rounds seguintes continuam contando (sem nova troca de lado) até alguém
 * abrir vantagem — só aí a partida é finalizada de verdade.
 *
 * Os rounds podem ser registrados de duas formas:
 *   1) Automaticamente pelo parser de logs (quando os gatilhos de fim de
 *      round do servidor são reconhecidos).
 *   2) Manualmente pelo operador, clicando em "CT venceu o round" / "TR
 *      venceu o round" na tela Live Match — chama exatamente a mesma função
 *      (onRoundEnd), então todo o resto (troca de lado, fim de partida,
 *      cálculo de vencedor) funciona igual não importa a origem.
 */
const store = require('./store');
const serverController = require('../rcon/server-controller');
const config = require('../utils/config');
const logger = require('../utils/logger');

// Em qual round ocorre a troca de lado (Half-Time — após o 3º round, no
// formato padrão de 6 rounds). Só dispara uma vez, mesmo em prorrogação.
const SWAP_AFTER_ROUNDS = [3];

class MatchController {
  constructor() {
    this.io = null; // injetado pelo index.js (broadcast websocket)
  }

  attachBroadcaster(io) {
    this.io = io;
  }

  broadcast(type, payload) {
    if (this.io) this.io.broadcast({ type, payload, ts: Date.now() });
  }

  /** Operador clica em "Iniciar partida": prepara servidor (mapa, rounds). */
  async prepareMatch(matchId, { map } = {}) {
    const match = store.findMatch(matchId);
    if (!match) throw new Error('Partida não encontrada.');
    if (!match.teamA || !match.teamB) {
      throw new Error('Partida ainda não tem as duas equipes definidas.');
    }
    if (match.status !== 'waiting') {
      throw new Error(`Partida não está aguardando (status atual: ${match.status}).`);
    }

    const chosenMap = map || config.DEFAULT_MAP;
    store.updateMatch(matchId, {
      status: 'preparing',
      map: chosenMap,
      currentRound: 0,
      scoreA: 0,
      scoreB: 0,
      side: { teamA: 'CT', teamB: 'TR' },
      startedAt: null,
      roundHistory: [],
    });
    this.broadcast('match:preparing', store.findMatch(matchId));

    try {
      await serverController.prepareMatch({
        map: chosenMap,
        teamA: match.teamA,
        teamB: match.teamB,
        maxRounds: match.maxRounds || config.MATCH_ROUNDS,
      });
    } catch (err) {
      logger.warn('Falha ao preparar servidor via RCON (continuando mesmo assim):', err.message);
    }

    return store.updateMatch(matchId, { status: 'live', startedAt: new Date().toISOString() });
  }

  /**
   * Chamado pelo parser quando o log indica um jogador real conectado.
   * Não precisamos remover bot manualmente aqui: o sistema de bots do
   * servidor (ver cstrike/server.cfg) já reduz a contagem sozinho conforme
   * jogadores reais ocupam as vagas.
   */
  async onPlayerConnected(nick) {
    this.broadcast('player:connected', { nick });
  }

  /**
   * Registra o vencedor de um round — vem do parser (automático) OU de um
   * clique manual do operador na tela Live Match (fallback confiável,
   * recomendado enquanto o parser não estiver 100% calibrado para o log do
   * seu servidor). "winningSide" é "CT" ou "TR".
   */
  async onRoundEnd(matchId, winningSide) {
    const match = store.findMatch(matchId);
    if (!match || match.status !== 'live') return;

    const winningTeamKey = match.side.teamA === winningSide ? 'teamA' : 'teamB';
    const scoreKey = winningTeamKey === 'teamA' ? 'scoreA' : 'scoreB';
    const newRound = match.currentRound + 1;
    const newScore = match[scoreKey] + 1;

    const roundHistory = [...match.roundHistory, {
      round: newRound,
      winningSide,
      winningTeam: winningTeamKey,
      at: new Date().toISOString(),
    }];

    const updated = store.updateMatch(matchId, {
      currentRound: newRound,
      [scoreKey]: newScore,
      roundHistory,
    });
    this.broadcast('match:round_end', updated);

    if (SWAP_AFTER_ROUNDS.includes(newRound)) {
      await this._swapSides(matchId);
    }

    // Só finaliza ao atingir o total de rounds SE já houver um vencedor
    // definido (scoreA !== scoreB). Empatado no round de corte, a partida
    // continua em prorrogação — o próximo round a decidir já encerra tudo.
    const afterUpdate = store.findMatch(matchId);
    const reachedLimit = newRound >= (afterUpdate.maxRounds || config.MATCH_ROUNDS);
    const isDecided = afterUpdate.scoreA !== afterUpdate.scoreB;
    if (reachedLimit && isDecided) {
      await this.finishMatch(matchId);
    } else if (reachedLimit) {
      this.broadcast('match:overtime', afterUpdate);
    }
  }

  /**
   * Troca de lado — chamada automaticamente no round 3 (Half-Time) OU
   * manualmente pelo operador (botão "Trocar de Lado" na tela Live Match).
   * Usa o MESMO mecanismo de "Iniciar Partida" (recarregar o mapa via
   * RCON cheio) em vez de só alternar o cvar mp_swapteams — isso força
   * todo mundo a reconectar/passar pela tela de escolha de time de novo,
   * o que na prática é mais confiável para garantir que o swap realmente
   * aconteça (mp_swapteams sozinho pode não recolocar todo mundo direito,
   * especialmente com bots do Podbot na sala).
   */
  async _swapSides(matchId) {
    const match = store.findMatch(matchId);
    const newSide = {
      teamA: match.side.teamA === 'CT' ? 'TR' : 'CT',
      teamB: match.side.teamB === 'CT' ? 'TR' : 'CT',
    };
    const updated = store.updateMatch(matchId, { side: newSide });
    this.broadcast('match:side_swap', updated);

    try {
      await serverController.say(
        `Troca de lado! ${updated.teamA.name} agora é ${newSide.teamA} — ${updated.teamB.name} agora é ${newSide.teamB}. Reconectando...`
      );
      await serverController.changeMap(match.map || config.DEFAULT_MAP);
    } catch (err) {
      logger.warn('Falha ao recarregar o mapa na troca de lado:', err.message);
    }
  }

  /**
   * Troca de lado sob demanda do operador, fora do fluxo automático de
   * rounds — não mexe em placar/contagem de round, só inverte os lados e
   * recarrega o servidor. Útil se o operador perceber que o swap
   * automático não "colou" direito e quiser forçar de novo manualmente.
   */
  async manualSwapSides(matchId) {
    const match = store.findMatch(matchId);
    if (!match) throw new Error('Partida não encontrada.');
    if (match.status !== 'live') {
      throw new Error('Só é possível trocar de lado com a partida ao vivo.');
    }
    await this._swapSides(matchId);
    return store.findMatch(matchId);
  }

  /** Finaliza a partida (chamado automaticamente ao decidir o placar, ou manualmente pelo operador). */
  async finishMatch(matchId, { forced = false, reason = null } = {}) {
    const match = store.findMatch(matchId);
    if (!match) throw new Error('Partida não encontrada.');

    store.updateMatch(matchId, { status: 'processing' });
    this.broadcast('match:processing', store.findMatch(matchId));

    // Placar igual (inclusive 0x0, ex.: operador clicou "Finalizar" sem
    // nenhum round registrado) nunca define vencedor — fica null mesmo.
    const winnerId = match.scoreA === match.scoreB
      ? null
      : (match.scoreA > match.scoreB ? match.teamA.id : match.teamB.id);
    const loserId = winnerId
      ? (winnerId === match.teamA.id ? match.teamB.id : match.teamA.id)
      : null;

    const finished = store.updateMatch(matchId, {
      status: 'finished',
      winnerId,
      loserId,
      endedAt: new Date().toISOString(),
      forced,
      forcedReason: reason,
    });

    store.archiveMatch(finished);
    if (winnerId) store.propagateWinner(matchId);

    // Se essa era uma partida de fase de grupos e o grupo inteiro acabou
    // de terminar, calcula a classificação e preenche automaticamente as
    // vagas da próxima fase (semifinal/final) — o operador ainda pode
    // corrigir manualmente depois via "Definir Equipes" se discordar.
    if (finished.isGroup && finished.groupName) {
      const result = store.autoAdvanceGroup(finished.groupName);
      if (result?.unresolvedTie) {
        logger.warn(`Empate não resolvido automaticamente na classificação de "${finished.groupName}" — confira manualmente em Matches.`);
      }
    }

    try {
      await serverController.say(
        winnerId
          ? `Vencedor: ${winnerId === match.teamA.id ? match.teamA.name : match.teamB.name} (${match.scoreA} x ${match.scoreB})`
          : 'Partida encerrada.'
      );
      // Recarrega o servidor assim que o resultado é decidido — mesma
      // recarga usada no "Iniciar Partida" e na troca de lado, deixando o
      // servidor pronto (todo mundo na tela de escolha de time) para a
      // próxima partida, sem esperar o clique em "Avançar".
      await serverController.changeMap(match.map || config.DEFAULT_MAP);
    } catch (err) { /* ignora falha de RCON aqui */ }

    this.broadcast('match:finished', finished);
    return finished;
  }

  /**
   * Operador confirma o resultado e libera a próxima partida da fila. O
   * servidor de jogo já foi recarregado em finishMatch() — aqui só damos
   * um sv_restart leve como garantia extra (barato, não tem efeito ruim
   * mesmo se o mapa já estiver limpo).
   */
  async advanceTournament() {
    try {
      await serverController.restartRound(1);
    } catch (err) {
      logger.warn('Falha ao reiniciar o round do servidor ao avançar:', err.message);
    }
    const next = store.advanceToNextMatch();
    this.broadcast('tournament:advanced', next);
    return next;
  }
}

module.exports = new MatchController();

