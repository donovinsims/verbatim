import { fetchJson, fetchText, HttpError } from "./http";
import { parseDurationSeconds } from "./match";
import { cuesToText, parseCaptionPayload, wordCount } from "./parse-caption";
import { youtubeWatchUrl } from "./parse-url";
import type { CollectionResult, Cue, TranscriptResult } from "./types";

const ANDROID_VERSION = "21.26.364";
const WEB_VERSION = "2.20260910.01.00";

type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string };
};

type InnertubeClient = {
  clientName: string;
  clientVersion: string;
  extraClient?: Record<string, unknown>;
  headers: Record<string, string>;
};

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: {
    videoId?: string;
    title?: string;
    author?: string;
    lengthSeconds?: string;
    thumbnail?: { thumbnails?: { url: string }[] };
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
};

type YoutubeSession = {
  visitorData: string;
  apiKey: string | null;
  webVersion: string;
  at: number;
};

let cachedSession: YoutubeSession | null = null;

function thumbFrom(player: PlayerResponse): string | null {
  return player.videoDetails?.thumbnail?.thumbnails?.at(-1)?.url ?? null;
}

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const score = (t: CaptionTrack) => {
    const lang = (t.languageCode || "").toLowerCase();
    const asr = t.kind === "asr";
    let n = 0;
    if (lang === "en" || lang.startsWith("en-")) n += 50;
    if (!asr) n += 20;
    if (lang === "en") n += 10;
    return n;
  };
  return [...tracks].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function buildTranscript(
  url: string,
  meta: {
    title: string;
    author: string;
    durationSeconds: number | null;
    language: string | null;
    isGenerated: boolean;
    thumbnail: string | null;
    trackLabel: string | null;
    videoId: string;
  },
  cues: Cue[],
): TranscriptResult {
  const text = cuesToText(cues);
  return {
    url,
    canonicalUrl: youtubeWatchUrl(meta.videoId),
    source: "youtube",
    title: meta.title,
    author: meta.author,
    durationSeconds: meta.durationSeconds,
    language: meta.language,
    isGenerated: meta.isGenerated,
    thumbnail: meta.thumbnail,
    fetchedAt: new Date().toISOString(),
    cues,
    text,
    wordCount: wordCount(text),
    trackLabel: meta.trackLabel,
  };
}

function extractSession(html: string): { visitorData: string | null; apiKey: string | null; webVersion: string } {
  const visitorData =
    html.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/"visitorData"\s*:\s*"([^"]+)"/)?.[1] ||
    null;
  const apiKey = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/)?.[1] || null;
  const webVersion = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/)?.[1] || WEB_VERSION;
  return { visitorData, apiKey, webVersion };
}

async function youtubeSession(): Promise<YoutubeSession> {
  if (cachedSession && Date.now() - cachedSession.at < 40 * 60_000 && cachedSession.visitorData) {
    return cachedSession;
  }
  const pages = ["https://www.youtube.com/", "https://www.youtube.com/watch?v=jNQXAC9IVRw"];
  let lastErr: Error | null = null;
  for (const page of pages) {
    try {
      const res = await fetchText(page, {
        timeoutMs: 14_000,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const extracted = extractSession(res.text);
      if (extracted.visitorData) {
        cachedSession = {
          visitorData: extracted.visitorData,
          apiKey: extracted.apiKey,
          webVersion: extracted.webVersion,
          at: Date.now(),
        };
        return cachedSession;
      }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw Object.assign(lastErr ?? new Error("Could not start a YouTube session"), { code: "blocked" as const });
}

async function fetchTimedtext(baseUrl: string): Promise<Cue[]> {
  const attempts = [baseUrl];
  try {
    const url = new URL(baseUrl);
    if (!url.searchParams.get("fmt")) {
      url.searchParams.set("fmt", "json3");
      attempts.push(url.toString());
    }
  } catch {
    /* ignore */
  }

  let lastErr: Error | null = null;
  for (const url of attempts) {
    try {
      const res = await fetchText(url, {
        timeoutMs: 28_000,
        headers: { Accept: "application/json, text/xml, */*" },
      });
      if (res.status >= 400 || !res.text.trim()) continue;
      const cues = parseCaptionPayload(res.text, res.contentType);
      if (cues.length) return cues;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr ?? new Error("Caption track was empty");
}

function playerEndpoint(session: YoutubeSession): string {
  const key = session.apiKey ? `key=${encodeURIComponent(session.apiKey)}&` : "";
  return `https://www.youtube.com/youtubei/v1/player?${key}prettyPrint=false`;
}

async function innertubePlayer(
  videoId: string,
  client: InnertubeClient,
  session: YoutubeSession,
): Promise<PlayerResponse> {
  const body = JSON.stringify({
    context: {
      client: {
        clientName: client.clientName,
        clientVersion: client.clientVersion,
        hl: "en",
        gl: "US",
        visitorData: session.visitorData,
        ...client.extraClient,
      },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  });
  const res = await fetchText(playerEndpoint(session), {
    method: "POST",
    body,
    timeoutMs: 14_000,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Visitor-Id": session.visitorData,
      Origin: "https://www.youtube.com",
      Referer: "https://www.youtube.com/",
      ...client.headers,
    },
  });
  if (res.status >= 400) {
    throw new HttpError(res.status, res.text, `InnerTube ${client.clientName} failed`);
  }
  return JSON.parse(res.text) as PlayerResponse;
}

function playabilityCode(status?: string, reason?: string): "ok" | "blocked" | "not_found" {
  if (!status || status === "OK") return "ok";
  const text = `${status} ${reason ?? ""}`;
  if (/private|has been removed|doesn't exist|does not exist|deleted|terminated|copyright/i.test(text)) {
    return "not_found";
  }
  return "blocked";
}

async function fromPlayer(videoId: string, player: PlayerResponse, sourceUrl: string): Promise<TranscriptResult> {
  const status = player.playabilityStatus?.status;
  const reason = player.playabilityStatus?.reason ?? status;
  const code = playabilityCode(status, reason);
  if (code === "not_found") {
    throw Object.assign(new Error(reason || "Video is unplayable"), { code: "not_found" as const });
  }
  if (code === "blocked") {
    throw Object.assign(new Error(reason || "YouTube blocked the request"), { code: "blocked" as const });
  }
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track = pickTrack(tracks);
  if (!track) {
    throw Object.assign(new Error("This video has no captions"), { code: "no_transcript" as const });
  }
  const cues = await fetchTimedtext(track.baseUrl);
  return buildTranscript(
    sourceUrl,
    {
      title: player.videoDetails?.title || "YouTube video",
      author: player.videoDetails?.author || "YouTube",
      durationSeconds: player.videoDetails?.lengthSeconds
        ? Number(player.videoDetails.lengthSeconds)
        : null,
      language: track.languageCode || null,
      isGenerated: track.kind === "asr",
      thumbnail: thumbFrom(player),
      trackLabel: track.name?.simpleText ?? (track.kind === "asr" ? "Auto-generated" : track.languageCode),
      videoId: player.videoDetails?.videoId || videoId,
    },
    cues,
  );
}

function androidClients(): InnertubeClient[] {
  return [
    {
      clientName: "ANDROID",
      clientVersion: ANDROID_VERSION,
      extraClient: {
        androidSdkVersion: 30,
        osName: "Android",
        osVersion: "11",
      },
      headers: {},
    },
    {
      clientName: "ANDROID_VR",
      clientVersion: "1.65.10",
      extraClient: {
        deviceMake: "Oculus",
        deviceModel: "Quest 3",
        androidSdkVersion: 32,
        osName: "Android",
        osVersion: "12L",
      },
      headers: {},
    },
    {
      clientName: "IOS",
      clientVersion: "20.10.4",
      extraClient: {
        deviceMake: "Apple",
        deviceModel: "iPhone16,2",
      },
      headers: {},
    },
  ];
}

async function fromInnertube(videoId: string, sourceUrl: string): Promise<TranscriptResult> {
  const session = await youtubeSession();
  let blocked: Error | null = null;
  let sawNoTranscript = false;
  for (const client of androidClients()) {
    try {
      const player = await innertubePlayer(videoId, client, session);
      return await fromPlayer(videoId, player, sourceUrl);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "no_transcript") {
        sawNoTranscript = true;
        blocked = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      if (code === "not_found") throw err;
      blocked = err instanceof Error ? err : new Error(String(err));
    }
  }
  if (sawNoTranscript) {
    throw Object.assign(new Error("This video has no captions"), { code: "no_transcript" as const });
  }
  throw Object.assign(blocked ?? new Error("YouTube blocked the request"), { code: "blocked" as const });
}

const INVIDIOUS_HOSTS = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.f5.si",
  "https://invidious.tiekoetter.com",
  "https://yewtu.be",
];

type InvidiousVideo = {
  title?: string;
  author?: string;
  lengthSeconds?: number;
  videoThumbnails?: { url: string }[];
  captions?: { label: string; languageCode: string; url: string }[];
  error?: string;
};

async function fromInvidious(videoId: string, sourceUrl: string): Promise<TranscriptResult> {
  let last = "No Invidious instance returned captions";
  for (const host of INVIDIOUS_HOSTS) {
    try {
      const listRes = await fetchText(`${host}/api/v1/captions/${videoId}`, {
        timeoutMs: 8_000,
        headers: { Accept: "application/json" },
        ua: "app",
      });
      if (listRes.status !== 200) {
        last = `${host} captions list ${listRes.status}`;
        continue;
      }
      const parsed = JSON.parse(listRes.text) as {
        captions?: { label: string; languageCode: string; url: string }[];
      };
      const captions = parsed.captions ?? [];
      if (captions.length === 0) {
        last = `${host} listed no captions`;
        continue;
      }
      const preferred =
        captions.find((c) => c.languageCode?.startsWith("en")) ?? captions[0];
      const captionUrl = preferred.url.startsWith("http")
        ? preferred.url
        : `${host}${preferred.url}`;
      const captionRes = await fetchText(captionUrl, { timeoutMs: 10_000, ua: "app" });
      if (captionRes.status !== 200 || !captionRes.text.trim()) {
        last = `${host} caption body empty`;
        continue;
      }
      const cues = parseCaptionPayload(captionRes.text, captionRes.contentType);
      if (!cues.length) {
        last = `${host} caption parse empty`;
        continue;
      }

      let title = "YouTube video";
      let author = "YouTube";
      let durationSeconds: number | null = null;
      let thumbnail: string | null = null;
      try {
        const video = await fetchJson<InvidiousVideo>(`${host}/api/v1/videos/${videoId}`, {
          timeoutMs: 8_000,
          ua: "app",
        });
        title = video.title || title;
        author = video.author || author;
        durationSeconds = video.lengthSeconds ?? null;
        thumbnail = video.videoThumbnails?.at(-1)?.url ?? null;
      } catch {
        /* metadata is optional */
      }

      return buildTranscript(
        sourceUrl,
        {
          title,
          author,
          durationSeconds,
          language: preferred.languageCode || null,
          isGenerated: /auto/i.test(preferred.label),
          thumbnail,
          trackLabel: preferred.label,
          videoId,
        },
        cues,
      );
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw Object.assign(new Error(last), { code: "blocked" as const });
}

let cachedYt2TextKey: { key: string; at: number } | null = null;

async function youtube2textKey(): Promise<string | null> {
  if (cachedYt2TextKey && Date.now() - cachedYt2TextKey.at < 30 * 60_000) {
    return cachedYt2TextKey.key;
  }
  try {
    const data = await fetchJson<{ success?: boolean; apiKey?: string }>(
      "https://youtube2text.org/api/demo-key",
      { timeoutMs: 8_000, ua: "app" },
    );
    if (data.apiKey) {
      cachedYt2TextKey = { key: data.apiKey, at: Date.now() };
      return data.apiKey;
    }
  } catch {
    return cachedYt2TextKey?.key ?? null;
  }
  return null;
}

async function fromYoutube2Text(videoId: string, sourceUrl: string): Promise<TranscriptResult> {
  const key = await youtube2textKey();
  if (!key) throw new Error("Caption fallback is unavailable");
  const data = await fetchJson<{
    result?: { title?: string; content?: string; videoId?: string };
    error?: { code?: string; message?: string };
  }>(`https://youtube2text.org/api/transcribe?url=${encodeURIComponent(youtubeWatchUrl(videoId))}&maxChars=150000`, {
    timeoutMs: 25_000,
    ua: "app",
    headers: { "x-api-key": key },
  });
  if (data.error) {
    const code = data.error.code === "TRANSCRIPT_UNAVAILABLE" ? "no_transcript" : "blocked";
    throw Object.assign(new Error(data.error.message || "Fallback transcript failed"), { code });
  }
  const content = data.result?.content?.trim();
  if (!content) {
    throw Object.assign(new Error("Fallback returned an empty transcript"), { code: "no_transcript" as const });
  }
  const cues: Cue[] = [{ startMs: 0, endMs: 2000, text: content }];
  return buildTranscript(
    sourceUrl,
    {
      title: data.result?.title || "YouTube video",
      author: "YouTube",
      durationSeconds: null,
      language: null,
      isGenerated: false,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      trackLabel: "Transcript",
      videoId,
    },
    cues,
  );
}

export async function fetchYoutubeTranscript(videoId: string, sourceUrl: string): Promise<TranscriptResult> {
  const errors: string[] = [];

  try {
    return await fromInnertube(videoId, sourceUrl);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "no_transcript" || code === "not_found") throw err;
    errors.push(err instanceof Error ? err.message : String(err));
  }

  try {
    return await fromInvidious(videoId, sourceUrl);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  try {
    return await fromYoutube2Text(videoId, sourceUrl);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  throw Object.assign(
    new Error("Could not read captions for this video"),
    { code: "blocked" as const, details: errors },
  );
}

export type YoutubeSearchHit = {
  videoId: string;
  title: string;
  author: string;
  durationSeconds: number | null;
};

function durationFromSearchNode(rec: Record<string, unknown>): number | null {
  const direct =
    parseDurationSeconds(rec.lengthSeconds) ??
    parseDurationSeconds(rec.lengthText) ??
    parseDurationSeconds(rec.length);
  if (direct) return direct;
  const overlays = rec.thumbnailOverlays;
  if (Array.isArray(overlays)) {
    for (const overlay of overlays) {
      if (!overlay || typeof overlay !== "object") continue;
      const time = (overlay as { thumbnailOverlayTimeStatusRenderer?: { text?: unknown } })
        .thumbnailOverlayTimeStatusRenderer?.text;
      const parsed = parseDurationSeconds(time);
      if (parsed) return parsed;
    }
  }
  const a11y =
    (rec.accessibility as { accessibilityData?: { label?: string } } | undefined)?.accessibilityData?.label ??
    (rec.lengthText as { accessibility?: { accessibilityData?: { label?: string } } } | undefined)?.accessibility
      ?.accessibilityData?.label;
  return parseDurationSeconds(a11y);
}

function textOf(node?: { runs?: { text?: string }[]; simpleText?: string } | string | null): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.simpleText) return node.simpleText;
  return (node.runs ?? []).map((r) => r.text ?? "").join("");
}

function collectVideoHits(node: unknown, out: YoutubeSearchHit[] = [], seen = new Set<string>()): YoutubeSearchHit[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectVideoHits(item, out, seen);
    return out;
  }
  const rec = node as Record<string, unknown>;
  const videoId = typeof rec.videoId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(rec.videoId) ? rec.videoId : null;
  if (videoId && !seen.has(videoId)) {
    const title =
      textOf(rec.title as { runs?: { text?: string }[]; simpleText?: string }) ||
      (typeof rec.title === "string" ? rec.title : "");
    const author =
      textOf(rec.ownerText as { runs?: { text?: string }[]; simpleText?: string }) ||
      textOf(rec.shortBylineText as { runs?: { text?: string }[]; simpleText?: string }) ||
      (typeof rec.author === "string" ? rec.author : "") ||
      "YouTube";
    if (title) {
      seen.add(videoId);
      out.push({
        videoId,
        title,
        author,
        durationSeconds: durationFromSearchNode(rec),
      });
    }
  }
  for (const value of Object.values(rec)) collectVideoHits(value, out, seen);
  return out;
}

export async function searchYoutubeVideos(query: string): Promise<YoutubeSearchHit[]> {
  const q = query.replace(/\s+/g, " ").trim();
  if (!q) return [];
  const session = await youtubeSession();
  const body = JSON.stringify({
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: ANDROID_VERSION,
        hl: "en",
        gl: "US",
        androidSdkVersion: 30,
        visitorData: session.visitorData,
      },
    },
    query: q,
  });
  const res = await fetchText("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
    method: "POST",
    body,
    timeoutMs: 14_000,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Visitor-Id": session.visitorData,
      Origin: "https://www.youtube.com",
    },
  });
  if (res.status !== 200) return [];
  try {
    const data = JSON.parse(res.text) as unknown;
    return collectVideoHits(data).slice(0, 12);
  } catch {
    return [];
  }
}

type BrowseResponse = {
  contents?: {
    singleColumnBrowseResultsRenderer?: {
      tabs?: {
        tabRenderer?: {
          content?: {
            sectionListRenderer?: {
              contents?: {
                itemSectionRenderer?: {
                  contents?: {
                    playlistVideoListRenderer?: {
                      contents?: {
                        playlistVideoRenderer?: {
                          videoId?: string;
                          title?: { runs?: { text?: string }[]; simpleText?: string };
                          lengthSeconds?: string;
                          shortBylineText?: { runs?: { text?: string }[] };
                        };
                      }[];
                    };
                  }[];
                };
              }[];
            };
          };
        };
      }[];
    };
  };
  metadata?: {
    playlistMetadataRenderer?: { title?: string };
  };
  header?: {
    playlistHeaderRenderer?: {
      title?: { runs?: { text?: string }[]; simpleText?: string };
      ownerText?: { runs?: { text?: string }[] };
    };
  };
};

export async function fetchYoutubePlaylist(
  playlistId: string,
  sourceUrl: string,
): Promise<CollectionResult> {
  try {
    const session = await youtubeSession();
    const body = JSON.stringify({
      context: {
        client: {
          clientName: "WEB",
          clientVersion: session.webVersion || WEB_VERSION,
          hl: "en",
          gl: "US",
          visitorData: session.visitorData,
        },
      },
      browseId: `VL${playlistId}`,
    });
    const res = await fetchText("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Visitor-Id": session.visitorData,
        Origin: "https://www.youtube.com",
      },
      timeoutMs: 14_000,
    });
    if (res.status === 200) {
      const data = JSON.parse(res.text) as BrowseResponse;
      const items: CollectionResult["items"] = [];
      const tabs = data.contents?.singleColumnBrowseResultsRenderer?.tabs ?? [];
      for (const tab of tabs) {
        const sections = tab.tabRenderer?.content?.sectionListRenderer?.contents ?? [];
        for (const section of sections) {
          const contents = section.itemSectionRenderer?.contents ?? [];
          for (const c of contents) {
            for (const entry of c.playlistVideoListRenderer?.contents ?? []) {
              const v = entry.playlistVideoRenderer;
              if (!v?.videoId) continue;
              items.push({
                url: youtubeWatchUrl(v.videoId),
                title: textOf(v.title) || v.videoId,
                author: textOf(v.shortBylineText) || undefined,
                durationSeconds: v.lengthSeconds ? Number(v.lengthSeconds) : null,
                hasTranscript: true,
                thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
              });
            }
          }
        }
      }
      if (items.length === 0) {
        const hits = collectVideoHits(data);
        for (const hit of hits) {
          items.push({
            url: youtubeWatchUrl(hit.videoId),
            title: hit.title,
            author: hit.author,
            hasTranscript: true,
            thumbnail: `https://i.ytimg.com/vi/${hit.videoId}/mqdefault.jpg`,
          });
        }
      }
      if (items.length > 0) {
        return {
          title: textOf(data.header?.playlistHeaderRenderer?.title) || data.metadata?.playlistMetadataRenderer?.title || "YouTube playlist",
          author: textOf(data.header?.playlistHeaderRenderer?.ownerText) || "YouTube",
          source: "youtube",
          url: sourceUrl,
          artwork: items[0]?.thumbnail ?? null,
          items: items.slice(0, 40),
        };
      }
    }
  } catch {
    /* fall through */
  }

  for (const host of INVIDIOUS_HOSTS) {
    try {
      const data = await fetchJson<{
        title?: string;
        author?: string;
        videos?: { videoId: string; title: string; author?: string; lengthSeconds?: number }[];
      }>(`${host}/api/v1/playlists/${playlistId}`, { timeoutMs: 12_000, ua: "app" });
      const items = (data.videos ?? []).slice(0, 40).map((v) => ({
        url: youtubeWatchUrl(v.videoId),
        title: v.title,
        author: v.author,
        durationSeconds: v.lengthSeconds ?? null,
        hasTranscript: true,
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
      }));
      if (items.length) {
        return {
          title: data.title || "YouTube playlist",
          author: data.author || "YouTube",
          source: "youtube",
          url: sourceUrl,
          artwork: items[0]?.thumbnail ?? null,
          items,
        };
      }
    } catch {
      /* next host */
    }
  }

  throw Object.assign(new Error("Could not read this playlist"), { code: "blocked" as const });
}
