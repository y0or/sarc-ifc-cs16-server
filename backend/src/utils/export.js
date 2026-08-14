/**
 * Geração de saída JSON/XML para o resultado de uma partida finalizada,
 * conforme "IMPORTANTE SOBRE LOGS" do briefing (o parser deve gerar
 * saída em JSON e/ou XML).
 */
const { create } = require('xmlbuilder2');

function matchToResultObject(match) {
  return {
    matchId: match.id,
    round: match.round,
    label: match.label,
    map: match.map,
    teamA: match.teamA,
    teamB: match.teamB,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    roundDiff: Math.abs(match.scoreA - match.scoreB),
    winnerId: match.winnerId,
    loserId: match.loserId,
    status: match.status,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    roundHistory: match.roundHistory,
  };
}

function matchToJSON(match) {
  return JSON.stringify(matchToResultObject(match), null, 2);
}

function matchToXML(match) {
  const obj = matchToResultObject(match);
  const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('match', { id: obj.matchId });
  doc.ele('round').txt(obj.round).up();
  doc.ele('label').txt(obj.label).up();
  doc.ele('map').txt(obj.map || '').up();
  const teamA = doc.ele('teamA', { id: obj.teamA?.id || '' });
  teamA.ele('name').txt(obj.teamA?.name || '').up();
  teamA.ele('tag').txt(obj.teamA?.tag || '').up();
  teamA.ele('score').txt(String(obj.scoreA)).up();
  teamA.up();
  const teamB = doc.ele('teamB', { id: obj.teamB?.id || '' });
  teamB.ele('name').txt(obj.teamB?.name || '').up();
  teamB.ele('tag').txt(obj.teamB?.tag || '').up();
  teamB.ele('score').txt(String(obj.scoreB)).up();
  teamB.up();
  doc.ele('winnerId').txt(obj.winnerId || '').up();
  doc.ele('loserId').txt(obj.loserId || '').up();
  doc.ele('status').txt(obj.status).up();
  doc.ele('startedAt').txt(obj.startedAt || '').up();
  doc.ele('endedAt').txt(obj.endedAt || '').up();
  const roundsEl = doc.ele('rounds');
  for (const r of obj.roundHistory || []) {
    roundsEl.ele('round', { number: r.round, winningSide: r.winningSide, winningTeam: r.winningTeam });
  }
  return doc.end({ prettyPrint: true });
}

module.exports = { matchToResultObject, matchToJSON, matchToXML };
