/**
 * Store central do torneio — a "fonte de verdade operacional".
 *
 * Mantém em memória o estado atual (equipes, bracket, partida ao vivo,
 * histórico) e persiste em disco (JSON) a cada mudança, para sobreviver a
 * reinícios do container.
 *
 * Todo o resto do backend (rotas, parser, rcon) só deve alterar o estado
 * através dos métodos desta classe — nunca manipular os arquivos direto.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const config = require('../utils/config');
const logger = require('../utils/logger');

const TOURNAMENT_FILE = path.join(config.DATA_DIR, 'tournament', 'current.json');
const HISTORY_DIR = path.join(config.DATA_DIR, 'history');

function emptyState() {
  return {
    tournament: {
      id: uuid(),
      name: 'SARC IFC Brusque 2026',
      status: 'registration', // registration -> drawn -> in_progress -> finished
      createdAt: new Date().toISOString(),
      drawnAt: null,
      finishedAt: null,
    },
    teams: [],
    bracket: null, // { matches, feeds, groups, executionOrder, currentMatchIndex }
    server: {
      startedAt: new Date().toISOString(),
    },
  };
}

class Store {
  constructor() {
    this._ensureDirs();
    this.state = this._load();
    this.listeners = new Set();
  }

  _ensureDirs() {
    fs.mkdirSync(path.dirname(TOURNAMENT_FILE), { recursive: true });
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }

  _load() {
    try {
      if (fs.existsSync(TOURNAMENT_FILE)) {
        const raw = fs.readFileSync(TOURNAMENT_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      logger.error('Falha ao carregar estado persistido, iniciando vazio:', err.message);
    }
    return emptyState();
  }

  _persist() {
    fs.writeFileSync(TOURNAMENT_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  /** Registra um listener chamado a cada mudança de estado (usado pelo websocket). */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(eventType, payload) {
    this._persist();
    for (const fn of this.listeners) {
      try { fn(eventType, payload, this.state); } catch (err) { logger.error('listener error', err); }
    }
  }

  getState() {
    return this.state;
  }

  // ---------------------------------------------------------------------
  // Equipes
  // ---------------------------------------------------------------------

  getTeams() {
    return this.state.teams;
  }

  addTeam(team) {
    if (this.state.tournament.status !== 'registration') {
      throw new Error('Não é possível cadastrar equipes após o sorteio do chaveamento.');
    }
    const newTeam = {
      id: uuid(),
      name: String(team.name).trim(),
      tag: String(team.tag).trim().toUpperCase(),
      players: team.players.map(p => ({ nick: (typeof p === 'string' ? p : p.nick).trim() })),
      createdAt: new Date().toISOString(),
    };
    this.state.teams.push(newTeam);
    this._emit('team:added', newTeam);
    return newTeam;
  }

  removeTeam(teamId) {
    if (this.state.tournament.status !== 'registration') {
      throw new Error('Não é possível remover equipes após o sorteio do chaveamento.');
    }
    const before = this.state.teams.length;
    this.state.teams = this.state.teams.filter(t => t.id !== teamId);
    if (this.state.teams.length === before) {
      throw new Error('Equipe não encontrada.');
    }
    this._emit('team:removed', { teamId });
  }

  replaceTeams(teams) {
    if (this.state.tournament.status !== 'registration') {
      throw new Error('Não é possível importar equipes após o sorteio do chaveamento.');
    }
    this.state.teams = teams.map(team => ({
      id: uuid(),
      name: String(team.name).trim(),
      tag: String(team.tag).trim().toUpperCase(),
      players: team.players.map(p => ({ nick: (typeof p === 'string' ? p : p.nick).trim() })),
      createdAt: new Date().toISOString(),
    }));
    this._emit('team:imported', this.state.teams);
    return this.state.teams;
  }

  // ---------------------------------------------------------------------
  // Bracket / Torneio
  // ---------------------------------------------------------------------

  setBracket(bracketData) {
    if (this.state.tournament.status !== 'registration') {
      throw new Error('O chaveamento já foi sorteado para este torneio.');
    }
    this.state.bracket = { ...bracketData, currentMatchIndex: 0 };
    this.state.tournament.status = 'drawn';
    this.state.tournament.drawnAt = new Date().toISOString();
    this._emit('bracket:drawn', this.state.bracket);
    return this.state.bracket;
  }

  getBracket() {
    return this.state.bracket;
  }

  findMatch(matchId) {
    if (!this.state.bracket) return null;
    return this.state.bracket.matches.find(m => m.id === matchId) || null;
  }

  getCurrentMatch() {
    if (!this.state.bracket) return null;
    const { matches, executionOrder, currentMatchIndex } = this.state.bracket;
    const id = executionOrder[currentMatchIndex];
    return matches.find(m => m.id === id) || null;
  }

  getWaitingTeams() {
    if (!this.state.bracket) return [];
    const current = this.getCurrentMatch();
    const playingIds = current ? [current.teamA?.id, current.teamB?.id] : [];
    return this.state.teams.filter(t => !playingIds.includes(t.id));
  }

  updateMatch(matchId, patch) {
    const match = this.findMatch(matchId);
    if (!match) throw new Error('Partida não encontrada.');
    Object.assign(match, patch);
    this._emit('match:updated', match);
    return match;
  }

  /** Propaga o vencedor de uma partida para a próxima fase (via feeds do bracket). */
  propagateWinner(matchId) {
    const match = this.findMatch(matchId);
    const feed = this.state.bracket.feeds[matchId];
    if (!match || !feed) return;
    const nextMatch = this.findMatch(feed.nextMatchId);
    if (!nextMatch) return;
    const winnerTeam = match.winnerId === match.teamA?.id ? match.teamA : match.teamB;
    nextMatch[feed.slot] = winnerTeam;
    this._emit('bracket:advanced', nextMatch);
  }

  /**
   * Quando uma partida de GRUPO termina, verifica se aquele grupo inteiro já
   * foi concluído — se sim, calcula a classificação (vitórias, saldo de
   * rounds, confronto direto — critérios do regulamento) e preenche
   * automaticamente as vagas da próxima fase (semifinal ou final) definidas
   * em bracket.groupFeeds. Retorna informações do resultado para o backend
   * poder avisar o operador se sobrou empate não resolvido.
   */
  autoAdvanceGroup(groupName) {
    const bracket = this.state.bracket;
    if (!bracket || !bracket.groupFeeds || !bracket.groupFeeds[groupName]) return null;
    if (!bracket.groups || !bracket.groups[groupName]) return null;

    const { computeGroupStandings } = require('../bracket/standings');
    const { standings, allFinished, unresolvedTie } = computeGroupStandings(
      bracket.matches, groupName, bracket.groups[groupName]
    );
    if (!allFinished) return null;

    const feedsForGroup = bracket.groupFeeds[groupName];
    const filledMatches = [];
    for (const feed of feedsForGroup) {
      const team = standings[feed.rank - 1];
      if (!team) continue;
      const nextMatch = this.findMatch(feed.nextMatchId);
      if (!nextMatch) continue;
      // Só preenche automaticamente se a vaga ainda não tiver sido definida
      // manualmente pelo operador (não sobrescreve uma correção manual).
      if (nextMatch[feed.slot] && nextMatch[feed.slot].id) continue;
      nextMatch[feed.slot] = { id: team.id, name: team.name, tag: team.tag };
      filledMatches.push(nextMatch);
    }
    if (filledMatches.length) {
      this._emit('bracket:group_advanced', { groupName, standings, filledMatches, unresolvedTie });
    }
    return { standings, unresolvedTie, filledMatches };
  }

  /** Avança o ponteiro de execução para a próxima partida da fila. */
  advanceToNextMatch() {
    if (!this.state.bracket) throw new Error('Bracket não definido.');
    this.state.bracket.currentMatchIndex += 1;
    const next = this.getCurrentMatch();
    this._emit('match:advanced', next);
    if (!next) {
      this.state.tournament.status = 'finished';
      this.state.tournament.finishedAt = new Date().toISOString();
      this._emit('tournament:finished', this.state.tournament);
    }
    return next;
  }

  startTournament() {
    if (this.state.tournament.status !== 'drawn') {
      throw new Error('O torneio precisa ter o chaveamento sorteado antes de iniciar.');
    }
    this.state.tournament.status = 'in_progress';
    this._emit('tournament:started', this.state.tournament);
  }

  archiveMatch(match) {
    const file = path.join(HISTORY_DIR, `${match.id}.json`);
    fs.writeFileSync(file, JSON.stringify(match, null, 2), 'utf-8');
  }

  getHistory() {
    if (!this.state.bracket) return [];
    return this.state.bracket.matches.filter(m => m.status === 'finished');
  }

  /** Reinicia completamente o torneio (novo id, sem equipes nem bracket). */
  reset() {
    this.state = emptyState();
    this._emit('tournament:reset', this.state);
  }
}

module.exports = new Store();
