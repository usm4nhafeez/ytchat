const fs = require('fs'), { parse } = require('./ownertok.js');
const msgs = fs.readFileSync('stream.jsonl', 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(o => !o._meta);
const g = {};
for (const m of msgs.filter(x => x.isOwner)) {
  const r = parse(m.text || '');
  const who = (m.text.split(/[,;]/)[0] || '').trim();
  console.log(((Number(m.offsetMs) || 0) / 60000).toFixed(1).padStart(6), who.padEnd(16), r.code || '(no code)', r.token || '(no token)');
  if (r.code && r.token) (g[r.code] = g[r.code] || []).push(r.token);
}
console.log('\nper code:');
for (const [k, v] of Object.entries(g)) console.log('  ' + k + ': ' + v.length + ' issued, ' + new Set(v).size + ' unique [' + [...new Set(v)].join(' ') + ']');
