// export_claims.js — turns a pulled chat into a reviewable owner-announcements table.
// usage: node export_claims.js camp.jsonl
const fs = require('fs');
const file = process.argv[2] || 'camp.jsonl';
const msgs = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(o => !o._meta);

const KW = /^(LIVE55|LIVE|SUPERCOIN9|COIN9|COIN65|9GIFT|OPENGIFT8|SURPRISE55|CAMPLIVE4|BIG666|LIVE4|100KGIFT)$/;
const { parse, normCode: norm } = require('./ownertok.js');
const rows = [['time_utc', 'offset', 'player', 'giftcode', 'token']];
for (const m of msgs.filter(x => x.isOwner)) {
  const t = m.text || '';
  let { code, token } = parse(t);
  if (!code) {
    const w = [...t.matchAll(/\b([A-Za-z][A-Za-z0-9-]{2,15})\b/g)].map(x => x[1]).filter(x => KW.test(x));
    if (w.length) code = norm(w[0]);
  }
  if (!code && !token) continue;                 // room id / password / link posts
  const off = m.offsetMs ? Math.floor(Number(m.offsetMs) / 1000) : null;
  rows.push([m.ts, off === null ? '' : `${Math.floor(off / 60)}:${String(off % 60).padStart(2, '0')}`,
             (t.split(/[,;]/)[0] || '').trim().slice(0, 28), code || '(unreadable)', token || '']);
}
const esc = v => /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
const out = file.replace(/\.jsonl$/, '') + '_owner_claims.csv';
fs.writeFileSync(out, rows.map(r => r.map(esc).join(',')).join('\n'));

const g = {};
for (const r of rows.slice(1)) (g[r[3] || '(unreadable)'] = g[r[3] || '(unreadable)'] || []).push(r[4]);
console.log(`owner announcement rows: ${rows.length - 1} -> ${out}`);
for (const [c, v] of Object.entries(g).sort((a, b) => b[1].length - a[1].length))
  console.log(`  ${c.padEnd(13)} ${String(v.length).padStart(2)} issued, ${new Set(v).size} unique tokens: ${[...new Set(v)].join(' ')}`);

// non-owner messages that carry a code+token or uid+token (real claims from players)
const claims = [];
for (const m of msgs) {
  if (m.isOwner) continue;
  const t = m.text || '';
  const uid = (t.match(/\b(?:uid|player\s*id)\s*[:=#-]?\s*(\d{8,12})\b/i) || [])[1];
  const cm = t.match(/gift\s*-?\s*code\s*[:=#-]?\s*([A-Za-z0-9][A-Za-z0-9 \-]{1,14}?)[,\s]/i);   // players write code/token in any order
  const tm = t.match(/\btoken\s*\.?\s*(?:id)?\s*[:=#-]?\s*(\d{4,6})\b/i);
  if (uid && (cm || tm)) claims.push({ ts: m.ts, author: m.author, uid, code: norm(cm && cm[1]), token: tm && tm[1], text: t });
}
fs.writeFileSync(file.replace(/\.jsonl$/, '') + '_player_claims.jsonl', claims.map(c => JSON.stringify(c)).join('\n') + (claims.length ? '\n' : ''));
console.log(`player messages with a UID + code/token: ${claims.length} -> ${file.replace(/\.jsonl$/, '')}_player_claims.jsonl`);
