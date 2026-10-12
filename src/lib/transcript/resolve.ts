import { parseSourceUrl } from "./parse-url";
import { resolvePodcast } from "./podcast";
import type { CollectionResult, FetchErr, FetchInput, FetchResponse, TranscriptResult } from "./types";
import { fetchYoutubePlaylist, fetchYoutubeTranscript } from "./youtube";

function isTranscript(value: TranscriptResult | CollectionResult): value is TranscriptResult {
  return "cues" in value;
}

function errorResponse(err: unknown): FetchErr {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
  const message = err instanceof Error ? err.message : "Something went wrong while fetching the transcript";
  if (code === "no_transcript") {
    return {
      ok: false,
      code: "no_transcript",
      error: message,
      hint: "Verbatim reads published captions, podcast transcript files, and episode audio. Some exclusive feeds still hide a usable source.",
    };
  }
  if (code === "blocked") {
    return {
      ok: false,
      code: "blocked",
      error: "YouTube is currently blocking caption requests from this server.",
      hint: "Wait a moment and try again. Apple Podcasts, Spotify, and RSS episode links still work.",
    };
  }
  if (code === "not_found") {
    return { ok: false, code: "not_found", error: message || "Nothing was found at that URL." };
  }
  if (code === "unsupported") {
    return {
      ok: false,
      code: "unsupported",
      error: message,
      hint: "Supported links: YouTube videos and playlists, Apple Podcasts episodes, Spotify episodes, and RSS feeds.",
    };
  }
  if (code === "invalid_url") {
    return { ok: false, code: "invalid_url", error: message };
  }
  return {
    ok: false,
    code: "network",
    error: message,
    hint: "Check the URL and try again. Some hosts rate-limit repeated requests.",
  };
}

export async function resolveTranscript(input: FetchInput): Promise<FetchResponse> {
  const raw = input.url?.trim();
  if (!raw) {
    return { ok: false, code: "invalid_url", error: "Paste a YouTube or podcast URL first." };
  }
  if (raw.length > 2000) {
    return { ok: false, code: "too_large", error: "That URL is too long." };
  }

  const parsed = parseSourceUrl(raw);

  try {
    if (parsed.kind === "youtube-video") {
      const transcript = await fetchYoutubeTranscript(parsed.videoId, parsed.url);
      return { ok: true, kind: "transcript", transcript };
    }

    if (parsed.kind === "youtube-playlist") {
      if (parsed.videoId && !input.guid) {
        try {
          const transcript = await fetchYoutubeTranscript(parsed.videoId, parsed.url);
          return { ok: true, kind: "transcript", transcript };
        } catch {
          /* expand playlist if the attached video fails */
        }
      }
      const collection = await fetchYoutubePlaylist(parsed.playlistId, parsed.url);
      return { ok: true, kind: "collection", collection };
    }

    const resolved = await resolvePodcast({
      url: parsed.url || raw,
      parsed,
      feedUrl: input.feedUrl,
      guid: input.guid,
    });
    if (isTranscript(resolved)) {
      return { ok: true, kind: "transcript", transcript: resolved };
    }
    return { ok: true, kind: "collection", collection: resolved };
  } catch (err) {
    return errorResponse(err);
  }
}
