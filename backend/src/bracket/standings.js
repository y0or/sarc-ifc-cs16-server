/**
 * Cálculo de classificação de grupo (fase de grupos — cenários de 3 e 6
 * equipes), seguindo os critérios de desempate do regulamento SARC, na
 * ordem exata do documento:
 *   1. Número de vitórias
 *   2. Saldo de rounds
 *   3. Confronto direto (se o empate for entre exatamente 2 equipes que já
 *      se enfrentaram no grupo)
 *   4. Sorteio — isso o sistema NÃO decide sozinho; fica marcado como
 *      "empate não resolvido" para o operador decidir manualmente (botão
 *      "Definir Equipes"), já que sorteio ao vivo é uma decisão do evento.
 */

/**
 * @param {Array} matches - todas as partidas do bracket (bracket.matches)
 * @param {string} groupName - nome do grupo (ex.: "Grupo A", "Grupo Único")
 * @param {string[]} teamIds - ids das equipes que pertencem a esse grupo
 * @returns {{ standings: Array, allFinished: boolean, unresolvedTie: boolean }}
 */
function computeGroupStandings(matches, groupName, teamIds) {
  const groupMatches = matches.filter(m => m.isGroup && m.groupName === groupName);
  const allFinished = groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished');

  const table = {};
  for (const id of teamIds) {
    table[id] = { id, name: null, tag: null, wins: 0, losses: 0, roundsFor: 0, roundsAgainst: 0 };
  }

  // Preenche nome/tag mesmo antes de terminar (qualquer partida que referencie o time).
  for (const m of groupMatches) {
    for (const t of [m.teamA, m.teamB]) {
      if (t && table[t.id] && !table[t.id].name) { table[t.id].name = t.name; table[t.id].tag = t.tag; }
    }
  }

  // Resultados diretos entre pares (para o critério de confronto direto).
  const headToHead = {}; // `${idA}|${idB}` -> winnerId

  for (const m of groupMatches) {
    if (m.status !== 'finished' || !m.teamA || !m.teamB) continue;
    const a = table[m.teamA.id];
    const b = table[m.teamB.id];
    if (a) { a.roundsFor += m.scoreA; a.roundsAgainst += m.scoreB; }
    if (b) { b.roundsFor += m.scoreB; b.roundsAgainst += m.scoreA; }
    if (m.winnerId) {
      if (table[m.winnerId]) table[m.winnerId].wins += 1;
      const loserId = m.winnerId === m.teamA.id ? m.teamB.id : m.teamA.id;
      if (table[loserId]) table[loserId].losses += 1;
      headToHead[`${m.teamA.id}|${m.teamB.id}`] = m.winnerId;
      headToHead[`${m.teamB.id}|${m.teamA.id}`] = m.winnerId;
    }
  }

  const rows = Object.values(table).filter(t => t.name);

  rows.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    const diffX = x.roundsFor - x.roundsAgainst;
    const diffY = y.roundsFor - y.roundsAgainst;
    if (diffY !== diffX) return diffY - diffX;
    // Confronto direto só decide quando o empate é exatamente entre 2 times.
    const winner = headToHead[`${x.id}|${y.id}`];
    if (winner === x.id) return -1;
    if (winner === y.id) return 1;
    return 0; // empate não resolvido automaticamente
  });

  // Detecta se sobrou empate real (mesmo V e saldo) na fronteira de
  // classificação — usado pra avisar o operador que talvez precise conferir.
  let unresolvedTie = false;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    const sameRecord = a.wins === b.wins && (a.roundsFor - a.roundsAgainst) === (b.roundsFor - b.roundsAgainst);
    if (sameRecord && !headToHead[`${a.id}|${b.id}`]) { unresolvedTie = true; break; }
  }

  return { standings: rows, allFinished, unresolvedTie };
}

module.exports = { computeGroupStandings };
