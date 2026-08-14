/**
 * Validação de equipes: nome, tag e 3 jogadores com nick no padrão [TAG-NICK].
 */

function normalizeTag(tag) {
  return String(tag || '').trim().toUpperCase();
}

/**
 * Valida se um nick de jogador corresponde ao padrão [TAG-NICK].
 * Aceita variações com ou sem colchetes na entrada, mas a TAG precisa bater.
 */
function nickMatchesTag(nick, tag) {
  if (!nick) return false;
  const clean = String(nick).trim();
  const stripped = clean.replace(/^\[/, '').replace(/\]$/, '');
  const parts = stripped.split('-');
  if (parts.length < 2) return false;
  const nickTag = parts[0].trim().toUpperCase();
  return nickTag === normalizeTag(tag);
}

function formatNick(tag, nick) {
  const cleanNick = String(nick).trim().replace(/^\[/, '').replace(/\]$/, '');
  if (cleanNick.toUpperCase().startsWith(`${normalizeTag(tag)}-`)) {
    return `[${cleanNick.toUpperCase()}]`;
  }
  return `[${normalizeTag(tag)}-${cleanNick.toUpperCase()}]`;
}

/**
 * Valida uma equipe. Retorna { valid: boolean, errors: string[] }.
 * `existingTags` é usado para impedir tags duplicadas no torneio.
 */
function validateTeam(team, existingTags = []) {
  const errors = [];

  if (!team || typeof team !== 'object') {
    return { valid: false, errors: ['Equipe inválida: objeto ausente.'] };
  }

  const name = String(team.name || '').trim();
  const tag = normalizeTag(team.tag);
  const players = Array.isArray(team.players) ? team.players : [];

  if (!name) errors.push('Nome da equipe é obrigatório.');
  if (!tag) errors.push('Tag da equipe é obrigatória.');
  if (tag && !/^[A-Z0-9]{2,10}$/.test(tag)) {
    errors.push('Tag deve conter apenas letras/números (2 a 10 caracteres).');
  }
  if (tag && existingTags.includes(tag)) {
    errors.push(`Tag "${tag}" já está em uso por outra equipe.`);
  }

  if (players.length !== 3) {
    errors.push(`Equipe deve ter exatamente 3 jogadores (recebido: ${players.length}).`);
  } else {
    const seenNicks = new Set();
    players.forEach((p, idx) => {
      const nick = typeof p === 'string' ? p : p?.nick;
      if (!nick || !String(nick).trim()) {
        errors.push(`Jogador ${idx + 1}: nick vazio.`);
        return;
      }
      if (tag && !nickMatchesTag(nick, tag)) {
        errors.push(`Jogador ${idx + 1} ("${nick}") não corresponde à tag da equipe "${tag}". Esperado padrão [${tag}-NICK].`);
      }
      const key = String(nick).trim().toUpperCase();
      if (seenNicks.has(key)) {
        errors.push(`Nick duplicado na equipe: "${nick}".`);
      }
      seenNicks.add(key);
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Valida uma lista completa de equipes (usado na importação de JSON do torneio).
 */
function validateTeamList(teams) {
  const errors = [];
  const tagsUsed = [];
  const validTeams = [];

  if (!Array.isArray(teams) || teams.length === 0) {
    return { valid: false, errors: ['Nenhuma equipe encontrada.'], teams: [] };
  }
  if (teams.length < 3 || teams.length > 8) {
    errors.push(`Quantidade de equipes fora do suportado (3 a 8). Recebido: ${teams.length}.`);
  }

  teams.forEach((team, idx) => {
    const result = validateTeam(team, tagsUsed);
    if (!result.valid) {
      errors.push(`Equipe #${idx + 1} (${team?.name || 'sem nome'}): ${result.errors.join(' ')}`);
    } else {
      tagsUsed.push(normalizeTag(team.tag));
      validTeams.push(team);
    }
  });

  return { valid: errors.length === 0, errors, teams: validTeams };
}

module.exports = { validateTeam, validateTeamList, nickMatchesTag, formatNick, normalizeTag };
