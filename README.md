# SARC Docker Tournament Server v1.0

Plataforma **100% local** para gerenciamento e execução de torneios de
Counter-Strike 1.6 em LAN — frontend, backend, parser de logs e servidor do
jogo rodando inteiramente no servidor do evento, sem qualquer dependência de
nuvem ou serviço externo.

Feito para o formato **3x3** (6 jogadores + 1 vaga de espectador), com
chaveamento automático para **3 a 8 equipes**, integração real com o servidor
via **RCON**, leitura contínua dos **logs nativos** do CS 1.6, e uma interface
web em tempo real (WebSocket) que funciona como central de operação do
torneio.

---

## 1. Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                      Container: backend                      │
│                                                                │
│   Frontend estático  ← serve   Express (API REST)             │
│   (HTML/CSS/JS puro)             │                             │
│                                    ├─ WebSocket (/ws) ──────┐  │
│                                    ├─ RCON Client (UDP)      │  │
│                                    ├─ Parser de Logs         │  │
│                                    └─ State Store (JSON)     │  │
└──────────────────┬─────────────────────────────┬────────────┘  │
                    │ RCON (27015/UDP)            │ tail logs/*.log
                    ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Container: cs16-server                        │
│                  (mesma rede Docker) — grava logs nativos      │
└─────────────────────────────────────────────────────────────┘
```

- **Frontend** não é só visual: cada ação (cadastrar equipe, sortear,
  iniciar partida, avançar) chama a API do backend, que é a fonte de
  verdade operacional.
- **Backend** valida o bracket, controla o estado da partida (máquina de
  estados), fala com o servidor via RCON, lê os logs continuamente e
  propaga tudo em tempo real via WebSocket nativo (sem CDN — funciona 100%
  offline).
- **Servidor do jogo** executa a partida e grava logs nativos em
  `./logs`, volume compartilhado com o backend.
- **Logs** são a fonte de verdade histórica; o **JSON do torneio** (gerado
  pelo motor de bracket local) é a fonte de verdade da fila/chaveamento.

### Fonte de verdade

| Camada          | Papel                                                        |
|-----------------|---------------------------------------------------------------|
| Bracket (backend)| Fila/ordem de partidas — só muda via `/api/tournament/draw`  |
| Backend/estado  | Estado operacional da partida ao vivo (o que está rodando agora)|
| Logs nativos    | Histórico real do que aconteceu no servidor                  |
| Frontend        | Espelha tudo em tempo real — nunca decide nada sozinho        |

---

## 2. Requisitos

- Docker e Docker Compose instalados na máquina do evento.
- **Regra de Firewall do Windows liberando as portas 27015 (UDP e TCP)** —
  veja o comando pronto na seção 10, item "Firewall". Isso é praticamente
  obrigatório: por padrão o Firewall do Windows bloqueia conexões de entrada
  de outros PCs mesmo com o Docker publicando a porta corretamente.
- Portas livres: `8080` (dashboard web) e `27015/UDP` + `27015/TCP`
  (servidor CS 1.6, publicadas via mapeamento de portas — funciona igual em
  Windows, Mac e Linux).
- A imagem `cajuclc/cstrike-docker:latest` é baixada automaticamente no
  primeiro `docker compose up` (Metamod + AMX Mod X + DProto + Podbot,
  projeto ativo há anos: [`CajuCLC/cstrike-docker`](https://github.com/CajuCLC/cstrike-docker),
  10 mil+ downloads no Docker Hub). Já passamos por duas outras imagens
  neste projeto antes de chegar nesta (uma nem existe mais no Docker Hub,
  outra subia normalmente mas o client do jogo não validava a conexão) —
  se um dia precisar trocar de novo, ajuste `image:` e os caminhos em
  `volumes:` no `docker-compose.yml`.

---

## 3. Subindo o sistema

```bash
# 1) (opcional) copie e ajuste as variáveis de ambiente
cp .env.example .env

# 2) build + subida dos containers
docker compose up -d --build

# 3) acompanhe os logs do backend
docker compose logs -f backend
```

Acesse **http://localhost:8080** — essa é a central do torneio.

### Testando sem um servidor CS 1.6 real

Para validar todo o fluxo (cadastro, sorteio, avanço de partidas) sem
depender do container do jogo, suba só o backend em modo simulado:

```bash
RCON_MOCK=true docker compose up -d --build backend
```

Todos os comandos RCON serão apenas logados no console (`[RCON-MOCK] ...`),
sem necessidade do servidor de jogo rodando.

---

## 4. Fluxo de operação (passo a passo do evento)

1. **Cadastro de equipes** — manualmente pela tela *Tournament* ou
   importando um JSON pela tela *Import JSON* (veja `tournament.example.json`
   como referência). Cada equipe precisa de nome, tag e exatamente 3
   jogadores no padrão `[TAG-NICK]`.
2. **Sortear Chaveamento** — botão disponível assim que houver entre 3 e 8
   equipes válidas. Só pode ser feito **uma vez** por torneio.
3. **Iniciar Campeonato** — libera a primeira partida da fila.
4. Na tela **Live Match**, o operador clica **Iniciar Partida**: o backend
   troca o mapa, define `mp_maxrounds` e avisa a sala via RCON. Os bots já
   estão na sala desde que o servidor subiu (ver seção 8.1).
5. Jogadores reais entram e ocupam o lugar dos bots automaticamente.
6. A partida roda **6 rounds no total** (3 como CT, troca de lado, 3 como
   TR). Cada round pode ser registrado de duas formas:
   - **Automaticamente**, se o parser reconhecer o gatilho de fim de round
     nos logs do seu servidor (veja seção 7);
   - **Manualmente**, clicando em "[Equipe] venceu o round" na tela Live
     Match — recomendado como forma confiável, já que o formato de log
     pode variar entre servidores/plugins. As duas formas alimentam a
     mesma lógica (troca de lado automática, cálculo de vencedor).
7. **No 3º round**, a troca de lado acontece automaticamente — e o servidor
   é **recarregado de verdade** (o mesmo mecanismo de "Iniciar Partida"),
   não só um comando de swap: todo mundo reconecta e volta pra tela de
   escolha de time, já do lado novo. Isso aparece refletido no painel na
   hora (badges CT/TR trocam de time). Se por algum motivo o swap
   automático não disparar direito, o operador pode forçar de novo a
   qualquer momento com o botão **"Trocar de Lado"** na tela Live Match.
8. Se o placar terminar empatado (3x3) no 6º round, a partida entra em
   **prorrogação** automaticamente — continue registrando rounds até
   alguém abrir vantagem; aí sim a partida finaliza.
9. Ao decidir o placar, o backend finaliza a partida, calcula
   vencedor/perdedor, atualiza o bracket **e já recarrega o servidor**
   (mesmo mecanismo do swap) — deixando tudo pronto pra próxima disputa.
10. O operador confirma e clica **Avançar Para Próxima Equipe** — libera a
    próxima partida da fila (o servidor já foi resetado no passo anterior).
11. Repete até a Final. Tudo fica disponível na tela **History**, com
    download de **JSON** e **XML** por partida.

---

## 5. Estrutura de pastas

```
docker-tournament-server/
├── docker-compose.yml
├── .env.example
├── tournament.example.json
├── cstrike/
│   └── server.cfg              # config do servidor CS 1.6
├── logs/                       # volume compartilhado — logs nativos do jogo
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── data/                   # estado persistido (JSON) + histórico
│   └── src/
│       ├── index.js            # entrypoint (Express + WS + parser)
│       ├── ws-server.js        # camada de WebSocket nativo
│       ├── rcon/
│       │   ├── goldsrc-rcon.js     # protocolo RCON do GoldSrc (UDP)
│       │   └── server-controller.js # comandos de domínio (bots, swap, etc.)
│       ├── parser/
│       │   ├── log-parser.js       # leitura contínua dos logs nativos
│       │   └── parser-bridge.js    # liga eventos do log à máquina de estados
│       ├── bracket/
│       │   └── bracket-engine.js   # geração de chaveamento (3 a 8 equipes)
│       ├── state/
│       │   ├── store.js            # fonte de verdade operacional (+ persistência)
│       │   └── match-controller.js # máquina de estados da partida
│       ├── validation/
│       │   ├── team-validator.js
│       │   └── tournament-validator.js
│       ├── routes/                 # API REST (teams, tournament, matches, ...)
│       └── utils/                  # config, logger, export JSON/XML
└── frontend/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── app.js               # router (hash-based, sem build step)
        ├── api.js                # cliente HTTP
        ├── ws.js                 # cliente WebSocket nativo
        ├── ui.js                 # helpers de DOM
        └── pages/                 # Dashboard, Tournament, Matches, Live Match,
                                    # Bracket View, Players, History, Import JSON,
                                    # Settings, Match Details
```

---

## 6. API REST (resumo)

| Método | Rota                              | Descrição                                   |
|--------|------------------------------------|----------------------------------------------|
| GET    | `/api/status`                      | Status dos serviços (servidor/parser/api)     |
| GET    | `/api/dashboard`                   | Dados agregados da tela Dashboard             |
| GET    | `/api/teams`                       | Lista equipes                                 |
| POST   | `/api/teams`                       | Cadastra uma equipe                           |
| DELETE | `/api/teams/:id`                   | Remove uma equipe (só antes do sorteio)       |
| POST   | `/api/teams/import`                | Importa lista de equipes (JSON)               |
| GET    | `/api/tournament`                  | Estado geral do torneio                       |
| GET    | `/api/tournament/bracket`          | Chaveamento atual                             |
| POST   | `/api/tournament/draw`             | Sorteia o chaveamento (uma única vez)         |
| POST   | `/api/tournament/start`            | Marca o torneio como "em andamento"           |
| POST   | `/api/tournament/advance`          | Avança para a próxima partida da fila         |
| POST   | `/api/tournament/import`           | Importa torneio completo (nome + equipes)     |
| POST   | `/api/tournament/reset`            | Reinicia todo o estado do torneio             |
| GET    | `/api/matches`                     | Lista todas as partidas do bracket            |
| GET    | `/api/matches/current`             | Partida atual da fila de execução             |
| GET    | `/api/matches/:id`                 | Detalhes de uma partida                       |
| POST   | `/api/matches/:id/start`           | Prepara e inicia a partida no servidor        |
| POST   | `/api/matches/:id/round-win`       | Registra manualmente o vencedor do round (`{ side: "CT"\|"TR" }`) |
| POST   | `/api/matches/:id/swap-sides`      | Força a troca de lado na mão (recarrega o servidor) |
| POST   | `/api/matches/:id/finish`          | Encerra manualmente (abandono/regra interna)  |
| GET    | `/api/matches/:id/download/json`   | Exporta resultado em JSON                     |
| GET    | `/api/matches/:id/download/xml`    | Exporta resultado em XML                      |
| GET    | `/api/players`                     | Jogadores da partida atual                    |
| GET    | `/api/history`                     | Partidas finalizadas                          |

WebSocket em `ws://<host>:8080/ws` — eventos como `match:round_end`,
`match:finished`, `bracket:drawn`, `tournament:advanced`, etc. O frontend já
consome tudo automaticamente.

---

## 7. Sobre o parser de logs (importante)

O parser (`backend/src/parser/log-parser.js`) interpreta o formato padrão de
log do engine GoldSrc (HLDS/ReHLDS). Dependendo do build exato do seu
servidor ou de plugins (AMX Mod X, Mani Admin, etc.), algumas mensagens de
log podem variar ligeiramente. As expressões regulares estão isoladas em um
único objeto `PATTERNS` no topo do arquivo — ajuste ali caso seu servidor
gere mensagens diferentes das listadas. Recomendamos rodar uma partida de
teste antes do evento (com `docker compose logs -f backend`) para validar
que os eventos `round_start`, `round_win` e `round_end` estão sendo
reconhecidos corretamente.

## 8. Sobre o RCON (importante)

O CS 1.6 usa o protocolo RCON do **GoldSrc** (baseado em UDP com
"challenge"), diferente do RCON "Source" (TCP) usado em jogos mais novos.
Isso está implementado do zero em `backend/src/rcon/goldsrc-rcon.js`, sem
dependências externas. Se o seu servidor usar uma porta RCON diferente de
`27015`, ajuste `CS_SERVER_RCON_PORT` no `docker-compose.yml`.

---

## 8.1. Sobre os bots

O preenchimento de bots é feito pelo **Podbot** (não pelo backend),
configurado em `cstrike/server.cfg`:

```
pb_minbots 0
pb_maxbots 6
```

Usamos o Podbot em vez do bot nativo do engine (ZBot) porque, na prática,
binários Linux do HLDS costumam não ter o ZBot funcional — é uma limitação
histórica comum. O Podbot já vem incluído na imagem `cajuclc/cstrike-docker`
via Metamod, então não depende disso.

Isso significa que o servidor já sobe com até 6 bots ocupando as vagas
jogáveis (3x3), deixando a 7ª vaga (`MAXPLAYERS=7`) livre para
espectador/administrador. Conforme jogadores reais entram, o Podbot reduz
a contagem de bots sozinho — não é preciso nenhum comando manual nem
depende do painel do torneio estar rodando.

Se quiser ajustar a dificuldade dos bots, mude `pb_difficulty` (0 a 100) no
`server.cfg`. Se depois de subir os bots ainda não aparecerem, confira no
log (`docker compose logs cs16-server`) se a linha `Podbot mm - ...` aparece
no boot — se não aparecer, o Metamod pode não estar carregando o plugin
corretamente nessa imagem, e vale abrir uma issue no repositório da imagem
(`github.com/CajuCLC/cstrike-docker`) ou trocar de imagem novamente.

---

## 9. Cenários de chaveamento suportados

O motor de bracket (`backend/src/bracket/bracket-engine.js`) já contempla
todos os cenários do regulamento, mesmo que o evento atual use 8 equipes.
Todas as partidas, em qualquer fase (grupo, quartas, semi, final), usam o
mesmo formato padronizado de **6 rounds** (3x3, com prorrogação em caso de
empate — veja seção 4):

- **8 equipes** — eliminatória simples (QF → SF → Final).
- **7 equipes** — 1 BYE sorteado, depois eliminatória simples.
- **6 equipes** — 2 grupos de 3 (todos x todos) → SF → Final.
- **5 equipes** — 3 BYEs sorteados → SF → Final.
- **4 equipes** — SF → Final direto.
- **3 equipes** — todos x todos → Final entre os 2 melhores.

---

### Sobre os cenários com fase de grupos (3 e 6 equipes)

A classificação (vitórias → saldo de rounds → confronto direto, na ordem do
regulamento) é calculada **automaticamente** assim que todas as partidas de
um grupo terminam, e os classificados já são preenchidos sozinhos na
semifinal/final (`backend/src/bracket/standings.js`). Isso vale tanto para
o grupo único de 3 equipes quanto para os 2 grupos de 3 do cenário de 6
equipes.

Se sobrar um empate que os critérios automáticos não conseguem resolver
(mesmas vitórias, mesmo saldo, e as equipes empatadas não se enfrentaram
diretamente — o próprio regulamento manda pra sorteio nesse caso), o
sistema avisa na tela *Bracket View* em vez de "adivinhar". Mesmo quando
preenche automaticamente, o botão **"Editar Equipes"** continua disponível
na tela *Matches* para qualquer partida de SF/Final que ainda não começou —
use para corrigir manualmente se desconfiar do resultado automático, ou
para resolver o empate mencionado acima. Os cenários de eliminação simples
(4, 5, 7 e 8 equipes — incluindo o formato padrão do evento) já avançavam
automaticamente via bracket, sem depender de fase de grupos.

## 10. Solução de problemas

- **`Bind for 0.0.0.0:8080 failed: port is already allocated`** (ou o mesmo
  erro para a porta 80): quase sempre é um container de uma tentativa
  anterior que ficou "pra trás" (não foi encerrado direito) ainda segurando
  a porta — não é a aplicação em si com problema. Resolva assim:
  ```powershell
  docker compose down --remove-orphans
  docker ps -a
  ```
  Se `docker ps -a` mostrar algum container antigo (ex.: `sarc_backend`)
  ainda existindo, remova com `docker rm -f <nome_ou_id>` e suba de novo com
  `docker compose up -d --build`. Se o erro insistir mesmo sem containers
  antigos, outro programa do Windows está usando a porta — descubra com
  `netstat -ano | findstr :8080` (ou `:80`) e feche o processo, ou comente a
  linha correspondente em `ports:` no `docker-compose.yml`.

- **RCON não conecta**: como os dois containers ficam na mesma rede Docker,
  `CS_SERVER_HOST` já vem correto por padrão (`cs16-server`, o nome do
  serviço). Confirme que o container `sarc_cs16_server` está com status
  "healthy"/rodando (`docker compose ps`) e que a `RCON_PASSWORD` do backend
  é idêntica ao `rcon_password` em `cstrike/server.cfg`. Teste com
  `RCON_MOCK=true` para isolar se o problema é de rede ou de lógica. A tela
  **Dashboard** mostra o status real do servidor (card "Servidor") fazendo
  um ping de RCON — se aparecer OFFLINE, o problema é de rede/RCON, não do
  painel. (Já testamos `network_mode: host` neste projeto — ele quebrou o
  RCON sem provar que resolvia a conexão dos jogadores, inclusive testando
  de outro PC na rede, então voltamos ao modo padrão descrito acima.)

- **O jogo não conecta ao servidor (client trava em "Retrying...") — mesmo
  de outro PC na rede**: nesse ponto, com o servidor comprovadamente
  saudável (`docker compose logs cs16-server` mostrando `Round_Start`) e a
  porta publicada corretamente, o suspeito nº1 é o **Firewall do Windows**.
  Abra o **PowerShell como Administrador** (botão direito → "Executar como
  administrador") na máquina que roda o Docker e rode exatamente isto:
  ```powershell
  New-NetFirewallRule -DisplayName "CS16 Server UDP" -Direction Inbound -Protocol UDP -LocalPort 27015 -Action Allow
  New-NetFirewallRule -DisplayName "CS16 Server TCP" -Direction Inbound -Protocol TCP -LocalPort 27015 -Action Allow
  ```
  Isso cria as regras direto por comando, sem depender de navegar
  corretamente pelos menus do Firewall (fácil de errar um clique ali). Depois
  de rodar, teste de novo de outro PC.

  Se AINDA assim não conectar, confira o **perfil de rede** do Windows:
  ```powershell
  Get-NetConnectionProfile
  ```
  Se o `NetworkCategory` da sua conexão aparecer como `Public`, o Windows
  aplica regras de firewall bem mais restritivas por padrão (mesmo com as
  regras acima criadas, algumas configurações de "Public" ainda bloqueiam
  mais coisas). Troque para `Private`:
  ```powershell
  Set-NetConnectionProfile -InterfaceAlias "NOME_DO_ADAPTADOR" -NetworkCategory Private
  ```
  (troque `NOME_DO_ADAPTADOR` pelo valor mostrado em `InterfaceAlias` no
  comando anterior — geralmente algo como "Wi-Fi" ou "Ethernet").

  Outros pontos a verificar, nessa ordem:
  1. `docker compose logs --tail=80 cs16-server` — confirme que aparece
     `World triggered "Round_Start"` / o nome do mapa carregado. Se
     aparecer, o servidor está saudável e o problema é 100% de rede.
  2. **NÃO teste com `connect 127.0.0.1:27015` (ou o IP da própria máquina)
     no mesmo PC que roda o Docker Desktop no Windows** — isso é uma
     armadilha conhecida de hairpin NAT do Windows, não confiável como
     diagnóstico. Sempre teste de um segundo PC.
  3. Confirme que os dois PCs (Docker e jogador) estão na mesma rede/
     sub-rede — mesmo roteador/Wi-Fi, não um no hotspot do celular e outro
     no Wi-Fi de casa. Descubra o IP correto da máquina do Docker com
     `ipconfig` (campo "Endereço IPv4" do adaptador conectado à rede).
  4. Se nada disso resolver, pode valer testar temporariamente desativar
     por completo o Firewall do Windows (`Set-NetFirewallProfile -Profile
     Domain,Public,Private -Enabled False`, **reative depois** com `-Enabled
     True`) só para confirmar de vez se é o Firewall — se conectar com ele
     desativado, sabemos com certeza que é questão de regra e ajustamos com
     calma; se mesmo desativado não conectar, o problema é outra coisa e
     precisamos investigar por outro caminho (ex.: roteador com isolamento
     de clientes AP, comum em Wi-Fi de eventos/convidados).


- **Parser não detecta eventos**: confira se `log on` e `sv_logfile 1` estão
  ativos no `server.cfg` e se o volume `./logs` está realmente montado nos
  dois containers (`docker compose exec backend ls /app/logs`). Se a pasta
  estiver vazia mesmo com uma partida rodando, confirme o caminho interno de
  logs da imagem do servidor com `docker compose exec cs16-server find / -iname "L*.log" 2>/dev/null`
  e ajuste o volume no `docker-compose.yml` se for diferente de
  `/home/steam/cstrike/cstrike/logs` (o caminho usado pela imagem
  `cajuclc/cstrike-docker`).
- **Bracket não sorteia**: só é permitido com 3 a 8 equipes **válidas**
  cadastradas (nome, tag e 3 jogadores no padrão `[TAG-NICK]`).
