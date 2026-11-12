// build_panel.js — rewrites the live panel copies (%TEMP%\live_index.html + live_G.html):
//   index.html: every known multiplier, newest first, LIVE_CODES = the active set
//   G.html:     the active set only (it always mirrors LIVE_CODES), newest first
// usage: node build_panel.js     -> writes %TEMP%\new_panel_index.html + new_panel_G.html
const fs = require('fs');
const T = process.env.TEMP + '/';

// claimable in the map right now, newest first (gen-15 = 2026-11-10 stream night)
const ACTIVE = [['LIVECHAT', 6226], ['COINS67', 4624], ['GIFT111', 1010], ['150GIFT', 5151]];
// everything known, newest first: active block on top, then the expired generations in reverse release order
const EXPIRED = [['DIWALI2026', 6767], ['BIG200', 2000], ['BIG99', 4643], ['C65', 4321], ['BIG100', 8000], ['LIVEWIN', 2525], ['9GIFT', 1999],
  ['COIN65', 1234], ['OPENGIFT8', 8787], ['LIVE4', 4444], ['BIG666', 6666], ['CAMPLIVE4', 3185],
  ['SURPRISE55', 5555], ['100KGIFT', 7952], ['LIVEGIFT3', 6549], ['LIVE1', 7545], ['SURPRISE23', 9854],
  ['WINNER016', 2342], ['FINAL33', 8865], ['GIFT02', 3454], ['TARGET101', 1232], ['SUBSCRIBE120', 9977],
  ['GHOST22', 8976], ['FFINDIA', 4568]];

const key = c => (/^\d/.test(c) ? `"${c}"` : c);                       // digit-leading keys need quotes in JS
const map = list => '{ ' + list.map(([c, m]) => `${key(c)}: ${m}`).join(', ') + ' }';
const LIST = [...ACTIVE, ...EXPIRED];

for (const [src, out, body] of [
  ['live_index.html', 'new_panel_index.html',
   [`const GIFT_CODE_MULTIPLIERS = ${map(LIST)};`, `const LIVE_CODES = [${ACTIVE.map(([c]) => `"${c}"`).join(', ')}];`]],
  ['live_G.html', 'new_panel_U.html', [`const GIFT_CODE_MULTIPLIERS = ${map(ACTIVE)};`]],
]) {
  const text = fs.readFileSync(T + src, 'utf8');
  const t = text.split('\n').map(l => {
    const s = l.trim();
    if (s.startsWith('const GIFT_CODE_MULTIPLIERS =')) return '      ' + body[0];
    if (s.startsWith('const LIVE_CODES =')) return '      ' + body[1];
    return l;
  }).join('\n');
  if (t === text) throw new Error(src + ': nothing replaced');
  const pw = s => (s.match(/const PANEL_PASSWORD\s*=\s*"[^"]*"/) || [''])[0];
  if ((text.match(/const PANEL_PASSWORD/g) || []).length !== (t.match(/const PANEL_PASSWORD/g) || []).length || pw(text) !== pw(t)) {
    throw new Error('PASSWORD LINE CHANGED - abort');
  }
  fs.writeFileSync(T + out, t);
  console.log(`${out.padEnd(22)} ${String(t.length).padStart(5)}B  codes=${(t.match(/const GIFT_CODE_MULTIPLIERS = \{([^}]*)\}/)[1].match(/:/g) || []).length}  password_unchanged=true`);
}
