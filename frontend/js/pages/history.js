import { api } from '../api.js';
import { el, toast, formatTeam, makeSeqGuard } from '../ui.js';

export async function renderHistory(root) {
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-title' }, 'History'),
    el('div', { class: 'page-sub' }, 'Partidas finalizadas e exportação de resultados'),
  ]));

  const list = el('div');
  root.appendChild(list);

  const guard = makeSeqGuard();

  async function load() {
    const seq = guard.start();
    try {
      const { history } = await api.history();
      if (!guard.isCurrent(seq)) return; // uma chamada mais nova já assumiu

      list.innerHTML = '';
      if (!history.length) {
        list.appendChild(el('div', { class: 'empty-state' }, 'Nenhuma partida finalizada ainda.'));
        return;
      }
      for (const m of history.slice().reverse()) {
        const winnerName = m.winnerId === m.teamA?.id ? m.teamA?.name : m.teamB?.name;
        list.appendChild(el('div', { class: 'match-row' }, [
          el('div', {}, [
            el('div', { class: 'text-dim', style: 'font-size:11px' }, m.label),
            el('div', { class: 'match-teams' }, `${formatTeam(m.teamA)} ${m.scoreA} x ${m.scoreB} ${formatTeam(m.teamB)}`),
            el('div', { class: 'text-dim', style: 'font-size:12px;margin-top:4px' }, winnerName ? `Vencedor: ${winnerName}` : '—'),
          ]),
          el('div', { class: 'gap-8' }, [
            el('a', { href: `/api/matches/${m.id}/download/json`, class: 'btn secondary' }, 'JSON'),
            el('a', { href: `/api/matches/${m.id}/download/xml`, class: 'btn secondary' }, 'XML'),
          ]),
        ]));
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  await load();
  return { onEvent: load };
}
