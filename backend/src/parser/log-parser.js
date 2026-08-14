/**
 * Parser de logs nativos do HLDS/ReHLDS (Counter-Strike 1.6).
 *
 * Monitora a pasta de logs (volume compartilhado com o container do jogo) e
 * interpreta, em tempo real, as linhas novas escritas pelo servidor.
 *
 * Formato padrão de log do engine GoldSrc, por exemplo:
 *   L 07/27/2026 - 14:05:12: World triggered "Round_Start"
 *   L 07/27/2026 - 14:05:45: Team "CT" triggered "CTs_Win" (CT "3") (T "2")
 *   L 07/27/2026 - 14:05:45: World triggered "Round_End"
 *   L 07/27/2026 - 14:02:01: "PlayerName<12><STEAM_ID><>" entered the game
 *   L 07/27/2026 - 14:02:03: "PlayerName<12><STEAM_ID><CT>" joined team "CT"
 *   L 07/27/2026 - 14:10:00: Team "CT" triggered "Target_Saved" (CT "1") (T "0")
 *
 * IMPORTANTE: existem VÁRIOS gatilhos de fim de round diferentes dependendo
 * de como o round terminou (eliminação, objetivo, tempo esgotado) — não é só
 * "CTs_Win"/"Terrorists_Win". Um servidor real de de_dust2, por exemplo,
 * frequentemente termina rounds com "Target_Saved" (CT venceu por tempo, sem
 * bomba plantada) ou "Bomb_Defused"/"Target_Bombed". Cobrimos aqui os
 * gatilhos mais comuns em mapas de bomba, reféns e VIP — se o seu servidor
 * usar algum mod com gatilhos customizados, ajuste as listas abaixo.
 */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const logger = require('../utils/logger');

// Gatilhos de vitória do lado CT (Contra-Terrorista).
const CT_WIN_TRIGGERS = [
  'CTs_Win', 'SFUI_Notice_CTs_Win',
  'Bomb_Defused', 'Target_Saved',
  'All_Hostages_Rescued', 'Hostages_Rescued',
  'Escaping_Terrorists_Neutralized', 'Terrorists_Not_Escaped',
  'VIP_Escaped', 'VIP_Not_Escaped',
];
// Gatilhos de vitória do lado TR (Terrorista).
const TR_WIN_TRIGGERS = [
  'Terrorists_Win', 'SFUI_Notice_Terrorists_Win',
  'Target_Bombed', 'Terrorists_Escaped', 'VIP_Assassinated',
];

const PATTERNS = {
  roundStart: /World triggered "Round_Start"/,
  roundEnd: /World triggered "Round_End"/,
  ctWin: new RegExp(`Team "CT" triggered "(${CT_WIN_TRIGGERS.join('|')})"`),
  tWin: new RegExp(`Team "TERRORIST" triggered "(${TR_WIN_TRIGGERS.join('|')})"`),
  matchStart: /World triggered "Match_Start"|Started map/,
  gameOver: /World triggered "Game_Commencing"|Game Over/i,
  playerEntered: /"([^<]+)<\d+><[^>]*><>?" entered the game/,
  playerJoinedTeam: /"([^<]+)<\d+><[^>]*><[^>]*>" joined team "([^"]+)"/,
  playerDisconnected: /"([^<]+)<\d+><[^>]*><[^>]*>" disconnected/,
};

class LogParser extends EventEmitter {
  constructor({ logsDir }) {
    super();
    this.logsDir = logsDir;
    this.watchedFiles = new Map(); // filePath -> byte offset já lido
    this.pollInterval = null;
  }

  start() {
    fs.mkdirSync(this.logsDir, { recursive: true });
    logger.info(`[parser] monitorando ${this.logsDir}`);
    this._scanForNewFiles();
    // Polling simples (mais confiável que fs.watch em volumes montados/Docker
    // Desktop em algumas plataformas, onde eventos de FS nativos não chegam).
    this.pollInterval = setInterval(() => {
      this._scanForNewFiles();
      for (const filePath of this.watchedFiles.keys()) {
        this._readNewLines(filePath);
      }
    }, 1000);
  }

  stop() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  _scanForNewFiles() {
    let files = [];
    try {
      files = fs.readdirSync(this.logsDir).filter(f => f.toLowerCase().endsWith('.log'));
    } catch (err) {
      return;
    }
    for (const f of files) {
      const fullPath = path.join(this.logsDir, f);
      if (!this.watchedFiles.has(fullPath)) {
        this.watchedFiles.set(fullPath, 0);
        logger.info(`[parser] novo arquivo de log detectado: ${f}`);
      }
    }
  }

  _readNewLines(filePath) {
    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch (err) {
      return; // arquivo pode ter sido rotacionado/removido
    }
    const lastOffset = this.watchedFiles.get(filePath) || 0;
    if (stats.size <= lastOffset) return;

    const stream = fs.createReadStream(filePath, { start: lastOffset, end: stats.size - 1, encoding: 'utf-8' });
    let buffer = '';
    stream.on('data', chunk => { buffer += chunk; });
    stream.on('end', () => {
      this.watchedFiles.set(filePath, stats.size);
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      for (const line of lines) this._parseLine(line);
    });
    stream.on('error', err => logger.error('[parser] erro lendo log:', err.message));
  }

  _parseLine(line) {
    this.emit('raw_line', line);

    if (PATTERNS.roundStart.test(line)) {
      this.emit('round_start', { line });
      return;
    }
    if (PATTERNS.ctWin.test(line)) {
      this.emit('round_win', { side: 'CT', line });
      return;
    }
    if (PATTERNS.tWin.test(line)) {
      this.emit('round_win', { side: 'TR', line });
      return;
    }
    if (PATTERNS.roundEnd.test(line)) {
      this.emit('round_end', { line });
      return;
    }
    if (PATTERNS.matchStart.test(line)) {
      this.emit('match_start', { line });
      return;
    }

    const enteredMatch = line.match(PATTERNS.playerEntered);
    if (enteredMatch) {
      this.emit('player_entered', { nick: enteredMatch[1], line });
      return;
    }

    const joinedMatch = line.match(PATTERNS.playerJoinedTeam);
    if (joinedMatch) {
      this.emit('player_joined_team', { nick: joinedMatch[1], team: joinedMatch[2], line });
      return;
    }

    const discMatch = line.match(PATTERNS.playerDisconnected);
    if (discMatch) {
      this.emit('player_disconnected', { nick: discMatch[1], line });
      return;
    }
  }
}

module.exports = { LogParser, PATTERNS };
