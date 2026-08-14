import { api } from '../api.js';
import { el, toast, makeSeqGuard } from '../ui.js';

export async function renderPlayers(root) {
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-title' }, 'Players'),
    el('div', { class: 'page-sub' }, 'Jogadores da partida atual'),
  ]));

  const list = el('div');
  root.appendChild(list);

  const guard = makeSeqGuard();

  async function load() {
    const seq = guard.start();
    try {
      const { players } = await api.players();
      if (!guard.isCurrent(seq)) return; // uma chamada mais nova já assumiu

      list.innerHTML = '';
      if (!players.length) {
        list.appendChild(el('div', { class: 'empty-state' }, 'Nenhum jogador na partida atual.'));
        return;
      }
      const card = el('div', { class: 'card', style: 'max-width:600px' });
      for (const p of players) {
        card.appendChild(el('div', { class: 'player-list-item' }, [
          el('span', {}, `${p.nick} — ${p.team} [${p.tag}]`),
          p.side ? el('span', { class: `side-tag ${p.side}` }, p.side) : null,
        ]));
      }
      list.appendChild(card);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  await load();
  return { onEvent: load };
}
