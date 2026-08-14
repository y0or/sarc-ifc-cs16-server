import { api } from '../api.js';
import { el, toast, statusPill, formatTeam, makeSeqGuard } from '../ui.js';

export async function renderMatches(root) {
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-title' }, 'Matches'),
    el('div', { class: 'page-sub' }, 'Todas as partidas do chaveamento'),
  ]));

  const list = el('div');
  root.appendChild(list);

  const guard = makeSeqGuard();

  async function load() {
    const seq = guard.start();
    let matches = [];
    try {
      const res = await api.listMatches();
      matches = res.matches;
    } catch (err) {
      if (guard.isCurrent(seq)) toast(err.message, 'error');
    }
    if (!guard.isCurrent(seq)) return; // uma chamada mais nova já assumiu

    list.innerHTML = '';
    if (!matches.length) {
      list.appendChild(el('div', { class: 'empty-state' }, 'Nenhum chaveamento gerado ainda. Vá em Tournament e clique em "Sortear Chaveamento".'));
      return;
    }
    let teamsCache = null;
    for (const m of matches) {
      // Disponível para SF/Final enquanto a partida não começou — mesmo já
      // preenchida automaticamente pela classificação do grupo, o operador
      // pode corrigir manualmente se achar que o cálculo saiu errado.
      const canEditTeams = m.status === 'waiting' && (m.round === 'SF' || m.round === 'F');
      const row = el('div', { class: 'match-row' }, [
        el('div', {}, [
          el('div', { class: 'text-dim', style: 'font-size:11px' }, m.label),
          el('div', { class: 'match-teams' }, [
            el('span', {}, formatTeam(m.teamA)),
            el('span', { class: 'vs' }, 'x'),
            el('span', {}, formatTeam(m.teamB)),
          ]),
        ]),
        el('div', { class: 'match-score' }, `${m.scoreA} - ${m.scoreB}`),
        statusPill(m.status),
        canEditTeams ? el('button', {
          class: 'btn secondary', onclick: async () => {
            if (!teamsCache) teamsCache = (await api.listTeams()).teams;
            const names = teamsCache.map(t => `${t.tag} = ${t.name}`).join('\n');
            const aTag = prompt(`Tag da Equipe A (${m.teamA ? 'já definida: ' + m.teamA.tag : 'definir'}):\n${names}`, m.teamA?.tag || '');
            if (aTag === null) return;
            const bTag = prompt(`Tag da Equipe B (${m.teamB ? 'já definida: ' + m.teamB.tag : 'definir'}):\n${names}`, m.teamB?.tag || '');
            if (bTag === null) return;
            const teamA = teamsCache.find(t => t.tag.toUpperCase() === aTag.trim().toUpperCase());
            const teamB = teamsCache.find(t => t.tag.toUpperCase() === bTag.trim().toUpperCase());
            try {
              await api.setMatchTeams(m.id, teamA?.id, teamB?.id);
              toast('Equipes definidas.');
              await load();
            } catch (err) { toast(err.message, 'error'); }
          },
        }, (m.teamA && m.teamB) ? 'Editar Equipes' : 'Definir Equipes') : null,
        el('a', { href: `#/match/${m.id}`, class: 'btn secondary' }, 'Detalhes'),
      ]);
      list.appendChild(row);
    }
  }

  await load();
  return { onEvent: load };
}
