import { api } from '../api.js';
import { el, toast, statusPill, formatTeam, withLoading, makeSeqGuard } from '../ui.js';

export async function renderLive(root) {
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-title' }, 'Live Match'),
    el('div', { class: 'page-sub' }, 'Controle da partida em andamento — 3x3, 6 rounds (3x CT · troca de lado · 3x TR)'),
  ]));

  const body = el('div');
  root.appendChild(body);

  const guard = makeSeqGuard();

  async function load() {
    const seq = guard.start();
    let data;
    try {
      data = await api.currentMatch();
    } catch (err) {
      if (guard.isCurrent(seq)) toast(err.message, 'error');
      return;
    }
    if (!guard.isCurrent(seq)) return; // uma chamada mais nova já assumiu

    body.innerHTML = '';
    const match = data.match;

    if (!match) {
      body.appendChild(el('div', { class: 'empty-state' }, 'Torneio finalizado ou chaveamento ainda não sorteado.'));
      return;
    }

    const card = el('div', { class: 'card', style: 'max-width:720px' });
    const maxRounds = match.maxRounds || 6;
    const isOvertime = match.currentRound >= maxRounds && match.status === 'live';

    card.appendChild(el('div', { class: 'flex-between' }, [
      el('div', { class: 'card-label' }, match.label),
      el('div', { class: 'gap-8' }, [
        isOvertime ? el('span', { class: 'pill', style: 'color:var(--warn);border-color:#6b5620' }, 'Prorrogação — empate') : null,
        statusPill(match.status),
      ]),
    ]));

    const teamsRow = el('div', { class: 'grid grid-2', style: 'margin:16px 0' });
    teamsRow.appendChild(teamBlock(match.teamA, match.scoreA, match.side?.teamA));
    teamsRow.appendChild(teamBlock(match.teamB, match.scoreB, match.side?.teamB));
    card.appendChild(teamsRow);

    // barra de progresso dos rounds regulamentares (não estoura em prorrogação)
    const progress = el('div', { class: 'progress-bar' });
    for (let i = 0; i < maxRounds; i++) {
      progress.appendChild(el('div', { class: `progress-seg ${i < Math.min(match.currentRound, maxRounds) ? 'filled' : ''}` }));
    }
    card.appendChild(el('div', { class: 'text-dim', style: 'font-size:11px;margin-bottom:4px' },
      `Round ${match.currentRound} / ${maxRounds}${isOvertime ? ' (prorrogação em andamento)' : ''}`));
    card.appendChild(progress);

    card.appendChild(el('div', { class: 'text-dim', style: 'margin-top:12px' }, `Mapa: ${match.map || '—'}`));

    // Pontuação manual — sempre disponível durante a partida ao vivo, como
    // alternativa confiável à detecção automática via log (que depende do
    // formato exato de log do seu servidor).
    if (match.status === 'live') {
      card.appendChild(el('div', { class: 'section-title', style: 'margin-top:24px;margin-bottom:8px' }, 'Registrar Round'));
      card.appendChild(el('div', { class: 'text-dim', style: 'font-size:12px;margin-bottom:12px' },
        'Clique em quem venceu o round. Troca de lado e fim de partida acontecem automaticamente no momento certo.'));
      const roundButtons = el('div', { class: 'grid grid-2' }, [
        el('button', {
          class: 'btn block', onclick: (e) => withLoading(e.target, async () => {
            try { await api.roundWin(match.id, match.side.teamA); await load(); }
            catch (err) { toast(err.message, 'error'); }
          }),
        }, `${match.teamA?.name || 'Equipe A'} venceu o round`),
        el('button', {
          class: 'btn block', onclick: (e) => withLoading(e.target, async () => {
            try { await api.roundWin(match.id, match.side.teamB); await load(); }
            catch (err) { toast(err.message, 'error'); }
          }),
        }, `${match.teamB?.name || 'Equipe B'} venceu o round`),
      ]);
      card.appendChild(roundButtons);

      card.appendChild(el('button', {
        class: 'btn secondary block', style: 'margin-top:12px',
        onclick: (e) => withLoading(e.target, async () => {
          if (!confirm('Trocar de lado agora? Isso recarrega o servidor — todo mundo reconecta e volta pra tela de escolha de time.')) return;
          try {
            await api.swapSides(match.id);
            toast('Lados trocados — servidor recarregando, todo mundo vai reconectar.');
            await load();
          } catch (err) { toast(err.message, 'error'); }
        }),
      }, '⇄ Trocar de Lado (força reconexão de todos)'));
    }

    const actions = el('div', { class: 'gap-8', style: 'margin-top:20px' });
    if (match.status === 'waiting') {
      actions.appendChild(el('button', {
        class: 'btn', onclick: (e) => withLoading(e.target, async () => {
          try { await api.startMatch(match.id); toast('Partida iniciada — servidor preparado.'); await load(); }
          catch (err) { toast(err.message, 'error'); }
        }),
      }, 'Iniciar Partida'));
    }
    if (match.status === 'live') {
      actions.appendChild(el('button', {
        class: 'btn danger', onclick: (e) => withLoading(e.target, async () => {
          if (!confirm('Encerrar a partida agora (abandono/regra interna)? Isso NÃO define vencedor automaticamente se o placar estiver empatado.')) return;
          try { await api.finishMatch(match.id); toast('Partida encerrada.'); await load(); }
          catch (err) { toast(err.message, 'error'); }
        }),
      }, 'Finalizar Partida'));
    }
    if (match.status === 'finished') {
      actions.appendChild(el('button', {
        class: 'btn', onclick: (e) => withLoading(e.target, async () => {
          try {
            await api.advance();
            toast('Avançando para a próxima partida — servidor de jogo reiniciado.');
            await load();
          }
          catch (err) { toast(err.message, 'error'); }
        }),
      }, 'Avançar Para Próxima Equipe'));
    }
    card.appendChild(actions);
    body.appendChild(card);
  }

  function teamBlock(team, score, side) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'flex-between' }, [
        el('div', {}, formatTeam(team)),
        side ? el('span', { class: `side-tag ${side}` }, side) : null,
      ]),
      el('div', { class: 'card-value', style: 'margin-top:8px' }, String(score ?? 0)),
    ]);
  }

  await load();
  return { onEvent: load };
}
