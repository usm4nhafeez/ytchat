// decode_page.js — dumps every _dec([...],k) string in an obfuscated giveaway page.
// usage: node decode_page.js <index.html>
const fs = require('fs');
const t = fs.readFileSync(process.argv[2] || 'D:/rea-work/forestcampff02/index.html', 'utf8');
for (const m of t.matchAll(/_dec\[((?:\s*0x[0-9a-fA-F]+\s*,?)+)\]\s*,\s*(\d+)\)/g)) {
  const bytes = m[1].split(',').map(s => parseInt(s.trim(), 16));
  const k = Number(m[2]);
  console.log(JSON.stringify(bytes.map((v, i) => String.fromCharCode(v ^ ((k + i) % 256))).join('')));
}
