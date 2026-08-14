/**
 * Cliente RCON para servidores GoldSrc (HLDS / ReHLDS - Counter-Strike 1.6).
 *
 * IMPORTANTE: o protocolo RCON do GoldSrc é diferente do RCON "Source" (TCP).
 * É baseado em pacotes UDP "connectionless" (prefixo 0xFFFFFFFF) e exige:
 *   1) Solicitar um "challenge" number ao servidor: "challenge rcon"
 *   2) Enviar o comando: 'rcon <challenge> <password> <comando>'
 *
 * Referência do formato de pacote (sem dependências externas, implementado
 * "na unha" com dgram nativo do Node.js).
 */
const dgram = require('dgram');

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);

class GoldSrcRcon {
  constructor({ host, port, password, timeout = 2000 }) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.timeout = timeout;
  }

  /**
   * Envia um pacote UDP connectionless e aguarda (uma ou mais) respostas.
   */
  _send(payload, { expectMultiple = false, collectMs = 250 } = {}) {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      let buffers = [];
      let finished = false;
      let collectTimer = null;

      const cleanup = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (collectTimer) clearTimeout(collectTimer);
        try { socket.close(); } catch (e) { /* noop */ }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`RCON timeout ao falar com ${this.host}:${this.port}`));
      }, this.timeout);

      socket.on('error', (err) => {
        cleanup();
        reject(err);
      });

      socket.on('message', (msg) => {
        buffers.push(msg);
        if (!expectMultiple) {
          cleanup();
          resolve(Buffer.concat(buffers));
        } else {
          // Servidores GoldSrc podem fragmentar respostas longas em vários
          // pacotes seguidos. Aguardamos um pequeno intervalo sem novos
          // pacotes antes de considerar a resposta completa.
          if (collectTimer) clearTimeout(collectTimer);
          collectTimer = setTimeout(() => {
            cleanup();
            resolve(Buffer.concat(buffers));
          }, collectMs);
        }
      });

      socket.send(payload, this.port, this.host, (err) => {
        if (err) {
          cleanup();
          reject(err);
        }
      });
    });
  }

  /**
   * Obtém o número de "challenge" necessário antes de qualquer comando rcon.
   */
  async getChallenge() {
    const packet = Buffer.concat([HEADER, Buffer.from('challenge rcon\n')]);
    const response = await this._send(packet);
    const text = response.toString('latin1');
    // Resposta típica: "\xff\xff\xff\xffchallenge rcon 123456789"
    const match = text.match(/challenge rcon (-?\d+)/i);
    if (!match) {
      throw new Error(`Não foi possível obter challenge do servidor. Resposta: ${text}`);
    }
    return match[1];
  }

  /**
   * Executa um comando RCON no servidor GoldSrc e retorna a resposta em texto.
   */
  async exec(command) {
    const challenge = await this.getChallenge();
    const body = `rcon ${challenge} ${this.password} ${command}\n`;
    const packet = Buffer.concat([HEADER, Buffer.from(body, 'latin1')]);
    const response = await this._send(packet, { expectMultiple: true });
    // Cada pacote de resposta também começa com 0xFFFFFFFF + "l" (log-string).
    let text = response.toString('latin1');
    text = text.replace(/\xff\xff\xff\xffl/g, '').replace(/\xff\xff\xff\xff/g, '');
    return text.trim();
  }
}

module.exports = { GoldSrcRcon };
