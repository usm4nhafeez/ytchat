// vote.js — multiplier evidence by majority, not by strict intersection.
// For every code it scores all 10..99999 multipliers that (a) are reachable for EVERY owner-announced
// token of that code and (b) explain as many name-joined (uid, token) triples as possible.
// usage: node vote.js camp.jsonl camp_triples.json
const fs = require('fs');
const CONST = 4921n;
const msgs = fs.readFileSync(process.argv[2] || 'camp.jsonl', 'utf8').split('\n').filter(Boolean)
  .map(JSON.parse).filter(o => !o._meta);
const triples = JSON.parse(fs.readFileSync(process.argv[3] || 'camp_triples.json', 'utf8'));

const { parse, normCode } = require('./ownertok.js');
const KW = /^(LIVE55|SUPERCOIN9|COIN65|COIN9|9GIFT|OPENGIFT8|LIVEWIN|BIG100|BIG200|BIG99|C65)$/;

const ownerTok = {};
for (const m of msgs.filter(x => x.isOwner)) {
  const r = parse(m.text || '');
  let code = r.code;
  if (!code) { const w = [...m.text.matchAll(/\b([A-Za-z][A-Za-z0-9-]{2,15})\b/g)].map(x => x[1]).map(normCode).filter(x => KW.test(x)); code = w[0] || null; }
  if (!code || !r.token) continue;
  (ownerTok[code] = ownerTok[code] || new Set()).add(r.token);
}
function reachable(m, tok) {
  for (let d = 6; d <= 12; d++) {
    const k = 10n ** BigInt(d - 5), lo = BigInt(tok) * k, hi = lo + k - 1n;
    let a = (lo - CONST + BigInt(m) - 1n) / BigInt(m), b = (hi - CONST) / BigInt(m);
    if (a < 10000n) a = 10000n; if (b > 99999n) b = 99999n;
    if (b >= a) return true;
  }
  return false;
}
const exact = (uid, tok, m) => (BigInt(uid.slice(0, 5)) * BigInt(m) + CONST).toString().slice(0, 5) === tok;

for (const [code, toks] of Object.entries(ownerTok)) {
  const list = triples.filter(t => normCode(t.code) === code);
  const scores = new Map();
  const feas = [];
  for (let m = 10; m <= 99999; m++) if ([...toks].every(t => reachable(m, t))) feas.push(m);
  for (const m of feas) { let s = 0; for (const t of list) if (exact(t.uid, t.token, m)) s++; if (s) scores.set(m, s); }
  const top = [...scores].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5);
  console.log(`\n${code}: ${toks.size} owner tokens, ${list.length} joined triples, ${feas.length} owner-consistent m`);
  console.log(`   top explanation votes: ${top.length ? top.map(([m, s]) => `m=${m} explains ${s}/${list.length}`).join(' | ') : 'none of the triples fit any owner-consistent m'}`);
  const best = top[0];
  if (best && best[1] >= 3) {
    const miss = list.filter(t => !exact(t.uid, t.token, best[0]));
    console.log(`   best m=${best[0]} (${best[0] >= 1000 && best[0] <= 9999 ? '4-digit, matches every multiplier ever seen' : 'NOT 4-digit'}) — does NOT explain: ` +
      miss.map(t => `${t.player}/${t.uid}/${t.token}`).join(', '));
    list.filter(t => exact(t.uid, t.token, best[0])).slice(0, 5)
        .forEach(t => console.log(`   fits: ${t.player.padEnd(18)} prefix ${t.uid.slice(0, 5)} * ${best[0]} + 4921 -> ${t.token}`));
  }
}
