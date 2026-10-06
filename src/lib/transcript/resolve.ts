import { errorResult, toErrorResult, TranscriptError } from "./errors";
import { parseSourceUrl } from "./parse-url";
import { resolvePodcast } from "./podcast";
import type { FetchResponse, TranscriptInput } from "./types";
import { resolveYoutube } from "./youtube";

const OVERALL_TIMEOUT_MS = 120_000;

export async function resolveTranscript(input: TranscriptInput): Promise<FetchResponse> {
  try {
    return await withTimeout(resolveTranscriptInner(input), OVERALL_TIMEOUT_MS);
  } catch (err) {
    return toErrorResult(err);
  }
}

async function resolveTranscriptInner(input: TranscriptInput): Promise<FetchResponse> {
  const url = input.url?.trim();
  if (!url) return errorResult("invalid_url", "A URL is required.");

  if (input.feedUrl && (input.guid || url)) {
    return resolvePodcast({ url, feedUrl: input.feedUrl, guid: input.guid });
  }

  const parsed = parseSourceUrl(url);
  switch (parsed.kind) {
    case "youtube-video":
    case "youtube-playlist":
      return resolveYoutube(parsed);
    case "apple-episode":
    case "apple-show":
    case "spotify-episode":
    case "spotify-show":
    case "rss":
      return resolvePodcast({ url, feedUrl: input.feedUrl, guid: input.guid }, parsed);
    case "unknown":
    default: {
      if (!/^https?:\/\//i.test(ensureScheme(url))) {
        return errorResult("invalid_url", "That does not look like a URL.");
      }
      try {
        return await resolvePodcast({ url }, parsed);
      } catch (err) {
        if (err instanceof TranscriptError && (err.code === "unsupported" || err.code === "invalid_url")) {
          return errorResult(
            "invalid_url",
            "Paste a YouTube, Apple Podcasts, Spotify, or RSS link.",
          );
        }
        throw err;
      }
    }
  }
}

function ensureScheme(raw: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TranscriptError("timeout", "The transcript request timed out."));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
