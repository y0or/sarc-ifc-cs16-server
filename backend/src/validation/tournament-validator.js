/**
 * Validação do JSON de importação do torneio completo
 * (nome, equipes, jogadores, tags — o bracket em si é sempre gerado
 * pelo motor local ao "Sortear", conforme regra: o sorteio só ocorre
 * quando o operador aciona a ação, nunca por importação direta de bracket
 * pronto sem equipes válidas).
 */
const { validateTeamList } = require('./team-validator');

function validateTournamentImport(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['JSON inválido ou vazio.'] };
  }
  if (!payload.name || !String(payload.name).trim()) {
    errors.push('Campo "name" (nome do torneio) é obrigatório.');
  }
  const teamResult = validateTeamList(payload.teams || []);
  if (!teamResult.valid) {
    errors.push(...teamResult.errors);
  }
  return {
    valid: errors.length === 0,
    errors,
    name: payload.name,
    teams: teamResult.teams,
  };
}

module.exports = { validateTournamentImport };
