import { api } from '../api.js';
import { el, toast, makeSeqGuard } from '../ui.js';

export async function renderDashboard(root) {
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-title' }, 'Dashboard'),
    el('div', { class: 'page-sub' }, 'Visão geral do servidor em tempo real'),
  ]));

  const statusRow = el('div', { class: 'grid grid-3', style: 'margin-bottom:16px' });
  const cardsRow = el('div', { class: 'grid grid-4', style: 'margin-bottom:16px' });
  const midRow = el('div', { class: 'grid grid-3', style: 'margin-bottom:16px' });
  const lastResultCard = el('div', { class: 'card' });

  root.appendChild(statusRow);
  root.appendChild(cardsRow);
  root.appendChild(midRow);
  root.appendChild(lastResultCard);

  const guard = makeSeqGuard();

  async function load() {
    const seq = guard.start();
    try {
      const [status, dash] = await Promise.all([api.status(), api.dashboard()]);
      if (!guard.isCurrent(seq)) return; // uma chamada mais nova já assumiu

      statusRow.innerHTML = '';
      const svc = [
        ['Servidor', status.server], ['Parser', status.parser], ['API', status.api],
      ];
      for (const [label, value] of svc) {
        statusRow.appendChild(el('div', { class: 'card status-row' }, [
          el('span', {}, [el('span', { class: `dot ${value === 'online' ? 'online' : 'offline'}` }), label]),
          el('span', { class: `badge ${value === 'online' ? 'online' : ''}` }, value.toUpperCase()),
        ]));
      }

      cardsRow.innerHTML = '';
      const cards = [
        ['Tempo Ligado', dash.uptime],
        ['CPU', `${dash.cpuLoadPercent}%`],
        ['RAM', `${dash.ramUsedMB} MB`],
        ['Jogadores Conectados', dash.playersConnected],
      ];
      for (const [label, value] of cards) {
        cardsRow.appendChild(el('div', { class: 'card' }, [
          el('div', { class: 'card-label' }, label),
          el('div', { class: 'card-value' }, String(value)),
        ]));
      }

      midRow.innerHTML = '';
      midRow.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'card-label' }, 'Fase Atual'),
        el('div', { class: 'card-value small' }, dash.phase || '—'),
      ]));
      midRow.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'card-label' }, 'Mapa Atual'),
        el('div', { class: 'card-value small' }, dash.currentMap || '—'),
      ]));
      midRow.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'card-label' }, 'Partidas Concluídas'),
        el('div', { class: 'card-value' }, String(dash.matchesCompleted)),
      ]));

      lastResultCard.innerHTML = '';
      lastResultCard.appendChild(el('div', { class: 'card-label' }, 'Último Resultado'));
      if (dash.lastResult) {
        const r = dash.lastResult;
        lastResultCard.appendChild(el('div', { class: 'card-value small' },
          `${r.teamA?.name} ${r.scoreA} x ${r.scoreB} ${r.teamB?.name}`));
      } else {
        lastResultCard.appendChild(el('div', { class: 'card-value small', style: 'color:var(--text-dim)' }, 'Nenhuma partida finalizada ainda'));
      }

      // Equipes aguardando / jogando agora
      root.querySelectorAll('.dyn-waiting').forEach(n => n.remove());
      const waitingBlock = el('div', { class: 'dyn-waiting' });
      waitingBlock.appendChild(el('div', { class: 'section-title' }, 'Fila de Equipes'));
      const grid = el('div', { class: 'grid grid-2' });
      grid.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'card-label' }, 'Jogando Agora'),
        dash.currentMatch
          ? el('div', { class: 'card-value small' }, `${dash.currentMatch.teamA?.name || '?'} x ${dash.currentMatch.teamB?.name || '?'}`)
          : el('div', { class: 'text-dim' }, 'Nenhuma partida em andamento'),
      ]));
      grid.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'card-label' }, 'Aguardando'),
        dash.waitingTeams.length
          ? el('div', {}, dash.waitingTeams.map(t => el('div', { class: 'text-dim' }, `${t.name} [${t.tag}]`)))
          : el('div', { class: 'text-dim' }, 'Nenhuma equipe aguardando'),
      ]));
      waitingBlock.appendChild(grid);
      root.appendChild(waitingBlock);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  await load();
  return { onEvent: load };
}
