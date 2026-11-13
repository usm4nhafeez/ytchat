// build_data.js — one pass over a captured chat.jsonl, writes the reduced file set next to it:
//   admin_comments.txt  every owner/mod message, merged (username prefix), replaces per-user files
//   triples.jsonl       uid + code + token side by side — the "all three attributes" file
//   uid_index.json      uid -> every message mentioning it (graph-like lookup for searching UIDs)
//   codes.json          multipliers proven in THIS stream: VERIFIED against the table or REVERSED
//   usage: node build_data.js <chat.jsonl>   (reads the repo's global codes.json for verification)
const fs = require('fs');
const path = require('path');
const { parse } = require('./ownertok.js');

const K = 4921n;
const tokenOf = (uid, m) => (BigInt(String(uid).slice(0, 5)) * BigInt(m) + K).toString().slice(0, 5);
// shortcut: 4-digit multiplier scan only (matches every multiplier seen so far); widen if a 5-digit one ever appears
function reverseMultipliers(uid, token, digits = 4) {
  const hits = [];
  for (let m = 10 ** (digits - 1); m < 10 ** digits; m++) if (tokenOf(uid, m) === String(token)) hits.push(m);
  return hits;
}
const normName = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const UIDS = t => [...(t || '').matchAll(/\b(\d{8,12})\b/g)].map(m => m[1]);
const TOK = /\btoken\s*\.?\s*(?:id)?\s*[:=#-]?\s*(\d{4,6})\b/i;
const CODEIN = /\bgift\s*-?\s*code\s*[:=#-]?\s*([A-Za-z][A-Za-z0-9]{1,15}|[0-9][A-Za-z0-9]{2,15})\b/i;

const file = process.argv[2] || 'chat.jsonl';
const dir = path.dirname(file);
const msgs = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(o => !o._meta);
const table = JSON.parse(fs.readFileSync(path.join(__dirname, 'codes.json'), 'utf8'));

// 1) admin comments — merged into one file
const admin = msgs.filter(m => m.isOwner || m.isMod).map(m => {
  const off = Math.floor(Number(m.offsetMs || 0) / 1000);
  return `+${String(Math.floor(off / 60)).padStart(2, '0')}:${String(off % 60).padStart(2, '0')}  ${(m.author || '').replace(/^@/, '')}: ${m.text}`;
});
fs.writeFileSync(path.join(dir, 'admin_comments.txt'), admin.join('\n') + '\n');

// 2) uid index — every uid mentioned anywhere -> the messages that mention it
const uidIndex = {};
for (const m of msgs) for (const u of UIDS(m.text)) {
  (uidIndex[u] = uidIndex[u] || []).push({ ts: m.ts, author: m.author, text: m.text.trim().slice(0, 140) });
}
fs.writeFileSync(path.join(dir, 'uid_index.json'), JSON.stringify(uidIndex, null, 1));

// 3) announcements (owner) and triples (uid+code+token)
// ownertok.parse misses the bare "NAME, CODE, TOKEN ID - nnn" form; fall back to the middle comma segment.
const own = [];
for (const m of msgs.filter(x => x.isOwner)) {
  const t = m.text || '';
  let { code, token } = parse(t);
  const segs = t.split(/[,;]/).map(s => s.trim());
  if (!code && token) { // bare "name, CODE, TOKEN ID - nnn": code sits in the segment after the name
    const bare = (segs[1] || '').replace(/^gift\s*-?\s*code\s*[:=#-]?\s*/i, '').trim();
    if (/^[A-Za-z0-9][A-Za-z0-9 \-]{1,15}$/.test(bare) && /[A-Za-z]/.test(bare) && !/^(?:the|is|and|or|no|yes|note)$/i.test(bare)) code = bare.replace(/[\s-]/g, '').toUpperCase();
  }
  if (!code && !token) continue;
  own.push({ ts: m.ts, name: (segs[0] || '').trim(), code, token });
}
const byName = new Map(); // viewer display name -> uids they posted
for (const m of msgs) {
  if (m.isOwner) continue;
  const us = UIDS(m.text);
  if (!us.length) continue;
  const k = normName(m.author);
  if (!k) continue;
  if (!byName.has(k)) byName.set(k, new Set());
  us.forEach(u => byName.get(k).add(u));
}
const triples = [];
for (const m of msgs) { // a) viewer message carrying uid + token (+ code if written) in one post
  if (m.isOwner) continue;
  const us = UIDS(m.text), tk = (m.text.match(TOK) || [])[1];
  if (!tk || !us.length) continue;
  const cd = (m.text.match(CODEIN) || [])[1];
  for (const uid of us) triples.push({ source: 'claim', player: m.author, uid, code: cd ? cd.toUpperCase() : null, token: tk, ts: m.ts });
}
for (const a of own) { // b) announcement winner name joined to the UIDs that person posted in chat
  if (!a.code || !a.token) continue;
  const k = normName(a.name);
  let match = byName.get(k);
  if (!match) for (const [kk, v] of byName) if (kk.length > 3 && (kk.includes(k) || k.includes(kk))) { match = v; break; }
  if (!match) continue;
  for (const uid of match) triples.push({ source: 'name-join', player: a.name, uid, code: a.code, token: a.token, ts: a.ts });
}
fs.writeFileSync(path.join(dir, 'triples.jsonl'), triples.map(t => JSON.stringify(t)).join('\n') + (triples.length ? '\n' : ''));

// 4) per-stream codes.json — verify table codes, reverse-solve unknown ones from triples
// name-join can pair a winner's announcement with a UID another viewer posted under a similar nickname,
// so score each candidate multiplier by how many pairs it explains and keep the clear winner.
const byCode = {};
for (const t of triples) if (t.code && t.token) (byCode[t.code] = byCode[t.code] || []).push(t);
const solve = pairs => {
  const freq = new Map();
  for (const p of pairs) for (const m of new Set(reverseMultipliers(p.uid, p.token))) freq.set(m, (freq.get(m) || 0) + 1);
  const best = [...freq].sort((a, b) => b[1] - a[1]);
  return !best.length || best[0][1] === (best[1] ? best[1][1] : 0) ? null : best[0];
};
const solved = {};
console.log(`messages: ${msgs.length} | admin: ${admin.length} | announcements: ${own.length} | triples: ${triples.length} | uids indexed: ${Object.keys(uidIndex).length}`);
const seen = new Set(own.map(a => a.code).filter(Boolean));
for (const code of [...seen].sort()) {
  const pairs = byCode[code] || [];
  const inTable = table[code] !== undefined;
  const ok = inTable ? pairs.filter(p => tokenOf(p.uid, table[code]) === p.token).length : 0;
  if (ok) { solved[code] = table[code]; console.log(`  ${code.padEnd(12)} VERIFIED m=${String(table[code]).padEnd(5)} (${ok}/${pairs.length} uid pairs match)`); continue; }
  if (!pairs.length) { if (inTable) solved[code] = table[code]; console.log(`  ${code.padEnd(12)} ${inTable ? 'kept from table, no uid pairs' : 'pending — announced, no winner UID in chat'}`); continue; }
  const r = solve(pairs);
  if (r) { solved[code] = r[0]; console.log(`  ${code.padEnd(12)} REVERSED m=${String(r[0]).padEnd(5)} (${r[1]}/${pairs.length} pairs agree)` + (inTable && table[code] !== r[0] ? ` TABLE WRONG (had ${table[code]})` : '')); }
  else console.log(`  ${code.padEnd(12)} AMBIGUOUS — ${pairs.length} uid pair(s), no single multiplier explains more`);
}
fs.writeFileSync(path.join(dir, 'codes.json'), JSON.stringify(solved, null, 2) + '\n');
console.log(`-> ${dir}/admin_comments.txt  triples.jsonl  uid_index.json  codes.json (${Object.keys(solved).length} solved)`);
