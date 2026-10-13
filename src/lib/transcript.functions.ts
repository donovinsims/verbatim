import { createServerFn } from "@tanstack/react-start";
import type { FetchInput, FetchResponse } from "./transcript/types";

function parseInput(input: unknown): FetchInput {
  if (!input || typeof input !== "object") {
    throw new Error("URL required");
  }
  const rec = input as Record<string, unknown>;
  const url = typeof rec.url === "string" ? rec.url.trim() : "";
  if (!url) throw new Error("URL required");
  return {
    url,
    feedUrl: typeof rec.feedUrl === "string" ? rec.feedUrl : undefined,
    guid: typeof rec.guid === "string" ? rec.guid : undefined,
  };
}

// Overall server-side deadline. The client races at 90s (FETCH_TIMEOUT_MS in
// queue.ts), but without this the server function could hang on a stalled
// upstream long after the client gave up. Keep comfortably above the client
// timeout so slow-but-working fallbacks (youtube2text) can still finish.
const OVERALL_TIMEOUT_MS = 240_000;

export const fetchTranscriptFn = createServerFn({ method: "POST" })
  .validator(parseInput)
  .handler(async ({ data }): Promise<FetchResponse> => {
    const { resolveTranscript } = await import("./transcript/resolve");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<FetchResponse>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            Object.assign(new Error("The transcript fetch took too long."), {
              code: "network" as const,
            }),
          ),
        OVERALL_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([resolveTranscript(data), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
