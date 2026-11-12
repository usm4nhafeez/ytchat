#!/usr/bin/env node
/*
  ytchat.js — YouTube live-chat scraper (replay + live) and claim analyser.
  Zero dependencies, uses global fetch (Node 18+).

  USAGE
    node ytchat.js pull <video-url-or-id> [-o chat.jsonl] [--max N] [--interval MS]
    node ytchat.js scan <chat.jsonl> [--owner] [--uid 7859077268] [--grep REGEX]
                         [--codes codes.json] [--claims-out claims.jsonl] [--json]

  EXAMPLE
    node ytchat.js pull "https://youtu.be/1ZHoZD9G7Dw"
    node ytchat.js scan chat.jsonl --owner
    node ytchat.js scan chat.jsonl --codes codes.json     # verify / reverse giftcode claims
*/

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const FORMULA_CONST = 4921n;                       // first5(UID) * m + 4921, take first 5 digits
let CLIENT_VERSION = '2.20261105.05.01';            // replaced from the watch page when reachable

const arg = (name, def = undefined) => {
  for (const flag of ['--' + name, '-' + name]) {
    const i = process.argv.indexOf(flag);
    if (i !== -1) { const v = process.argv[i + 1]; return v && !v.startsWith('-') ? v : true; }
  }
  return def;
};
const videoIdOf = s => {
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  throw new Error('not a YouTube video url/id: ' + s);
};

async function innertube(endpoint, body, attempt = 0) {
  let res;
  try {
    res = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ ...body, context: { client: { clientName: 'WEB', clientVersion: CLIENT_VERSION, hl: 'en', gl: 'US' } } }),
    });
  } catch (e) {                                  // transient network failure (fetch failed / reset)
    if (attempt >= 6) throw new Error(`${endpoint} network failure after ${attempt} retries: ${e.message}`);
    const wait = 2 ** attempt * 1200;
    process.stderr.write(`  ! ${e.message}, retrying in ${wait}ms\n`);
    await new Promise(r => setTimeout(r, wait));
    return innertube(endpoint, body, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`${endpoint} failed: HTTP ${res.status}`);
    const wait = Number(res.headers.get('retry-after')) || 2 ** attempt * 1500;
    process.stderr.write(`  ! HTTP ${res.status}, retrying in ${wait}ms\n`);
    await new Promise(r => setTimeout(r, wait));
    return innertube(endpoint, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`${endpoint} failed: HTTP ${res.status}`);
  return res.json();
}

async function syncClientVersion(videoId) {
  try {
    const html = await (await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: { 'User-Agent': UA } })).text();
    const m = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([\d.]+-?[a-z0-9]*)"/);
    if (m) CLIENT_VERSION = m[1];
  } catch { /* keep the hardcoded fallback */ }
}

const walk = (node, key, out = []) => {
  if (!node || typeof node !== 'object') return out;
  if (key in node) out.push(node[key]);
  for (const v of Object.values(node)) walk(v, key, out);
  return out;
};
const textOf = runs => (runs || []).map(r => r.text ?? '').join('');
const ms = n => new Date(Number(n) / 1000).toISOString().replace('T', ' ').slice(0, 19);

async function pull(videoId, outFile, max, interval) {
  await syncClientVersion(videoId);
  const next = await innertube('next', { videoId });
  const player = await innertube('player', { videoId });
  const vd = player.videoDetails || {};
  const chat = walk(next, 'liveChatRenderer')[0];
  if (!chat) throw new Error('this video has no live chat (replay disabled, deleted, or it was never a stream)');

  const meta = {
    videoId, title: vd.title || null, channelId: vd.channelId || null, channel: vd.author || null,
    isReplay: !!chat.isReplay, totalMessages: textOf((chat.header?.liveChatHeaderRenderer || chat.header || {}).viewCount?.runs ||
      (chat.header?.liveChatHeaderRenderer || chat.header || {}).viewCount?.text?.runs) || null, fetchedAt: new Date().toISOString(),
  };
  process.stderr.write(`  ${meta.channel} — ${meta.title} (${meta.isReplay ? 'replay' : 'LIVE'}), ${meta.totalMessages || '?'} messages\n`);

  let continuation = (chat.continuations || []).map(c => c.reloadContinuationData?.continuation ||
    c.liveChatContinuationData?.continuation || c.invalidContinuationData?.continuation)[0];
  if (!continuation) throw new Error('no chat continuation token');

  const endpoint = meta.isReplay ? 'live_chat/get_live_chat_replay' : 'live_chat/get_live_chat';
  const seen = new Set();
  let written = 0, pages = 0, emptyStreak = 0;

  const { open } = await import('node:fs/promises');
  const fh = await open(outFile, 'w');
  await fh.write(JSON.stringify({ _meta: meta }) + '\n');

  while (continuation && (!max || written < max)) {
    const d = await innertube(endpoint, { continuation, timeoutMs: meta.isReplay ? undefined : 6000 });
    if (d.liveChatStopped) { process.stderr.write('  chat ended\n'); break; }
    const cont = d.continuationContents?.liveChatContinuation || {};
    pages++;
    for (const action of cont.actions || []) {
      const items = action.replayChatItemAction?.actions || [action];
      for (const it of items) {
        const item = it.addChatItemAction?.item || it.addLiveChatTextMessageFromTemplateAction?.template || {};
        const r = item.liveChatTextMessageRenderer || item.liveChatPaidMessageRenderer ||
                  item.liveChatViewerEngagementMessageRenderer || item.liveChatPaidStickerRenderer || null;
        if (!r) continue;
        const author = r.authorName?.simpleText || r.author?.simpleText || null;
        const chanId = r.authorExternalChannelId || r.channelId || null;
        const msg = {
          id: r.id, ts: r.timestampUsec ? ms(r.timestampUsec) : null, tsUsec: r.timestampUsec || null,
          offsetMs: action.replayChatItemAction?.videoOffsetTimeMsec || it.replayChatItemAction?.videoOffsetTimeMsec || null,
          author, channelId: chanId, isOwner: !!(r.badges || r.authorBadges || []).some(b => /owner/i.test(JSON.stringify(b))) || !!(meta.channelId && chanId === meta.channelId),
          isMod: !!(r.badges || r.authorBadges || []).some(b => /moderator/i.test(JSON.stringify(b))),
          paid: !!(r.purchaseAmountText || r.paymentSuperchatContent), text: textOf(r.message?.runs) || '', kind: Object.keys(item)[0],
        };
        if (seen.has(msg.id)) continue;
        if (max && written >= max) break;
        seen.add(msg.id);
        await fh.write(JSON.stringify(msg) + '\n'); written++;
      }
    }
    const nextTok = (cont.continuations || []).map(c => c.liveChatReplayContinuationData?.continuation ||
      c.liveChatContinueContinuationData?.continuation || c.invalidationContinuationData?.continuation ||
      c.timingContinuationData?.continuation).filter(Boolean)[0];
    if (nextTok) { continuation = nextTok; emptyStreak = cont.actions?.length ? 0 : emptyStreak + 1; }
    else if (meta.isReplay) { process.stderr.write(`  replay exhausted\n`); continuation = null; }
    else continuation = null;
    if (emptyStreak >= 3 && meta.isReplay) { process.stderr.write('  stopped: 3 empty pages in a row\n'); break; }
    if (pages % 10 === 0) process.stderr.write(`  ${written} messages (${pages} pages) ...\n`);
    if (meta.isReplay && interval) await new Promise(r => setTimeout(r, interval));
  }
  await fh.close();
  process.stderr.write(`  done: ${written} messages -> ${outFile}\n`);
  return { written, pages };
}

// ---------- claim parsing / verification ----------
const tokenOf = (uid, m) => (BigInt(String(uid).slice(0, 5)) * BigInt(m) + FORMULA_CONST).toString().slice(0, 5);
function reverseMultipliers(uid, token, digits = 4) {
  const hits = [];
  for (let m = 10 ** (digits - 1); m < 10 ** digits; m++) if (tokenOf(uid, m) === String(token)) hits.push(m);
  return hits;
}
function parseClaims(text) {
  const t = ' ' + text.replace(/\s+/g, ' ') + ' ';
  const uid = (t.match(/\b(?:uid|player\s*id)\s*[:=#-]?\s*(\d{8,12})\b/i) || [])[1];
  const code = (t.match(/\bgift\s*-?\s*code\s*[:=#-]?\s*([A-Za-z][A-Za-z0-9]{1,19}|[0-9][A-Za-z0-9]{2,19})\b/i) || [])[1];
  const tok = (t.match(/\btoken\s*-?\s*(?:id)?\s*[:=#-]?\s*(\d{4,6})\b/i) || [])[1];
  if (!code && !uid) return [];
  return [{ uid: uid || null, code: code ? code.toUpperCase() : null, token: tok || null }];
}

async function scan(file, opts) {
  const fs = await import('node:fs/promises');
  const lines = (await fs.readFile(file, 'utf8')).split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const meta = lines.find(l => l._meta)?._meta || {};
  const msgs = lines.filter(l => !l._meta);

  let rows = msgs;
  if (opts.owner) rows = rows.filter(m => m.isOwner);
  if (opts.uid) rows = rows.filter(m => String(m.text).includes(opts.uid) || m.author === opts.uid);
  if (opts.grep) rows = rows.filter(m => new RegExp(opts.grep, 'i').test(m.text));

  const codes = opts.codes ? JSON.parse(await fs.readFile(opts.codes, 'utf8')) : null;
  const claims = [];
  for (const m of rows) for (const c of parseClaims(m.text)) claims.push({ ...c, author: m.author, ts: m.ts, raw: m.text.trim().slice(0, 160) });

  const verdicts = claims.map(c => {
    if (c.uid && c.token && codes && codes[c.code] !== undefined) {
      const exp = tokenOf(c.uid, codes[c.code]);
      return { ...c, verdict: exp === c.token ? 'VERIFIED' : 'WRONG', expected: exp, multiplier: codes[c.code] };
    }
    if (c.uid && c.token) {
      const hits = reverseMultipliers(c.uid, c.token);
      return { ...c, verdict: hits.length === 1 ? 'REVERSED' : hits.length ? 'AMBIGUOUS' : 'IMPOSSIBLE', candidates: hits.slice(0, 20) };
    }
    return { ...c, verdict: 'NO-UID' };
  });

  if (opts.json) { console.log(JSON.stringify({ meta, matched: rows.length, claims: verdicts }, null, 2)); }
  else {
    console.log(`${msgs.length} messages loaded | ${rows.length} matched${opts.owner ? ' (owner only)' : ''}`);
    for (const m of rows.slice(0, opts.limit)) console.log(`[${m.ts}] ${m.isOwner ? '** OWNER **' : ''} ${m.author}: ${m.text.trim().slice(0, 140)}`);
    if (claims.length) {
      console.log(`\nclaims (${claims.length}):`);
      for (const v of verdicts) console.log(`  ${v.code || '-'} uid=${v.uid || '-'} token=${v.token || '-'} -> ${v.verdict}` +
        (v.multiplier ? ` m=${v.multiplier} expected=${v.expected}` : '') + (v.candidates ? ` candidates=${v.candidates.join(',')}` : '') + `  [${v.author}]`);
    }
  }
  if (opts.claimsOut) { await fs.writeFile(opts.claimsOut, verdicts.map(v => JSON.stringify(v)).join('\n') + '\n'); console.log(`claims -> ${opts.claimsOut}`); }
  return { rows, verdicts };
}

(async () => {
  const cmd = process.argv[2];
  if (cmd === 'pull') {
    const target = process.argv[3];
    if (!target) throw new Error('usage: node ytchat.js pull <video-url-or-id> [-o chat.jsonl] [--max N] [--interval MS]');
    await pull(videoIdOf(target), arg('o', arg('out', 'chat.jsonl')), Number(arg('max', 0)) || 0, Number(arg('interval', 0)) || 0);
  } else if (cmd === 'scan') {
    const target = process.argv[3];
    if (!target) throw new Error('usage: node ytchat.js scan <chat.jsonl> [--owner] [--uid N] [--grep RE] [--codes f.json] [--claims-out f.jsonl] [--limit N] [--json]');
    await scan(target, { owner: !!arg('owner'), uid: arg('uid'), grep: arg('grep'), codes: arg('codes'), claimsOut: arg('claims-out'), json: !!arg('json'), limit: Number(arg('limit', 200)) });
  } else {
    console.log(`ytchat — YouTube live chat pull + analysis

  node ytchat.js pull <url|id> [-o chat.jsonl] [--max N] [--interval MS]
  node ytchat.js scan <chat.jsonl> [--owner] [--uid 7859077268] [--grep REGEX]
                       [--codes codes.json] [--claims-out claims.jsonl] [--limit N] [--json]

  codes.json shape: {"COIN65":1234,"9GIFT":1999}  (same table as the panel)
  scan parses "UID ... Giftcode ... token" comments, verifies them against the formula,
  and for unknown codes reverses the multiplier (REVERSED = unique 4-digit fit).`);
  }
})().catch(e => { console.error('error: ' + e.message); process.exit(1); });
