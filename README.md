# Verbatim

Paste a YouTube, Apple Podcasts, Spotify, or RSS link. Get a full transcript you can search, copy, and export. One page, no accounts. History lives in this browser (`verbatim.history.v2`, last 12).

The left column is the queue. The right paper pane shows loading, an episode list, the transcript, or an error.

## What you can do

1. Paste a URL (or switch to Bulk and paste several, max 20).
2. Single mode runs one job at a time; Bulk runs two at once.
3. Show and playlist links open a pick list — each episode you choose is a new job.
4. Search lines, toggle timestamps, copy, or export TXT / Markdown / SRT / VTT / JSON. Two or more finished jobs zip as one download.

Sample chips: YouTube “Me at the Zoo”, Darknet Diaries *Carna Botnet* on Apple, the same episode on Spotify.

## How a request travels

```
UI → splitInputUrls / parseSourceUrl → job queue → fetchTranscriptFn
  → resolveTranscript
    → YouTube captions (InnerTube + timedtext, human English preferred)
    → or podcast RSS waterfall
         1. Apple / Spotify / RSS → real feed
         2. Match episode (guid, Apple id, link, title)
         3. Published transcript file (JSON / VTT / SRT)
         4. YouTube captions if title/duration match
         5. Audio enclosure → xAI speech-to-text (2h / 50MB cap)
```

Cues `{ startMs, endMs, text, speaker? }` are canonical. Exports are just serializations of that array.

## Agent API (Hermes / Telegram)

The web app and the agent share `resolveTranscript`. There is no second copy of the fetch logic.

**POST `/api/transcribe`** (also **POST `/transcribe`**)

Zero-auth. Rate-limited (~20 requests / minute / IP). CORS: localhost, Telegram, same-origin.

### Body

```json
{ "url": "https://www.youtube.com/watch?v=jNQXAC9IVRw" }
```

or

```json
{ "urls": ["https://youtu.be/jNQXAC9IVRw", "https://podcasts.apple.com/us/podcast/darknet-diaries/id1296350485"] }
```

Optional on a single URL: `feedUrl`, `guid` (so a picked episode does not collapse back into the show list). Optional `stream: true` (or `Accept: text/event-stream`) for SSE progress on long jobs.

### Response (discriminated union)

Same shape as the web app server function:

```ts
{ kind: "transcript", title, author?, cues, text, wordCount, ... }
{ kind: "collection", title, items: [{ title, url, feedUrl?, guid?, ... }] }
{ kind: "error", code, message, hint? }
{ kind: "batch", results: FetchResponse[] }  // when urls[] is sent
```

`code` is one of: `invalid_url`, `no_transcript`, `blocked`, `no_audio`, `timeout`, `not_found`, `unsupported`, `rate_limited`, `stt_unavailable`, `too_large`, `network`, `unknown`.

### curl

```bash
curl -sS -X POST "$ORIGIN/api/transcribe" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=jNQXAC9IVRw"}'
```

```bash
curl -sS -X POST "$ORIGIN/api/transcribe" \
  -H "Content-Type: application/json" \
  -d '{"urls":["https://www.youtube.com/watch?v=jNQXAC9IVRw","https://podcasts.apple.com/us/podcast/carna-botnet/id1296350485?i=1000402428920"]}'
```

```bash
# SSE
curl -sS -N -X POST "$ORIGIN/api/transcribe" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"url":"https://www.youtube.com/watch?v=jNQXAC9IVRw"}'
```

GET `/api/transcribe` returns a machine-readable description of the endpoint.

### Telegram / Hermes webhook

1. Point Hermes at `POST {origin}/api/transcribe`.
2. From a Telegram message, extract HTTP URLs (or take the whole text as `url`).
3. Call the endpoint. If `kind === "collection"`, reply with the episode titles and wait for a pick, then POST again with `{ url, feedUrl, guid }`.
4. If `kind === "transcript"`, send `title`, `wordCount`, and a truncated `text` (Telegram’s message cap is 4096 characters). Offer SRT/VTT as a file built from `cues`.
5. If `kind === "error"`, send `message` plus `hint`.

No Telegram bot token lives in this app. Hermes holds that.

Shared handler: `src/lib/transcript/agent-api.ts` → `resolveTranscript` in `src/lib/transcript/resolve.ts`.

## Tests

```
npm run test:unit
```

Coverage sits next to the modules: parse-url, parse-caption, match, queue, formats, http, reliability, resolve.

## Stress-test checklist (run before any visual redesign)

See the “STRESS-TEST INSTRUCTIONS” section at the bottom of this file.

## Stress-test instructions

1. **Me at the Zoo** — YouTube sample chip. Expect a finished transcript with cues, copy, and TXT/SRT export.
2. **Darknet Diaries Apple episode** — Carna Botnet sample. Prefer published transcript or YouTube captions; STT only if both miss.
3. **Same episode on Spotify** — must resolve via oEmbed + iTunes + RSS and match the episode, not the show list.
4. **Show-level Apple link** — `id1296350485` with no `i=`. Expect a collection (≤ 40). Tapping an episode enqueues a new job with `feedUrl` + `guid` and does not collapse back to the show.
5. **YouTube playlist** — playlist URL returns a pick list; `watch?v=&list=` transcribes the video first.
6. **Bulk 20** — paste 20 YouTube URLs. Cap at 20, two concurrent, pause/resume, remove a queued row, refuse to remove a running row.
7. **Network down** — mock or disconnect. Expect `network` / `timeout` with a hint, queue still intact.
8. **Blocked / no captions** — age-gated or captionless video → `blocked` or `no_transcript`.
9. **Long transcript** — thousands of cues start collapsed (~first 25%). Search and “See more” expand. Export JSON still has every cue.
10. **ZIP** — finish two jobs, Zip download contains both.
11. **localStorage** — finish 13 transcripts. Recents holds 12 compact rows (no cue arrays). Survive a reload.
12. **Agent API** — POST `/api/transcribe` with one URL and with `urls`[]; invalid body → `invalid_url`; flood until `rate_limited`.
13. **Telegram-shaped CORS** — OPTIONS from `https://web.telegram.org` allowed; random origin not.
14. **STT budget** — enclosure > 2h or > 50MB → `too_large` without calling speech-to-text.
15. **Dedup** — youtu.be and youtube.com/watch?v= of the same id share a queue slot.

Do not restyle the paper pane until these pass.
