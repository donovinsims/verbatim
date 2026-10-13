import { fetchJson, HttpError } from "./http.ts";
import { cuesToText, wordCount } from "./parse-caption.ts";
import { youtubeWatchUrl } from "./parse-url.ts";
import type { Cue, TranscriptResult } from "./types.ts";

// Keyed fallback for YouTube transcripts when Innertube is bot-walled and
// public Invidious instances are down. Set TRANSCRIPTAPI_API_KEY (and
// optionally TRANSCRIPTAPI_API_KEY_2) in the server environment to enable it.
const API_URL = "https://transcriptapi.com/api/v2/youtube/transcript";

type TranscriptSegment = {
  text?: unknown;
  start?: unknown;
  duration?: unknown;
};

type TranscriptApiResponse = {
  transcript?: TranscriptSegment[] | string;
  language?: unknown;
  title?: unknown;
  author_name?: unknown;
  duration?: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function toCues(input: TranscriptApiResponse["transcript"]): Cue[] {
  if (typeof input === "string") {
    const text = input.trim();
    return text ? [{ startMs: 0, endMs: 1000, text }] : [];
  }
  if (!Array.isArray(input)) return [];
  return input.flatMap((segment, index) => {
    const text = asString(segment.text)?.trim();
    if (!text) return [];
    const startMs = Math.max(0, Math.round((asFiniteNumber(segment.start) ?? 0) * 1000));
    const durationSeconds = asFiniteNumber(segment.duration);
    const nextStartSeconds = asFiniteNumber(input[index + 1]?.start);
    const endMs =
      durationSeconds !== undefined && durationSeconds > 0
        ? startMs + Math.round(durationSeconds * 1000)
        : nextStartSeconds !== undefined && nextStartSeconds * 1000 > startMs
          ? Math.round(nextStartSeconds * 1000)
          : startMs + 1000;
    return [{ startMs, endMs: Math.max(startMs + 1, endMs), text }];
  });
}

export async function fetchTranscriptApi(videoId: string, sourceUrl: string): Promise<TranscriptResult> {
  const apiKeys = [process.env.TRANSCRIPTAPI_API_KEY, process.env.TRANSCRIPTAPI_API_KEY_2]
    .map((key) => key?.trim())
    .filter((key): key is string => Boolean(key));
  if (!apiKeys.length) {
    throw Object.assign(new Error("TranscriptAPI fallback is not configured"), { code: "blocked" as const });
  }

  const url = new URL(API_URL);
  url.searchParams.set("video_url", videoId);
  url.searchParams.set("format", "json");
  url.searchParams.set("include_timestamp", "true");
  url.searchParams.set("send_metadata", "true");

  let payload: TranscriptApiResponse | undefined;
  let lastError: unknown;
  for (const apiKey of apiKeys) {
    try {
      payload = await fetchJson<TranscriptApiResponse>(url.toString(), {
        timeoutMs: 25_000,
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      break;
    } catch (err) {
      lastError = err;
      if (err instanceof HttpError && err.status === 404) break;
    }
  }
  if (!payload) {
    const err = lastError;
    if (err instanceof HttpError) {
      if (err.status === 404) {
        throw Object.assign(new Error("The hosted transcript service found no captions for this video."), {
          code: "no_transcript" as const,
        });
      }
      if (err.status === 401 || err.status === 403) {
        throw Object.assign(new Error("The hosted transcript service rejected its API keys. Check the TranscriptAPI credentials."), {
          code: "blocked" as const,
        });
      }
      if (err.status === 402) {
        throw Object.assign(new Error("The hosted transcript service is out of credits."), { code: "blocked" as const });
      }
      throw Object.assign(new Error(`The hosted transcript service returned HTTP ${err.status}.`), {
        code: "blocked" as const,
      });
    }
    throw err;
  }

  const cues = toCues(payload.transcript);
  if (!cues.length) {
    throw Object.assign(new Error("The hosted transcript service returned no caption segments."), {
      code: "no_transcript" as const,
    });
  }
  const text = cuesToText(cues);
  return {
    url: sourceUrl,
    canonicalUrl: youtubeWatchUrl(videoId),
    source: "youtube",
    title: asString(payload.title) || `YouTube ${videoId}`,
    author: asString(payload.author_name) || "YouTube",
    durationSeconds: asFiniteNumber(payload.duration) ?? null,
    language: asString(payload.language) ?? null,
    isGenerated: false,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    fetchedAt: new Date().toISOString(),
    cues,
    text,
    wordCount: wordCount(text),
    trackLabel: "Transcript",
  };
}
