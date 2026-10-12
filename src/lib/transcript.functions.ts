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

export const fetchTranscriptFn = createServerFn({ method: "POST" })
  .validator(parseInput)
  .handler(async ({ data }): Promise<FetchResponse> => {
    const { resolveTranscript } = await import("./transcript/resolve");
    return resolveTranscript(data);
  });
