// pin.js — pins new multipliers from ONE stream:
//   A) hard constraint: m must make EVERY owner-announced token for that code reachable
//   B) strict join: winner display name == the sender who posted that UID (exact, normalized)
// usage: node pin.js camp.jsonl
const fs = require('fs');
const { parse, normCode } = require('./ownertok.js');
const CONST = 4921n;
const msgs = fs.readFileSync(process.argv[2] || 'camp.jsonl', 'utf8').split('\n').filter(Boolean)
  .map(JSON.parse).filter(o => !o._meta);

const normName = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const KW = /^(LIVE55|SUPERCOIN9|COIN65|COIN9|9GIFT|OPENGIFT8|SURPRISE55|CAMPLIVE4|BIG666|LIVE4|100KGIFT|LIVEWIN|BIG100|BIG200|BIG99|C65)$/;

// --- A) owner tokens grouped by code
const ownerTok = {};
for (const m of msgs.filter(x => x.isOwner)) {
  const r = parse(m.text || ''); if (!r.token) continue;
  let code = r.code;
  if (!code) { const w = [...m.text.matchAll(/\b([A-Za-z][A-Za-z0-9-]{2,15})\b/g)].map(x => x[1]).filter(x => KW.test(normCode(x))); code = w.length ? normCode(w[0]) : '(?)'; }
  if (code === '(?)') continue;
  (ownerTok[code] = ownerTok[code] || new Set()).add(r.token);
}
function reachable(m, tok) {                    // exists 5-digit prefix with first5(p*m+4921)==tok
  for (let d = 6; d <= 12; d++) {
    const k = 10n ** BigInt(d - 5), lo = BigInt(tok) * k, hi = lo + k - 1n;
    let a = (lo - CONST + BigInt(m) - 1n) / BigInt(m), b = (hi - CONST) / BigInt(m);   // ceil, floor
    if (a < 10000n) a = 10000n; if (b > 99999n) b = 99999n;
    if (b >= a) return true;
  }
  return false;
}
const feasibleSets = {};
for (const [code, toks] of Object.entries(ownerTok)) {
  const s = [];
  for (let m = 10; m <= 99999; m++) if ([...toks].every(t => reachable(m, t))) s.push(m);
  feasibleSets[code] = s;
  console.log(`${code.padEnd(11)} owner tokens=${String(toks.size).padStart(2)} -> m consistent with ALL: ${s.length}${s.length && s.length <= 12 ? ' [' + s.join(',') + ']' : ''}`);
}

// --- B) strict triples: exact same display name
const winners = new Map();
for (const m of msgs.filter(x => x.isOwner)) {
  const r = parse(m.text || ''); if (!r.token) continue;
  let code = r.code;
  if (!code) { const w = [...m.text.matchAll(/\b([A-Za-z][A-Za-z0-9-]{2,15})\b/g)].map(x => x[1]).filter(x => KW.test(normCode(x))); code = w.length ? normCode(w[0]) : null; }
  if (!code) continue;
  const key = normName(m.text.split(/[,;]/)[0]);
  if (!key) continue;
  if (!winners.has(key)) winners.set(key, []);
  winners.get(key).push({ code, token: r.token, player: m.text.split(/[,;]/)[0].trim() });
}
const triples = [];
for (const m of msgs) {
  if (m.isOwner) continue;
  const uids = [...(m.text || '').matchAll(/\b(\d{8,12})\b/g)].map(x => x[1]);
  if (!uids.length) continue;
  const w = winners.get(normName(m.author));
  if (!w) continue;
  for (const x of w) for (const u of uids) triples.push({ uid: u, ...x, author: m.author });
}
console.log(`\nstrict-name triples (winner name === sender who posted a UID): ${triples.length}`);
const perCode = {};
for (const t of triples) (perCode[t.code] = perCode[t.code] || []).push(t);
for (const [code, list] of Object.entries(perCode)) {
  const exact = [];
  for (const t of list) {
    const p = BigInt(t.uid.slice(0, 5));
    const ms = [];
    for (let m = 10; m <= 99999; m++) if ((p * BigInt(m) + CONST).toString().slice(0, 5) === t.token) ms.push(m);
    exact.push({ t, ms });
    console.log(`   uid=${t.uid} tok=${t.token} ${t.player.padEnd(18)} -> ${ms.length ? ms.slice(0, 8).join(',') + (ms.length > 8 ? '…' : '') : 'NO m (bad/mismatched pair)'}`);
  }
  const good = exact.filter(e => e.ms.length);
  let inter = good.length ? good[0].ms.filter(x => good.every(e => e.ms.includes(x))) : [];
  inter = inter.filter(m => (feasibleSets[code] || []).includes(m));
  console.log(`${code}: name-and-owner-constrained intersection -> ${inter.length ? inter.join(', ') : 'EMPTY'}` + (inter.length === 1 ? `   <<< m=${inter[0]}` : ''));
}
