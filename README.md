# 🎮 SARC IFC CS 1.6 - Docker Tournament Server

![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Counter-Strike](https://img.shields.io/badge/Counter--Strike-1.6-orange?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Em_Operação-success?style=for-the-badge)

## 📌 Objetivo do Projeto

Este projeto foi desenvolvido como material prático para a oficina de Docker do evento **SARC IFC Brusque 2026**. 

O objetivo principal é demonstrar, na prática, como as tecnologias de conteinerização utilizadas diariamente em servidores de aplicações corporativas podem ser aplicadas para hospedar servidores de jogos. O repositório contém a infraestrutura completa para orquestrar um torneio LAN de Counter-Strike 1.6, executando o servidor de jogo, o monitoramento de logs em tempo real, a API e o painel web, tudo de forma isolada, escalável e automatizada.

---

## 🏗️ Arquitetura e Serviços

O ecossistema do servidor é composto por múltiplos serviços integrados que rodam em background. Abaixo, a tabela detalha o funcionamento de cada módulo:

| Módulo | Descrição Técnica | Porta / Acesso |
| :--- | :--- | :--- |
| **ReHLDS Game Server** | Servidor dedicado de CS 1.6 executando a partida atual. | `27015` (UDP) |
| **Log Parser** | Serviço que lê os logs nativos do jogo em tempo real. | *Uso Interno* |
| **API REST** | Interface de comunicação que gera os arquivos JSON/XML. | *Uso Interno* |
| **Frontend Web** | Central de Operações do torneio (Dashboard e Chaveamento). | `8080` (TCP/HTTP) |

---

## ⚙️ Pré-requisitos

Para que outra máquina possa assumir o papel de servidor e rodar este projeto, é necessário instalar as seguintes ferramentas:

1. **[Git](https://git-scm.com/downloads)** - Para clonar o repositório.
2. **[Docker Desktop](https://docs.docker.com/desktop/)** - Motor de containers. O Docker Compose já vem integrado.

> **⚠️ Atenção:** Não é necessário instalar Node.js, Python ou bibliotecas do jogo diretamente no computador. O Docker se encarregará de baixar e isolar todas as dependências automaticamente dentro dos containers!

---

## 🚀 Passo a Passo de Instalação e Execução

### 1. Clonar o repositório
Abra o terminal da máquina que servirá de host e clone o projeto:
```bash
git clone [https://github.com/y0or/sarc-ifc-cs16-server.git](https://github.com/y0or/sarc-ifc-cs16-server.git)
cd sarc-ifc-cs16-server

```

### 2. Configurar as Variáveis de Ambiente (Importante 🔒)

Por questões de boas práticas e segurança, senhas e configurações sensíveis nunca são enviadas ao GitHub. Nós utilizamos um arquivo de modelo chamado `.env.example`.

Você precisa criar o arquivo `.env` definitivo baseado neste modelo:

* **No Windows (PowerShell/CMD):**
```cmd
copy .env.example .env

```


* **No Linux/Mac:**
```bash
cp .env.example .env

```



*Abra o arquivo `.env` recém-criado no bloco de notas ou VS Code e preencha as senhas de RCON e configurações específicas do servidor, se necessário.*

### 3. Subir a Infraestrutura

Com as configurações prontas, inicie todos os servidores com um único comando:

```bash
docker compose up -d --build

```

* -d : Roda os containers em segundo plano (detached), liberando o terminal.
* --build : Garante que a versão mais recente do código seja compilada nas imagens locais.

---

## 🌐 Como Descobrir o IP do Servidor Host

Para que os jogadores e organizadores consigam acessar o painel web e o jogo, você precisa descobrir qual é o endereço IP da máquina onde o Docker está rodando.

**No Windows:**

1. Pressione Win + R, digite `cmd` e dê Enter.
2. Digite o seguinte comando:
```cmd
ipconfig

```


3. Procure pela linha **Endereço IPv4** (exemplo: `192.168.1.100`). Anote este número.

**No Linux:**
No terminal, digite `ip a` ou `hostname -I`.

---

## 🎮 Acessando a Plataforma e o Jogo

Distribua o IP anotado no passo anterior para os participantes da LAN.

### 📊 Painel do Organizador (Web)

Para realizar o upload do arquivo `tournament.json`, acompanhar as partidas em tempo real e baixar os resultados:

* Abra o navegador e acesse: `http://<IP_DO_SERVIDOR>:80` *(Ex: http://192.168.1.100:80)*

### 🔫 Conectando ao Jogo (Jogadores)

Para os jogadores entrarem na partida:

1. Abra o Counter-Strike 1.6.
2. Pressione a tecla ~ ou ' para abrir o console.
3. Digite o comando de conexão:
```text
connect <IP_DO_SERVIDOR>

```



---

## 📂 Estrutura de Diretórios Dinâmicos

A arquitetura do projeto espelha pastas locais para dentro dos containers. As pastas abaixo são geradas e populadas automaticamente durante o uso (e estão devidamente ignoradas no `.gitignore` para não poluir o repositório):

* 📁 `/logs` - Armazena os logs nativos gerados pelo CS 1.6 (`.log`).
* 📁 `/results` - Guarda os relatórios convertidos em `.json` e `.xml` para o chaveamento.
* 📁 `/history` - Histórico definitivo das partidas finalizadas.
* 📁 `/cstrike` - Contém configurações sensíveis (`server.cfg`) e mapas customizados.

```

```
