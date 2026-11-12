// check_uid_claims.js — how usable is a captured chat for giftcode extraction
const fs = require('fs');
const msgs = fs.readFileSync(process.argv[2] || 'data/2026-11-12/9R1tphE_2oE/chat.jsonl', 'utf8')
  .split('\n').filter(Boolean).map(JSON.parse).filter(o => !o._meta);
console.log('messages:', msgs.length, '| owner:', msgs.filter(m => m.isOwner).length, '| mod/admin:', msgs.filter(m => m.isMod || m.isOwner).length);
const uidRe = /\buid\b[^0-9]*(\d{8,12})/i, tokRe = /\btoken\b[^0-9]*(\d{4,6})/i,
      codeRe = /gift ?code[^a-z0-9]*([a-z][a-z0-9]{2,15}|\d[a-z0-9]{2,15})/i;
const withUid = msgs.filter(m => uidRe.test(m.text));
const withUidTok = withUid.filter(m => tokRe.test(m.text));
const full = withUidTok.filter(m => codeRe.test(m.text));
console.log('msgs mentioning UID:', withUid.length, '| +token:', withUidTok.length, '| +giftcode:', full.length);
for (const m of full.slice(0, 8)) console.log(' e.g.', (m.isOwner ? 'OWNER ' : m.isMod ? 'MOD ' : '') + m.text.trim().slice(0, 120));
const codes = {};
for (const m of full) { const c = m.text.match(codeRe)[1].toUpperCase(); (codes[c] ||= []).push([uidRe.exec(m.text)[1], tokRe.exec(m.text)[1]]); }
for (const [c, pairs] of Object.entries(codes)) console.log(c, pairs.length, 'uid+token pairs;', new Set(pairs.map(p => p[0])).size, 'distinct uids');
