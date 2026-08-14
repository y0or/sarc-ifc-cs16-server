import { api } from '../api.js';
import { el, toast, withLoading, formatTeam, makeSeqGuard } from '../ui.js';

export async function renderTournament(root) {
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-title' }, 'Tournament'),
    el('div', { class: 'page-sub' }, 'Cadastro de equipes, sorteio e controle do campeonato'),
  ]));

  const actionsBar = el('div', { class: 'card', style: 'margin-bottom:20px' });
  const teamsSection = el('div');
  root.appendChild(actionsBar);
  root.appendChild(teamsSection);

  const guard = makeSeqGuard();

  async function load() {
    const seq = guard.start();
    const { tournament } = await api.tournament();
    const { teams } = await api.listTeams();
    if (!guard.isCurrent(seq)) return; // uma chamada mais nova já assumiu

    actionsBar.innerHTML = '';
    actionsBar.appendChild(el('div', { class: 'flex-between' }, [
      el('div', {}, [
        el('div', { class: 'card-label' }, 'Status do Torneio'),
        el('div', { class: 'card-value small' }, labelForStatus(tournament.status)),
      ]),
      el('div', { class: 'gap-8' }, [
        tournament.status === 'registration'
          ? el('button', {
              class: 'btn', onclick: (e) => withLoading(e.target, async () => {
                try { await api.draw(); toast('Chaveamento sorteado com sucesso!'); await load(); }
                catch (err) { toast(err.message + (err.details?.length ? ': ' + err.details.join(' ') : ''), 'error'); }
              }),
            }, 'Sortear Chaveamento')
          : null,
        tournament.status === 'drawn'
          ? el('button', {
              class: 'btn', onclick: (e) => withLoading(e.target, async () => {
                try { await api.startTournament(); toast('Campeonato iniciado!'); await load(); }
                catch (err) { toast(err.message, 'error'); }
              }),
            }, 'Iniciar Campeonato')
          : null,
        el('button', {
          class: 'btn danger', onclick: async (e) => {
            if (!confirm('Isso vai reiniciar TODO o torneio (equipes e chaveamento). Confirma?')) return;
            await withLoading(e.target, async () => {
              await api.resetTournament();
              toast('Torneio reiniciado.');
              await load();
            });
          },
        }, 'Reiniciar Estado'),
      ]),
    ]));

    teamsSection.innerHTML = '';
    teamsSection.appendChild(el('div', { class: 'section-title' }, `Equipes Cadastradas (${teams.length}/8)`));

    if (tournament.status === 'registration') {
      teamsSection.appendChild(renderTeamForm(load));
    }

    const table = el('table');
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', {}, 'Nome'), el('th', {}, 'Tag'), el('th', {}, 'Jogadores'), el('th', {}, ''),
    ])));
    const tbody = el('tbody');
    if (teams.length === 0) {
      tbody.appendChild(el('tr', {}, el('td', { colspan: '4', class: 'empty-state' }, 'Nenhuma equipe cadastrada ainda.')));
    }
    for (const t of teams) {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, t.name),
        el('td', {}, t.tag),
        el('td', {}, t.players.map(p => p.nick).join(', ')),
        el('td', {}, tournament.status === 'registration'
          ? el('button', {
              class: 'btn danger', onclick: async (e) => withLoading(e.target, async () => {
                await api.removeTeam(t.id); toast('Equipe removida.'); await load();
              }),
            }, 'Remover')
          : ''),
      ]));
    }
    table.appendChild(tbody);
    teamsSection.appendChild(table);
  }

  function labelForStatus(status) {
    return {
      registration: 'Cadastro de Equipes (aberto)',
      drawn: 'Chaveamento Sorteado — pronto para iniciar',
      in_progress: 'Campeonato em Andamento',
      finished: 'Campeonato Finalizado',
    }[status] || status;
  }

  function renderTeamForm(onSaved) {
    const wrap = el('div', { class: 'card', style: 'margin-bottom:20px; max-width:520px' });
    wrap.appendChild(el('div', { class: 'card-label' }, 'Cadastrar Nova Equipe'));

    const nameInput = el('input', { type: 'text', placeholder: 'Nome da equipe' });
    const tagInput = el('input', { type: 'text', placeholder: 'Tag (ex: ATX)' });
    const p1 = el('input', { type: 'text', placeholder: 'Jogador 1 (ex: [ATX-KYOSHY])' });
    const p2 = el('input', { type: 'text', placeholder: 'Jogador 2' });
    const p3 = el('input', { type: 'text', placeholder: 'Jogador 3' });
    const errBox = el('ul', { class: 'error-list' });

    wrap.appendChild(el('div', { class: 'form-group' }, [el('label', {}, 'Nome'), nameInput]));
    wrap.appendChild(el('div', { class: 'form-group' }, [el('label', {}, 'Tag'), tagInput]));
    wrap.appendChild(el('div', { class: 'form-group' }, [el('label', {}, 'Jogador 1'), p1]));
    wrap.appendChild(el('div', { class: 'form-group' }, [el('label', {}, 'Jogador 2'), p2]));
    wrap.appendChild(el('div', { class: 'form-group' }, [el('label', {}, 'Jogador 3'), p3]));
    wrap.appendChild(errBox);

    wrap.appendChild(el('button', {
      class: 'btn block', onclick: async (e) => withLoading(e.target, async () => {
        errBox.innerHTML = '';
        try {
          await api.addTeam({
            name: nameInput.value, tag: tagInput.value,
            players: [p1.value, p2.value, p3.value],
          });
          nameInput.value = tagInput.value = p1.value = p2.value = p3.value = '';
          toast('Equipe cadastrada!');
          await onSaved();
        } catch (err) {
          for (const d of (err.details || [err.message])) {
            errBox.appendChild(el('li', {}, d));
          }
        }
      }),
    }, 'Cadastrar Equipe'));

    return wrap;
  }

  await load();
  return { onEvent: load };
}
