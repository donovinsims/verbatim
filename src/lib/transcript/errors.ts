import type { ErrorResult, FetchErrorCode } from "./types";

export class TranscriptError extends Error {
  readonly code: FetchErrorCode;
  readonly hint?: string;

  constructor(code: FetchErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "TranscriptError";
    this.code = code;
    this.hint = hint;
  }
}

const HINTS: Record<FetchErrorCode, string> = {
  invalid_url:
    "Paste a YouTube, Apple Podcasts, Spotify, or RSS link.",
  no_transcript:
    "No captions or published transcript turned up. A show page may need an episode pick first.",
  blocked:
    "The source refused the request. Try again later, or pick a different host for the same episode.",
  no_audio:
    "The episode has no downloadable audio enclosure to transcribe.",
  timeout:
    "The source took too long. Retry the same URL; bulk jobs will pick up the rest.",
  not_found: "Nothing lives at that URL anymore.",
  unsupported: "That host is not a YouTube, podcast, or RSS source.",
  rate_limited: "Slow down a bit and retry. The queue will keep your other jobs.",
  stt_unavailable:
    "Speech-to-text is the last resort and is not available in this environment.",
  too_large: "Audio is over the 2 hour / 50 MB cap used for speech-to-text.",
  network: "A network hop failed. Check the URL and try again.",
  unknown: "Something unexpected failed while fetching the transcript.",
};

export function errorResult(
  code: FetchErrorCode,
  message: string,
  hint?: string,
): ErrorResult {
  return {
    kind: "error",
    code,
    message,
    hint: hint ?? HINTS[code],
  };
}

export function toErrorResult(err: unknown): ErrorResult {
  if (err instanceof TranscriptError) {
    return errorResult(err.code, err.message, err.hint);
  }
  if (err instanceof Error) {
    const name = err.name.toLowerCase();
    const msg = err.message.toLowerCase();
    if (name === "aborterror" || msg.includes("timeout") || msg.includes("timed out")) {
      return errorResult("timeout", "The request timed out.");
    }
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("enotfound")) {
      return errorResult("network", err.message);
    }
    return errorResult("unknown", err.message);
  }
  return errorResult("unknown", "Transcript fetch failed.");
}
