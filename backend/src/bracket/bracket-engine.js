/**
 * Motor de chaveamento — implementa os cenários A a F do regulamento SARC.
 * Todas as partidas, em qualquer fase, usam o formato padronizado de 6
 * rounds (3x3, com prorrogação em caso de empate):
 *
 *   8 equipes -> eliminatória simples (QF -> SF -> Final)
 *   7 equipes -> 1 BYE sorteado, depois eliminatória simples
 *   6 equipes -> 2 grupos de 3 (todos x todos) -> SF -> Final
 *   5 equipes -> 3 BYEs sorteados -> SF -> Final
 *   4 equipes -> SF -> Final
 *   3 equipes -> todos x todos -> Final entre os 2 melhores
 *
 * O sorteio (draw) só deve ser chamado uma única vez por torneio — a
 * validação de "já sorteado" fica a cargo da state store.
 */
const { v4: uuid } = require('uuid');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeMatch({ round, label, teamA = null, teamB = null, rounds = 6, isGroup = false, groupName = null }) {
  return {
    id: uuid(),
    round,          // "QF" | "SF" | "F" | "GROUP"
    label,          // ex: "QF1", "Grupo A - Rodada 1"
    groupName,
    isGroup,
    teamA,
    teamB,
    maxRounds: rounds,
    status: 'waiting', // waiting -> preparing -> live -> processing -> finished
    scoreA: 0,
    scoreB: 0,
    currentRound: 0,
    side: null,      // { teamA: 'CT'|'TR', teamB: 'CT'|'TR' }
    winnerId: null,
    loserId: null,
    map: null,
    startedAt: null,
    endedAt: null,
    roundHistory: [],
  };
}

function refTeam(team) {
  if (!team) return null;
  return { id: team.id, name: team.name, tag: team.tag, isBye: !!team.isBye };
}

const BYE_TEAM = { id: '__BYE__', name: 'BYE', tag: 'BYE', isBye: true };

/** Eliminatória simples de 8: gera 4 QF -> 2 SF -> 1 F (ligadas por "feeds"). */
function bracketFor8(teams) {
  const shuffled = shuffle(teams);
  const qf = [
    makeMatch({ round: 'QF', label: 'QF1', teamA: refTeam(shuffled[0]), teamB: refTeam(shuffled[1]) }),
    makeMatch({ round: 'QF', label: 'QF2', teamA: refTeam(shuffled[2]), teamB: refTeam(shuffled[3]) }),
    makeMatch({ round: 'QF', label: 'QF3', teamA: refTeam(shuffled[4]), teamB: refTeam(shuffled[5]) }),
    makeMatch({ round: 'QF', label: 'QF4', teamA: refTeam(shuffled[6]), teamB: refTeam(shuffled[7]) }),
  ];
  const sf = [
    makeMatch({ round: 'SF', label: 'SF1' }),
    makeMatch({ round: 'SF', label: 'SF2' }),
  ];
  const final = [makeMatch({ round: 'F', label: 'Final' })];

  const feeds = {
    [qf[0].id]: { nextMatchId: sf[0].id, slot: 'teamA' },
    [qf[1].id]: { nextMatchId: sf[0].id, slot: 'teamB' },
    [qf[2].id]: { nextMatchId: sf[1].id, slot: 'teamA' },
    [qf[3].id]: { nextMatchId: sf[1].id, slot: 'teamB' },
    [sf[0].id]: { nextMatchId: final[0].id, slot: 'teamA' },
    [sf[1].id]: { nextMatchId: final[0].id, slot: 'teamB' },
  };

  return { matches: [...qf, ...sf, ...final], feeds, groups: null, executionOrder: [...qf, ...sf, ...final].map(m => m.id) };
}

/** 7 equipes: sorteia 1 BYE, o vencedor do BYE avança direto para a SF correspondente. */
function bracketFor7(teams) {
  const shuffled = shuffle(teams);
  const byeTeam = shuffled[0];
  const rest = shuffled.slice(1); // 6 equipes jogam 3 QF

  const qf = [
    makeMatch({ round: 'QF', label: 'QF1', teamA: refTeam(rest[0]), teamB: refTeam(rest[1]) }),
    makeMatch({ round: 'QF', label: 'QF2', teamA: refTeam(rest[2]), teamB: refTeam(rest[3]) }),
    makeMatch({ round: 'QF', label: 'QF3', teamA: refTeam(rest[4]), teamB: refTeam(rest[5]) }),
  ];
  const sf = [
    // SF1: equipe do BYE já entra direto como teamA
    makeMatch({ round: 'SF', label: 'SF1', teamA: refTeam(byeTeam) }),
    makeMatch({ round: 'SF', label: 'SF2' }),
  ];
  const final = [makeMatch({ round: 'F', label: 'Final' })];

  const feeds = {
    [qf[0].id]: { nextMatchId: sf[0].id, slot: 'teamB' },
    [qf[1].id]: { nextMatchId: sf[1].id, slot: 'teamA' },
    [qf[2].id]: { nextMatchId: sf[1].id, slot: 'teamB' },
    [sf[0].id]: { nextMatchId: final[0].id, slot: 'teamA' },
    [sf[1].id]: { nextMatchId: final[0].id, slot: 'teamB' },
  };

  return { matches: [...qf, ...sf, ...final], feeds, groups: null, byeTeamId: byeTeam.id, executionOrder: [...qf, ...sf, ...final].map(m => m.id) };
}

/** 6 equipes: 2 grupos de 3 (todos x todos), classificam os 2 primeiros -> SF -> Final. */
function bracketFor6(teams) {
  const shuffled = shuffle(teams);
  const groupA = shuffled.slice(0, 3);
  const groupB = shuffled.slice(3, 6);

  function roundRobinMatches(groupTeams, groupName) {
    const m = [];
    for (let i = 0; i < groupTeams.length; i++) {
      for (let j = i + 1; j < groupTeams.length; j++) {
        m.push(makeMatch({
          round: 'GROUP',
          label: `${groupName} - ${groupTeams[i].tag} x ${groupTeams[j].tag}`,
          teamA: refTeam(groupTeams[i]),
          teamB: refTeam(groupTeams[j]),
          rounds: 6,
          isGroup: true,
          groupName,
        }));
      }
    }
    return m;
  }

  const groupMatchesA = roundRobinMatches(groupA, 'Grupo A');
  const groupMatchesB = roundRobinMatches(groupB, 'Grupo B');

  const sf = [
    makeMatch({ round: 'SF', label: 'SF1' }), // 1ºA x 2ºB
    makeMatch({ round: 'SF', label: 'SF2' }), // 1ºB x 2ºA
  ];
  const final = [makeMatch({ round: 'F', label: 'Final' })];

  const feeds = {
    [sf[0].id]: { nextMatchId: final[0].id, slot: 'teamA' },
    [sf[1].id]: { nextMatchId: final[0].id, slot: 'teamB' },
  };

  // Mapeia classificação de cada grupo -> vaga da semifinal, cruzado
  // (1ºA x 2ºB, 1ºB x 2ºA), para preenchimento automático assim que todos
  // os jogos de um grupo terminarem (ver store.autoAdvanceGroup).
  const groupFeeds = {
    'Grupo A': [
      { rank: 1, nextMatchId: sf[0].id, slot: 'teamA' },
      { rank: 2, nextMatchId: sf[1].id, slot: 'teamB' },
    ],
    'Grupo B': [
      { rank: 1, nextMatchId: sf[1].id, slot: 'teamA' },
      { rank: 2, nextMatchId: sf[0].id, slot: 'teamB' },
    ],
  };

  return {
    matches: [...groupMatchesA, ...groupMatchesB, ...sf, ...final],
    feeds,
    groupFeeds,
    groups: { 'Grupo A': groupA.map(t => t.id), 'Grupo B': groupB.map(t => t.id) },
    executionOrder: [...groupMatchesA, ...groupMatchesB, ...sf, ...final].map(m => m.id),
    pendingGroupStage: true,
  };
}

/** 5 equipes: 3 BYEs sorteados -> restam 2 jogos? Regulamento: A x B, C/D/E em BYE -> SF -> Final.
 *  Interpretação: 1 QF real (A x B) + 3 equipes de BYE avançam direto às semifinais/definições. */
function bracketFor5(teams) {
  const shuffled = shuffle(teams);
  const [a, b, byeC, byeD, byeE] = shuffled;

  const qf = [makeMatch({ round: 'QF', label: 'QF1', teamA: refTeam(a), teamB: refTeam(b) })];
  const sf = [
    makeMatch({ round: 'SF', label: 'SF1', teamA: refTeam(byeC), teamB: refTeam(byeD) }),
    makeMatch({ round: 'SF', label: 'SF2', teamA: refTeam(byeE) }), // recebe vencedor da QF1
  ];
  const final = [makeMatch({ round: 'F', label: 'Final' })];

  const feeds = {
    [qf[0].id]: { nextMatchId: sf[1].id, slot: 'teamB' },
    [sf[0].id]: { nextMatchId: final[0].id, slot: 'teamA' },
    [sf[1].id]: { nextMatchId: final[0].id, slot: 'teamB' },
  };

  return { matches: [...qf, ...sf, ...final], feeds, groups: null, executionOrder: [...qf, ...sf, ...final].map(m => m.id) };
}

/** 4 equipes: SF -> Final direto. */
function bracketFor4(teams) {
  const shuffled = shuffle(teams);
  const sf = [
    makeMatch({ round: 'SF', label: 'SF1', teamA: refTeam(shuffled[0]), teamB: refTeam(shuffled[1]) }),
    makeMatch({ round: 'SF', label: 'SF2', teamA: refTeam(shuffled[2]), teamB: refTeam(shuffled[3]) }),
  ];
  const final = [makeMatch({ round: 'F', label: 'Final' })];
  const feeds = {
    [sf[0].id]: { nextMatchId: final[0].id, slot: 'teamA' },
    [sf[1].id]: { nextMatchId: final[0].id, slot: 'teamB' },
  };
  return { matches: [...sf, ...final], feeds, groups: null, executionOrder: [...sf, ...final].map(m => m.id) };
}

/** 3 equipes: todos x todos -> final entre os 2 melhores (todas as partidas com 6 rounds). */
function bracketFor3(teams) {
  const [a, b, c] = shuffle(teams);
  const group = [
    makeMatch({ round: 'GROUP', label: `${a.tag} x ${b.tag}`, teamA: refTeam(a), teamB: refTeam(b), rounds: 6, isGroup: true, groupName: 'Grupo Único' }),
    makeMatch({ round: 'GROUP', label: `${a.tag} x ${c.tag}`, teamA: refTeam(a), teamB: refTeam(c), rounds: 6, isGroup: true, groupName: 'Grupo Único' }),
    makeMatch({ round: 'GROUP', label: `${b.tag} x ${c.tag}`, teamA: refTeam(b), teamB: refTeam(c), rounds: 6, isGroup: true, groupName: 'Grupo Único' }),
  ];
  const final = [makeMatch({ round: 'F', label: 'Final' })];
  const groupFeeds = {
    'Grupo Único': [
      { rank: 1, nextMatchId: final[0].id, slot: 'teamA' },
      { rank: 2, nextMatchId: final[0].id, slot: 'teamB' },
    ],
  };
  return {
    matches: [...group, ...final],
    feeds: {},
    groupFeeds,
    groups: { 'Grupo Único': [a.id, b.id, c.id] },
    executionOrder: [...group, ...final].map(m => m.id),
    pendingGroupStage: true,
  };
}

const BUILDERS = { 3: bracketFor3, 4: bracketFor4, 5: bracketFor5, 6: bracketFor6, 7: bracketFor7, 8: bracketFor8 };

function generateBracket(teams) {
  const n = teams.length;
  const builder = BUILDERS[n];
  if (!builder) {
    throw new Error(`Número de equipes não suportado: ${n}. Suportado: 3 a 8 equipes.`);
  }
  return builder(teams);
}

module.exports = { generateBracket, BYE_TEAM };
