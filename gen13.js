// one-shot: verify the 5 candidate multipliers against every claim we have (chat-joined + Usman's pasted pairs)
const fs = require('fs'), C = 4921n;
const msgs = fs.readFileSync('stream.jsonl', 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(o => !o._meta);
const { parse } = require('./ownertok.js');
const triples = JSON.parse(fs.readFileSync('stream_triples.json', 'utf8'));
const tok = (p, m) => (BigInt(String(p).slice(0, 5)) * BigInt(m) + C).toString().slice(0, 5);
const fits = (uid, t, m) => tok(uid, m) === t;
const rev = (uid, t) => { const out = []; for (let m = 10; m <= 99999; m++) if (fits(uid, t, m)) out.push(m); return out; };
const cand = { LIVEWIN: 2525, BIG100: 8000, C65: 4321, BIG99: 4643, BIG200: 2000 };

console.log('--- BIG200 joined triple ---');
for (const t of triples.filter(t => t.code === 'BIG200'))
  console.log(`  ${t.player} uid=${t.uid} token=${t.token} -> all m: ${rev(t.uid, t.token).join(',')} | m=2000 fits? ${fits(t.uid, t.token, 2000)}`);

console.log('\n--- Usman pasted claims ---');
const pasted = [['seal_sa_gamer', 998433195, 'C65', '43142'], ['faruq', 744882187, '(no code)', '18808'],
                ['guidegamerfan', 1908883686, 'LIVEWIN', '48202'], ['Mrislem', 4098237899, 'BIG99', '19028']];
for (const [who, uid, code, t] of pasted) {
  const all = rev(uid, t), four = all.filter(m => m >= 1000 && m <= 9999);
  console.log(`  ${who.padEnd(14)} ${String(uid).slice(0, 5)} -> ${t} | every m in 10..99999: ${all.join(',') || 'NONE'} | 4-digit: ${four.join(',')}` +
    (code in cand ? ` | ${code}=${cand[code]} fits? ${fits(uid, t, cand[code])}` : ''));
}

console.log('\n--- each candidate vs ALL owner tokens of its code (reachability) ---');
const owner = {};
for (const m of msgs.filter(x => x.isOwner)) { const r = parse(m.text || ''); if (r.code && r.token) (owner[r.code] = owner[r.code] || new Set()).add(r.token); }
const reach = (m, t) => { for (let d = 6; d <= 12; d++) { const k = 10n ** BigInt(d - 5), lo = BigInt(t) * k, hi = lo + k - 1n;
  let a = (lo - C + BigInt(m) - 1n) / BigInt(m), b = (hi - C) / BigInt(m); if (a < 10000n) a = 10000n; if (b > 99999n) b = 99999n; if (b >= a) return true; } return false; };
for (const [code, m] of Object.entries(cand)) {
  const toks = [...(owner[code] || [])];
  console.log(`  ${code.padEnd(7)} m=${String(m).padStart(4)} reachable for all ${toks.length} tokens? ${toks.every(t => reach(m, t))}` +
    ` | tokens it CANNOT produce for any 5-digit UID: ${toks.filter(t => !reach(m, t)).join(',') || 'none'}`);
  const n4 = []; for (let x = 1000; x <= 9999; x++) if (toks.every(t => reach(x, t))) n4.push(x);
  const l = triples.filter(t => t.code === code);
  const pin = n4.filter(x => l.every(t => fits(t.uid, t.token, x)));
  console.log(`          4-digit owner-consistent: ${n4.length}, of which explain ALL ${l.length} joined triples: ${pin.length ? pin.join(',') : 'none'}`);
}
