import { api } from '../api.js';
import { el, toast, makeSeqGuard } from '../ui.js';

const ROUND_LABELS = { QF: 'Quartas de Final', SF: 'Semifinal', F: 'Final', GROUP: 'Fase de Grupos' };
const ROUND_ICONS = { QF: '◆', SF: '◆◆', F: '★', GROUP: '⊞' };

export async function renderBracket(root) {
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-title' }, 'Bracket View'),
    el('div', { class: 'page-sub' }, 'Chaveamento atual do torneio (somente leitura)'),
  ]));

  const wrap = el('div');
  root.appendChild(wrap);

  function teamStandings(bracket, groupName) {
    // Calcula classificação (vitórias, saldo de rounds) a partir dos jogos
    // de grupo já finalizados — o motor de bracket não decide isso sozinho,
    // então isso é só para o operador visualizar/conferir a classificação.
    const teamIds = bracket.groups[groupName];
    const table = {};
    for (const id of teamIds) table[id] = { wins: 0, losses: 0, roundsFor: 0, roundsAgainst: 0, name: null, tag: null };

    for (const m of bracket.matches) {
      if (!m.isGroup || m.groupName !== groupName || m.status !== 'finished') continue;
      if (!m.teamA || !m.teamB) continue;
      const a = table[m.teamA.id]; const b = table[m.teamB.id];
      if (a) { a.name = m.teamA.name; a.tag = m.teamA.tag; a.roundsFor += m.scoreA; a.roundsAgainst += m.scoreB; }
      if (b) { b.name = m.teamB.name; b.tag = m.teamB.tag; b.roundsFor += m.scoreB; b.roundsAgainst += m.scoreA; }
      if (m.winnerId && table[m.winnerId]) table[m.winnerId].wins += 1;
      const loserId = m.winnerId === m.teamA.id ? m.teamB.id : m.teamA.id;
      if (table[loserId]) table[loserId].losses += 1;
    }

    // Preenche nome/tag mesmo sem partidas finalizadas ainda (via qualquer
    // partida do grupo, finalizada ou não, que referencie o time).
    for (const m of bracket.matches) {
      if (!m.isGroup || m.groupName !== groupName) continue;
      for (const t of [m.teamA, m.teamB]) {
        if (t && table[t.id] && !table[t.id].name) { table[t.id].name = t.name; table[t.id].tag = t.tag; }
      }
    }

    return Object.values(table)
      .filter(t => t.name)
      .sort((x, y) => (y.wins - x.wins) || ((y.roundsFor - y.roundsAgainst) - (x.roundsFor - x.roundsAgainst)));
  }

  function standingsTable(bracket, groupName) {
    const rows = teamStandings(bracket, groupName);
    const table = el('table', { style: 'margin-top:8px' });
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', {}, '#'), el('th', {}, 'Equipe'), el('th', {}, 'V'), el('th', {}, 'D'), el('th', {}, 'Saldo'),
    ])));
    const tbody = el('tbody');
    rows.forEach((r, i) => {
      tbody.appendChild(el('tr', {}, [
        el('td', { class: i < 2 ? 'text-dim' : 'text-dim', style: i < 2 ? 'color:var(--green)' : '' }, String(i + 1)),
        el('td', { style: i < 2 ? 'color:var(--green);font-weight:700' : '' }, `${r.name} [${r.tag}]`),
        el('td', {}, String(r.wins)),
        el('td', {}, String(r.losses)),
        el('td', {}, (r.roundsFor - r.roundsAgainst >= 0 ? '+' : '') + (r.roundsFor - r.roundsAgainst)),
      ]));
    });
    return el('div', { class: 'card', style: 'min-width:280px' }, [
      el('div', { class: 'card-label' }, `Classificação — ${groupName}`),
      table,
      el('div', { class: 'text-dim', style: 'font-size:11px;margin-top:8px' }, 'Os 2 primeiros avançam (defina manualmente em Matches).'),
    ]);
  }

  function teamRow(team, score, isWinner, isFinished) {
    return el('div', { class: `bracket-team-row ${isWinner ? 'winner' : ''}` }, [
      el('span', { class: 'bracket-team-name' }, team ? `${team.name}` : 'A definir'),
      team ? el('span', { class: 'bracket-team-tag' }, team.tag) : null,
      el('span', { class: 'bracket-team-score' }, isFinished || score > 0 ? String(score ?? 0) : (team ? '0' : '')),
    ]);
  }

  function matchCard(m) {
    const isFinished = m.status === 'finished';
    const winnerIsA = isFinished && m.winnerId === m.teamA?.id;
    const winnerIsB = isFinished && m.winnerId === m.teamB?.id;
    const statusLabel = { waiting: 'Aguardando', preparing: 'Preparando', live: '● Ao vivo', processing: 'Processando', finished: '✔ Finalizada' }[m.status];
    return el('div', { class: `bracket-card ${m.status}` }, [
      el('div', { class: 'bracket-card-head' }, [
        el('span', { class: 'bracket-card-label' }, m.label),
        el('span', { class: `bracket-card-status ${m.status}` }, statusLabel),
      ]),
      teamRow(m.teamA, m.scoreA, winnerIsA, isFinished),
      teamRow(m.teamB, m.scoreB, winnerIsB, isFinished),
    ]);
  }

  const guard = makeSeqGuard();

  async function load() {
    const seq = guard.start();
    let bracket;
    try {
      const res = await api.bracket();
      bracket = res.bracket;
    } catch (err) {
      if (guard.isCurrent(seq)) toast(err.message, 'error');
      return;
    }
    if (!guard.isCurrent(seq)) return; // uma chamada mais nova já assumiu

    wrap.innerHTML = '';
    if (!bracket) {
      wrap.appendChild(el('div', { class: 'empty-state' }, 'Chaveamento ainda não sorteado. Vá em Tournament e clique em "Sortear Chaveamento".'));
      return;
    }

    const byRound = {};
    for (const m of bracket.matches) {
      byRound[m.round] = byRound[m.round] || [];
      byRound[m.round].push(m);
    }

    // --- Classificação dos grupos (quando aplicável) ------------------
    if (bracket.groups) {
      const standingsWrap = el('div', { class: 'grid grid-2', style: 'margin-bottom:24px; align-items:start' });
      for (const groupName of Object.keys(bracket.groups)) {
        standingsWrap.appendChild(standingsTable(bracket, groupName));
      }
      wrap.appendChild(standingsWrap);
    }

    if (bracket.pendingGroupStage) {
      const groupMatches = bracket.matches.filter(m => m.isGroup);
      const allGroupsFinished = groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished');
      // Partidas de fase seguinte (SF/Final) que dependem de grupo e ainda
      // não têm as duas equipes definidas mesmo com os grupos já acabados
      // — sinal de empate que a classificação automática não resolveu.
      const stuckMatches = bracket.matches.filter(m => !m.isGroup && (!m.teamA || !m.teamB));

      if (allGroupsFinished && stuckMatches.length) {
        wrap.appendChild(el('div', { class: 'card', style: 'margin-bottom:20px; border-color:#6b5620' }, [
          el('div', { class: 'card-label', style: 'color:var(--warn)' }, '⚠ Empate não resolvido automaticamente'),
          el('div', { class: 'text-dim' }, 'A classificação (veja acima) ficou empatada em critérios que o sistema não decide sozinho (sorteio). Defina manualmente quem avança na tela Matches, botão "Definir Equipes".'),
        ]));
      } else if (!allGroupsFinished) {
        wrap.appendChild(el('div', { class: 'card', style: 'margin-bottom:20px' }, [
          el('div', { class: 'card-label' }, 'Fase de Grupos em Andamento'),
          el('div', { class: 'text-dim' }, 'Assim que todos os jogos do grupo terminarem, os classificados avançam automaticamente para a próxima fase. Se algo parecer errado, dá pra corrigir manualmente na tela Matches, botão "Definir Equipes".'),
        ]));
      }
    }

    // --- Árvore do chaveamento ------------------------------------------
    const order = ['GROUP', 'QF', 'SF', 'F'].filter(r => byRound[r]);
    const bracketWrap = el('div', { class: 'bracket-tree' });

    order.forEach((round, idx) => {
      const col = el('div', { class: 'bracket-tree-col' });
      col.appendChild(el('div', { class: 'bracket-round-header' }, [
        el('span', { class: 'bracket-round-icon' }, ROUND_ICONS[round] || '•'),
        el('span', {}, ROUND_LABELS[round] || round),
      ]));
      const matchesWrap = el('div', { class: 'bracket-tree-matches' });
      for (const m of byRound[round]) matchesWrap.appendChild(matchCard(m));
      col.appendChild(matchesWrap);
      bracketWrap.appendChild(col);

      if (idx < order.length - 1) {
        bracketWrap.appendChild(el('div', { class: 'bracket-connector' }, '➜'));
      }
    });

    wrap.appendChild(bracketWrap);
  }

  await load();
  return { onEvent: load };
}
