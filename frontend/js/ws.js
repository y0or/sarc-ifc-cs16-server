// Cliente WebSocket nativo (sem dependências externas / CDN) com
// reconexão automática — importante para eventos de LAN em que o backend
// pode reiniciar durante o evento.
export function connectWS(onMessage) {
  let socket = null;
  let retryDelay = 1000;

  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/ws`);

    socket.addEventListener('open', () => { retryDelay = 1000; });
    socket.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        onMessage(msg);
      } catch (e) { /* ignora mensagens não-JSON */ }
    });
    socket.addEventListener('close', () => {
      setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 1.5, 10000);
    });
    socket.addEventListener('error', () => socket.close());
  }

  connect();
  return { close: () => socket && socket.close() };
}
