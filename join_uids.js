// join_uids.js — links owner announcements (name + code + token) to the same player's own chat
// messages that contain a UID, producing (uid, code, token) triples that can pin a multiplier.
// usage: node join_uids.js camp.jsonl
const fs = require('fs');
const { parse } = require('./ownertok.js');
const msgs = fs.readFileSync(process.argv[2] || 'camp.jsonl', 'utf8').split('\n').filter(Boolean)
  .map(JSON.parse).filter(o => !o._meta);

const normName = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const uidOf = t => [...(t || '').matchAll(/\b(\d{8,12})\b/g)].map(m => m[1]);

const own = msgs.filter(m => m.isOwner && /gift\s*-?\s*code/i.test(m.text || ''))
  .map(m => {
    const { code: c, token } = parse(m.text || '');
    const name = (m.text.split(/[,;]/)[0] || '').trim();
    let code = c;
    if (!code) { const w = [...m.text.matchAll(/\b([A-Za-z][A-Za-z0-9-]{2,15})\b/g)].map(x => x[1])
      .filter(x => /coin|live|gift|super/i.test(x) && !/^the$|^is$|^gift\s*-?\s*code$/i.test(x)); if (w.length) code = w[0].toUpperCase(); }
    return { ts: m.ts, name, code, token, key: normName(name) };
  }).filter(a => a.key && a.code && a.token);

// every non-owner message that carries a UID, indexed by the sender's display name
const byName = new Map();
for (const m of msgs) {
  if (m.isOwner) continue;
  const uids = uidOf(m.text);
  if (!uids.length) continue;
  const k = normName(m.author);
  if (!k) continue;
  if (!byName.has(k)) byName.set(k, new Set());
  uids.forEach(u => byName.get(k).add(u));
}

let hits = 0;
const triples = [];
console.log(`owner announcements with a token: ${own.length} | chat senders that posted a UID: ${byName.size}`);
for (const a of own) {
  let match = byName.get(a.key), matchedKey = a.key;
  if (!match)                                    // loose: one name contains the other
    for (const [k, v] of byName) if (k.length > 3 && (k.includes(a.key) || a.key.includes(k))) { match = v; matchedKey = k; break; }
  if (!match) continue;
  hits++;
  for (const u of match) triples.push({ uid: u, code: a.code, token: a.token, player: a.name, ts: a.ts });
  console.log(`MATCH  ${a.name} | ${a.code} | token ${a.token} | uid(s) they posted: ${[...match].join(', ')} (as @${matchedKey})`);
}
fs.writeFileSync((process.argv[2] || 'camp.jsonl').replace(/\.jsonl$/, '') + '_triples.json', JSON.stringify(triples, null, 1));
console.log(`\ntriples written -> ${(process.argv[2] || 'camp.jsonl').replace(/\.jsonl$/, '')}_triples.json (${triples.length})`);
if (!hits) console.log('no owner-announced winner also posted their UID under the same display name.');

