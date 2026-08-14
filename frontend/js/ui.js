// Helpers de UI compartilhados entre as páginas.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.substring(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const node = el('div', { class: `toast ${type === 'error' ? 'error' : ''}` }, message);
  container.appendChild(node);
  setTimeout(() => node.remove(), 4500);
}

export function statusPill(status) {
  const labels = {
    waiting: 'Aguardando', preparing: 'Preparando', live: 'Ao vivo',
    processing: 'Processando', finished: 'Finalizada',
  };
  return el('span', { class: `pill ${status}` }, labels[status] || status);
}

export function formatTeam(team) {
  if (!team) return '—';
  return `${team.name} [${team.tag}]`;
}

export async function withLoading(button, fn) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '...';
  try {
    await fn();
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

/**
 * Protege uma função de carregamento/renderização contra chamadas
 * concorrentes (ex.: um clique de botão chama load() diretamente logo após
 * uma ação da API, e quase ao mesmo tempo um evento do WebSocket também
 * chama load() para refletir a mesma mudança). Sem isso, duas chamadas
 * podiam terminar fora de ordem e duplicar ou "piscar" conteúdo antigo por
 * cima do mais recente.
 *
 * Uso: const guard = makeSeqGuard(); ... const seq = guard.start(); await
 * algumFetch(); if (!guard.isCurrent(seq)) return; // descarta silenciosamente
 * ...mutações de DOM aqui...
 */
export function makeSeqGuard() {
  let current = 0;
  return {
    start() { return ++current; },
    isCurrent(seq) { return seq === current; },
  };
}
