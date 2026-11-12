# ytchat — automatic YouTube live-chat capture + giftcode analysis

Records every live stream of **@Guidegamer016** (Craftland/Forest Camp gift-code giveaways) with zero setup,
then lets you extract and verify giftcode claims from the saved chat.

## What it captures

Every stream's chat is saved into this repo under a date/video hierarchy:

```
data/
└── 2026-11-12/            # UTC date the capture was saved
    └── NSjjFsReZaY/       # YouTube video id
        ├── chat.jsonl                          # ALL chat messages (one JSON per line)
        ├── claims.jsonl                        # every giftcode claim found, with a verdict
        ├── owner_scan.txt                      # human-readable owner-announcement log
        └── chat_<admin>_admin_comments.txt     # every admin/owner comment, one file per username
```

`claims.jsonl` verdicts: `VERIFIED` (token matches the multiplier in `codes.json`), `WRONG`,
`REVERSED` (unknown code, unique 4-digit multiplier found — add it to `codes.json`), `AMBIGUOUS`,
`IMPOSSIBLE`, `NO-UID` (owner announced code+token but no UID was in the message).

## How it runs automatically

A GitHub Actions workflow (`capture.yml`) checks the channel every 15 minutes between
**5:00 PM and 10:45 PM PKT** (12:00–17:45 UTC). If a stream is live and not captured yet, it starts
recording and keeps going until the stream's chat ends. Captures never overlap and never cancel
each other. Already-captured videos are skipped.

## Run it manually on any video (live or past replay)

Two ways — pick whichever you have:

**A. GitHub website (nothing to install)**
1. Open <https://github.com/usm4nhafeez/ytchat/actions/workflows/capture.yml>
2. Click **Run workflow** (right side), paste the YouTube link into the **url** box, e.g.
   `https://www.youtube.com/live/NSjjFsReZaY`, leave it empty to just force a live-check.
3. Click **Run workflow** and watch the run; results appear under `data/<date>/<id>/` in ~1–5 min.

**B. Command line with GitHub CLI (`gh`)** — run in **PowerShell, Git Bash, CMD, or any terminal
on your PC** where `gh` is installed and logged in (`winget install GitHub.cli`, then `gh auth login`):

```
gh workflow run capture.yml -R usm4nhafeez/ytchat -f url=https://www.youtube.com/live/NSjjFsReZaY
gh run watch                                   # follow the latest run in this repo
```

Tip: for a live stream that runs longer than ~5 hours, dispatch again with the same link after the
stream ends — the full replay pull overwrites the partial one.

## Run it locally (same scripts the workflow uses)

Requires Node.js 18+. From this folder:

```
node ytchat.js pull <video-url-or-id> -o chat.jsonl
node ytchat.js scan chat.jsonl --owner --codes codes.json --claims-out claims.jsonl
node admin_comments.js chat.jsonl
```

## codes.json

The giftcode → multiplier table (same data as the panel/API `codes.json`). Formula behind
everything: `token = first5( UID[:5] * multiplier + 4921 )`. When `scan` prints `REVERSED m=XXXX`
for a new code, add `"CODE": XXXX` here and to the panel + API tables.

## Notes / limits

- GitHub cron is best-effort and can lag a few minutes at busy times.
- A live capture starts from the moment of detection; the first minutes are only fully recoverable
  via a replay re-run. Replay chats usually become available 1–4 h after a stream ends.
- Streams outside 5:00–10:45 PM PKT need the cron window widened (edit `capture.yml`,
  `on.schedule`, UTC times: PKT − 5).
