import { api } from '../api.js';
import { el, toast } from '../ui.js';

export async function renderImport(root) {
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-title' }, 'Import JSON'),
    el('div', { class: 'page-sub' }, 'Importar torneio (nome + equipes) via arquivo JSON'),
  ]));

  const card = el('div', { class: 'card', style: 'max-width:560px' });
  card.appendChild(el('div', { class: 'card-label' }, 'Arquivo do torneio (.json)'));
  const fileInput = el('input', { type: 'file', accept: '.json' });
  const errBox = el('ul', { class: 'error-list' });
  card.appendChild(el('div', { class: 'form-group' }, fileInput));
  card.appendChild(errBox);
  card.appendChild(el('button', {
    class: 'btn block', onclick: async (e) => {
      errBox.innerHTML = '';
      const file = fileInput.files[0];
      if (!file) { toast('Selecione um arquivo JSON.', 'error'); return; }
      try {
        await api.importTournamentFile(file);
        toast('Torneio importado com sucesso!');
        location.hash = '#/tournament';
      } catch (err) {
        for (const d of (err.details || [err.message])) errBox.appendChild(el('li', {}, d));
      }
    },
  }, 'Importar'));

  const exampleBox = el('div', { class: 'card', style: 'max-width:560px; margin-top:20px' });
  exampleBox.appendChild(el('div', { class: 'card-label' }, 'Formato Esperado'));
  exampleBox.appendChild(el('pre', { style: 'font-size:11px; color:var(--text-dim); white-space:pre-wrap' },
`{
  "name": "SARC IFC Brusque 2026",
  "teams": [
    {
      "name": "Alpha Team",
      "tag": "ATX",
      "players": ["[ATX-KYOSHY]", "[ATX-GABRIEL]", "[ATX-LUCAS]"]
    }
  ]
}`));

  root.appendChild(card);
  root.appendChild(exampleBox);
  return { onEvent: () => {} };
}
