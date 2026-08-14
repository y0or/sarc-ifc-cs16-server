import { api } from '../api.js';
import { el, toast } from '../ui.js';

export async function renderSettings(root) {
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-title' }, 'Settings'),
    el('div', { class: 'page-sub' }, 'Informações de configuração do servidor'),
  ]));

  const card = el('div', { class: 'card', style: 'max-width:600px' });
  card.appendChild(el('div', { class: 'card-label' }, 'RCON / Servidor de Jogo'));
  try {
    const status = await api.status();
    card.appendChild(el('div', { class: 'text-dim', style: 'margin-bottom:16px' },
      `Modo RCON: ${status.rconMode === 'mock' ? 'Simulado (RCON_MOCK=true)' : 'Conectado ao servidor CS 1.6'}`));
  } catch (err) { /* ignore */ }
  card.appendChild(el('div', { class: 'text-dim' },
    'As credenciais do RCON, host, porta, mapa padrão e demais parâmetros são definidos via variáveis de ambiente no docker-compose.yml (CS_SERVER_HOST, CS_SERVER_RCON_PORT, RCON_PASSWORD, DEFAULT_MAP, MATCH_ROUNDS). Altere lá e reinicie os containers para aplicar.'));

  const dangerCard = el('div', { class: 'card', style: 'max-width:600px; margin-top:20px; border-color:#7a2b2b' });
  dangerCard.appendChild(el('div', { class: 'card-label', style: 'color:var(--danger)' }, 'Zona de Risco'));
  dangerCard.appendChild(el('div', { class: 'text-dim', style: 'margin-bottom:12px' }, 'Reinicia todo o estado do torneio: remove equipes, chaveamento e histórico da sessão atual (arquivos de histórico já exportados não são apagados).'));
  dangerCard.appendChild(el('button', {
    class: 'btn danger', onclick: async () => {
      if (!confirm('Tem certeza? Essa ação não pode ser desfeita.')) return;
      await api.resetTournament();
      toast('Torneio reiniciado.');
    },
  }, 'Reiniciar Torneio'));

  root.appendChild(card);
  root.appendChild(dangerCard);
  return { onEvent: () => {} };
}
