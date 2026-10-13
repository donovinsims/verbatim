# Verbatim — known-good snapshot

This file is the restore contract for the version of Verbatim that **captures transcripts**.

If capture breaks again after an edit, do not try to rebuild the fetchers from memory. Reset the repo to the git tag **`known-good`**. That tag is this tree: the app that was running and extracting YouTube, Apple Podcasts, Spotify, and RSS transcripts before later GitHub edits stopped capture on every platform.

```bash
git fetch origin tag known-good
git checkout known-good
# to make GitHub match this snapshot again:
git checkout main
git reset --hard known-good
git push --force origin main
```

The tag and the commit that introduced this README are the same snapshot.

## What it does

Paste a link. Verbatim returns the words.

- **YouTube** video or playlist (also a bare 11-character video id, `youtu.be`, Shorts, embed, live).
- **Apple Podcasts** episode or show.
- **Spotify** episode or show (resolved through public metadata into an RSS feed; Spotify does not publish transcripts).
- **RSS** feeds, including common hosts (Megaphone, Simplecast, Transistor, Buzzsprout, Libsyn, Anchor, Podbean, Art19, Omny, NPR podcast paths).

A single URL opens a sheet. A show or playlist opens a list; tapping an episode fetches only that episode. Bulk mode accepts up to 20 URLs. Finished transcripts export as TXT, SRT, VTT, Markdown, or JSON. Several finished jobs export as a zip.

Nothing is stored on a server. The queue and recents live in `localStorage` on the phone.

## Stack

| Piece | What it is |
|---|---|
| App | TanStack Start (`@tanstack/react-start` **~1.168.60**, do not downgrade — CVE-2026-102989) + React 19 + Vite 8 |
| Routing | File routes: `src/routes/__root.tsx`, `src/routes/index.tsx` renders `VerbatimApp` |
| Capture | One server function: `fetchTranscriptFn` in `src/lib/transcript.functions.ts` |
| UI | Fiducial (hue-less, print-registration). Tokens in `src/styles.css`. Spec in `DESIGN.md` |
| Type | Cal Sans UI + Cal Sans Text, files in `public/fonts/` |
| Sheets | `src/components/app-sheet.tsx` (page sheet, not a route change) |
| PWA | Viewport-fit, safe area, theme color, install meta in `__root.tsx` |

Dev server: `npm run dev` → `http://127.0.0.1:8080`.

## Directory map

```
src/components/verbatim-app.tsx   UI: composer, queue, sheets, export
src/components/app-sheet.tsx      bottom sheet physics
src/components/theme-toggle.tsx   light / dark
src/lib/theme.ts                  verbatim.theme in localStorage
src/lib/transcript.functions.ts   the only client→server fetch entry
src/lib/transcript/resolve.ts     routes a URL to YouTube or podcast
src/lib/transcript/parse-url.ts   URL kinds
src/lib/transcript/youtube.ts     Innertube → Invidious → youtube2text
src/lib/transcript/podcast.ts     Apple / Spotify / RSS
src/lib/transcript/parse-caption.ts  VTT, SRT, timedtext, json3, podcast JSON
src/lib/transcript/stt.ts         last-resort audio transcription
src/lib/transcript/formats.ts     TXT / MD / SRT / VTT / JSON
src/lib/transcript/queue.ts       persistence keys and limits
src/lib/transcript/http.ts        timeouts, retries, redirect follow
src/styles.css                    Fiducial tokens, rails, sheets, dark
DESIGN.md                         design system
```

The client never fetches YouTube or RSS itself. `verbatim-app.tsx` calls `fetchTranscriptFn` (a TanStack `createServerFn`). If that call is moved into the browser, every platform will fail: those hosts block CORS, and the Innertube session cookies never exist on the phone.

## Capture pipeline

```
paste
  → parseSourceUrl
  → resolveTranscript
       youtube-video     → fetchYoutubeTranscript
       youtube-playlist  → try the video, else fetchYoutubePlaylist
       apple / spotify / rss / unknown → resolvePodcast
  → { ok, kind: "transcript" | "collection" } or { ok: false, code, error, hint }
```

### YouTube (`youtube.ts`)

`fetchYoutubeTranscript` tries three sources, in this order. Do not collapse them into one.

1. **Innertube** (`fromInnertube`). Load a YouTube HTML page, scrape `VISITOR_DATA`, `INNERTUBE_API_KEY`, and client version. Session is cached 40 minutes. Then `player` is called as three clients, in order: `ANDROID` 21.26.364, `ANDROID_VR` 1.65.10 (Quest 3), `IOS` 20.10.4. English manual captions beat auto-captions (`pickTrack`). Caption body is parsed by `parseCaptionPayload`. Note: YouTube increasingly answers server IPs with `LOGIN_REQUIRED` ("Sign in to confirm you're not a bot"); the chain below exists for exactly that case.
2. **Invidious** (`fromInvidious`) if Innertube is blocked (not if the video truly has no captions). Public instances rot: as of 2026-10-12 only `invidious.f5.si` is still listed at https://api.invidious.io with the API enabled. Refresh `INVIDIOUS_HOSTS` in `youtube.ts` from that registry before trusting it.
3. **transcriptapi.com** (`fetchTranscriptApi`) when `TRANSCRIPTAPI_API_KEY` is set in the server environment. Keyed, returns timed cues. Skipped silently without the key.
4. **youtube2text.org** demo key (`/api/demo-key`, then `/api/transcribe`). This fallback returns one cue of plain text, not timed captions. It exists so a block does not become a total failure.

`no_transcript` and `not_found` are returned immediately. They are not retried through the fallbacks. `blocked` means every client failed.

Thumbnail: last Innertube thumbnail, else `https://i.ytimg.com/vi/{id}/hqdefault.jpg`.

### Podcasts (`podcast.ts`)

Apple and Spotify are not scraped as websites.

- **Apple show:** `https://itunes.apple.com/lookup?id={showId}&entity=podcast` → `feedUrl` → RSS.
- **Apple episode:** same show lookup, plus episode lookup for title, then match the item in the feed (`guid`, title score, episode id, URL).
- **Spotify:** `https://open.spotify.com/oembed?url=…` for title and author, then iTunes search to find the show’s RSS. `spotify.link` is followed with `resolveRedirect` before parsing. If iTunes cannot find the show, the error tells the user to paste Apple or RSS. That is correct. Do not add a Spotify Web API client to “fix” it.
- **RSS:** `fetchRssFeed` (fast-xml-parser). Artwork from `itunes:image` / `media:thumbnail` (`rssArtwork`).

Episode text, in order (`transcriptFromEpisode`):

1. `podcast:transcript` URLs, JSON before VTT before SRT, plus any transcript link found on the episode page.
2. Drop the file if `captionLooksThin` (a one-cue blurb, or too few words for the duration). A thin file is not a transcript.
3. YouTube search fallback (`youtubeFallback` / `searchYoutubeVideos`) using show + episode title, scored by `titleScore` in `match.ts`.
4. Enclosure audio → `transcribeAudioUrl` only if `XAI_API_KEY` is set. POST `multipart` file to `https://api.x.ai/v1/stt`. Caps: 50 MB, 2 hours, 45s download, 90s STT. Without the key, published captions and YouTube still work; only raw-audio episodes fail.

### URL parsing (`parse-url.ts`)

Keep `normalizeUrl`. It accepts a bare YouTube id, `spotify:episode:`, `spotify:show:`, and links missing `https://`. Playlist URLs that also have `v=` are a playlist (unless `list` starts with `RD`, which is a radio mix and is treated as the video).

### Client behavior that must stay

- `FETCH_TIMEOUT_MS` is **90 seconds** (`queue.ts`). Shorter timeouts kill STT and long caption downloads and look like “nothing captures.”
- Queue key `verbatim.queue.v1`. History key `verbatim.history.v2` (max 12). Bulk max 20.
- Restored jobs must tolerate a missing `wordCount` (`wordCount ?? 0`). An old crash on open was `wordCount.toLocaleString` when the field was absent.
- One in-flight fetch per job. Cancel uses a generation token so a dismissed job cannot write back.
- Podcast art in the sheet is `.cover-sq` (96×96) with `pt-6` above it. YouTube stills use `.hero-cover` capped at 160px. Do not set `width: 100%` on podcast covers.

## UI

Fiducial: paper `#FAFAFA`, ink `#262626`, cards `#FFFFFF`, radius knob **10px**, 1px rails, 8×8 registration marks. No brand hue. Status colors only: danger `#FB2C36`, ok `#00BC7D`.

Dark mode is the inverse (`html.dark`): canvas `#111111`, cards `#141414`, ink `#F5F5F5`, borders white/6%, inner highlight flipped to `inset 0 -1px white/6%`. Boot script in `__root.tsx` reads `localStorage["verbatim.theme"]` before paint so the phone does not flash the wrong scheme. Moon/sun in the header forces light or dark and stores the choice. Semantic red/green/blue/amber do not invert.

Sheets: transcript at ~96dvh, export as an action sheet, recents as a grouped list. Body scroll locks while a sheet is open.

## Export

`src/lib/transcript/formats.ts` + `client-export.ts`.

| Format | Shape |
|---|---|
| TXT | cue text, optional timestamps |
| Markdown | title, author, cues |
| SRT / VTT | timed cues |
| JSON | the `TranscriptResult` object |
| Zip | one file per finished job (`jszip`) |

## Environment

| Variable | Required? | Used for |
|---|---|---|
| `XAI_API_KEY` | No | Last-resort speech-to-text when a podcast has audio but no published transcript |
| `TRANSCRIPTAPI_API_KEY` | No | Keyed YouTube transcript fallback (transcriptapi.com) with timed cues, used when Innertube is bot-walled and Invidious is down |
| `VITE_AUTH_ENABLED` | No | Scaffold auth. This app does not gate transcripts behind login |

YouTube captions, Apple lookup, Spotify oEmbed, and RSS do not use an API key.

## Run and check

```bash
npm install
npm run dev          # http://127.0.0.1:8080
npm run typecheck
npm test
```

Smoke, in a browser:

1. YouTube `https://www.youtube.com/watch?v=jNQXAC9IVRw` (Me at the Zoo) returns cues.
2. An Apple Podcasts **episode** URL returns a transcript or a clear `no_transcript`, not a blank sheet.
3. An Apple **show** URL returns a collection, not a fake transcript.
4. A bad URL shows the error pane with Try Again, and the page does not crash.
5. Reload with a finished job: the queue comes back and `wordCount` does not throw.

## What broke last time

Capture died on **every** platform after the repo was edited on GitHub. That pattern means the shared path was changed, not one host:

- `fetchTranscriptFn` / `resolveTranscript` / `parseSourceUrl` stopped being the only entry, or the server function started throwing before the host-specific code.
- The client started calling YouTube, iTunes, or RSS directly.
- Innertube was reduced to a single web `player` request (YouTube answers those with a bot wall; the Android / VR / iOS client list is the working path).
- Timeouts were shortened below 90s.
- A restored queue job without `wordCount` crashed the shell, so it looked like fetch was dead.

If it happens again: `git reset --hard known-good`, then change UI only. Leave `src/lib/transcript/` alone unless a test in `parse-url.test.ts`, `match.test.ts`, or `reliability.test.ts` is updated in the same commit.
