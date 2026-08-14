import { api } from '../api.js';
import { el, toast, statusPill, formatTeam, makeSeqGuard } from '../ui.js';

export async function renderMatchDetail(root, matchId) {
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-header' }, [
    el('a', { href: '#/matches', class: 'text-dim', style: 'font-size:12px' }, '← Voltar para Matches'),
    el('h1', { class: 'page-title', style: 'margin-top:8px' }, 'Match Details'),
  ]));

  const body = el('div');
  root.appendChild(body);

  const guard = makeSeqGuard();

  async function load() {
    const seq = guard.start();
    let match;
    try {
      const res = await api.getMatch(matchId);
      match = res.match;
    } catch (err) {
      if (guard.isCurrent(seq)) {
        toast(err.message, 'error');
        body.innerHTML = '';
        body.appendChild(el('div', { class: 'empty-state' }, 'Partida não encontrada.'));
      }
      return;
    }
    if (!guard.isCurrent(seq)) return; // uma chamada mais nova já assumiu

    body.innerHTML = '';

    const card = el('div', { class: 'card', style: 'max-width:640px' });
    card.appendChild(el('div', { class: 'flex-between' }, [
      el('div', { class: 'card-label' }, match.label),
      statusPill(match.status),
    ]));
    card.appendChild(el('div', { class: 'grid grid-2', style: 'margin:16px 0' }, [
      el('div', {}, [el('div', { class: 'text-dim' }, 'Equipe A'), el('div', { class: 'card-value small' }, formatTeam(match.teamA))]),
      el('div', {}, [el('div', { class: 'text-dim' }, 'Equipe B'), el('div', { class: 'card-value small' }, formatTeam(match.teamB))]),
    ]));
    card.appendChild(el('div', { class: 'card-value' }, `${match.scoreA} x ${match.scoreB}`));
    card.appendChild(el('div', { class: 'text-dim', style: 'margin-top:8px' }, `Mapa: ${match.map || '—'}`));
    card.appendChild(el('div', { class: 'text-dim' }, `Início: ${match.startedAt || '—'}`));
    card.appendChild(el('div', { class: 'text-dim' }, `Fim: ${match.endedAt || '—'}`));

    if (match.status === 'finished') {
      const winner = match.winnerId === match.teamA?.id ? match.teamA : match.teamB;
      card.appendChild(el('div', { class: 'card-value small', style: 'margin-top:12px;color:var(--green)' }, `Vencedor: ${winner?.name || '—'}`));
      card.appendChild(el('div', { class: 'gap-8', style: 'margin-top:16px' }, [
        el('a', { href: `/api/matches/${match.id}/download/json`, class: 'btn secondary' }, 'Download JSON'),
        el('a', { href: `/api/matches/${match.id}/download/xml`, class: 'btn secondary' }, 'Download XML'),
      ]));
    }

    if (match.roundHistory?.length) {
      card.appendChild(el('div', { class: 'section-title' }, 'Histórico de Rounds'));
      for (const r of match.roundHistory) {
        card.appendChild(el('div', { class: 'text-dim', style: 'font-size:12px' }, `Round ${r.round}: vitória ${r.winningSide} (${r.winningTeam})`));
      }
    }

    body.appendChild(card);
  }

  await load();
  return { onEvent: load };
}
