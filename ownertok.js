// ownertok.js — the single owner-announcement parser, shared by export_claims / join_uids / pin / vote.
// Formats seen in streams (the last two have NO "token" keyword, which is why they used to be dropped):
//   "sam, Giftcode - LIVEWIN, Token id - 56176"        "sam, NOTE* Giftcode will be claimable after live , Giftcode- BIG99, token id - 52280"
//   "sam, giftcode - big200, Giftcode - 17764 can be claimed after live"      "sam, Giftcode - C65, Giftcode - 12619"
const G = 'gift\\s*-?\\s*code\\s*[:=#-]?\\s*([A-Za-z][A-Za-z0-9 \\-]{1,14}?)';
const ONE = new RegExp(G + '\\s*,?\\s*token', 'i');                            // code right before the word "token"
const PAIR = new RegExp(G + '\\s*,\\s*gift\\s*-?\\s*code\\s*[:=#-]?\\s*(\\d{4,6})', 'i'); // "CODE, Giftcode - 12345"
const TOK = /\btoken\s*\.?\s*(?:id)?\s*[:=#-]?\s*(\d{4,6})\b/i;
const normCode = c => (c || '').replace(/[\s-]/g, '').toUpperCase().replace(/^LIVE$/, 'LIVE55'); // owner also writes "Live 55"

exports.parse = t => {
  let code = null, token = null, cm = t.match(ONE), tm = t.match(TOK);
  if (cm) code = normCode(cm[1]);
  if (tm) token = tm[1];
  const p = t.match(PAIR);
  if (p && (!code || !token)) { code = normCode(p[1]); token = token || p[2]; }
  return { code, token };
};
exports.normCode = normCode;
