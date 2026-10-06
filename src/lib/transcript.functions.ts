import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "./transcript/input";
import type { FetchResponse } from "./transcript/types";

export const fetchTranscriptFn = createServerFn({ method: "POST" })
  .validator(parseInput)
  .handler(async ({ data }): Promise<FetchResponse> => {
    const { resolveTranscript } = await import("./transcript/resolve");
    return resolveTranscript(data);
  });
