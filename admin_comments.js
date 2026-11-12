// admin_comments.js — every admin/owner chat message, split into one file per username.
// usage: node admin_comments.js stream.jsonl   ->   <username>_admin_comments.txt
const fs = require('fs');
const file = process.argv[2] || 'stream.jsonl';
const msgs = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(o => !o._meta);
const pad = n => String(n).padStart(2, '0');
const byAdmin = new Map();
for (const m of msgs.filter(x => x.isOwner || x.isMod)) {
  const name = (m.author || 'unknown').replace(/^@/, '').replace(/[^\w.-]/g, '_');
  if (!byAdmin.has(name)) byAdmin.set(name, []);
  const off = Math.floor(Number(m.offsetMs || 0) / 1000);
  byAdmin.get(name).push(`+${pad(Math.floor(off / 60))}:${pad(off % 60)}  ${m.text}`);
}
for (const [name, lines] of byAdmin) {
  const out = file.replace(/\.jsonl$/, '') + '_' + name + '_admin_comments.txt';
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(`${out}  (${lines.length} comments)`);
}
