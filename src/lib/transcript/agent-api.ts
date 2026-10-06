import { errorResult } from "./errors";
import { parseAgentBody } from "./input";
import { MAX_BULK } from "./queue";
import { checkRateLimit, clientKeyFromRequest } from "./rate-limit";
import { resolveTranscript } from "./resolve";
import type { AgentResponse, FetchResponse, TranscriptInput } from "./types";

const ALLOWED_TELEGRAM = /(^|\.)telegram\.org$/i;

export async function handleTranscribeRequest(request: Request): Promise<Response> {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method === "GET") {
    return json(
      {
        name: "verbatim.transcribe",
        method: "POST",
        body: { url: "string", urls: "string[] (max 20)", feedUrl: "string?", guid: "string?", stream: "boolean?" },
        result: "transcript | collection | error | { kind: 'batch', results }",
      },
      200,
      cors,
    );
  }
  if (request.method !== "POST") {
    return json(errorResult("unsupported", "Use POST."), 405, cors);
  }

  const limited = checkRateLimit(clientKeyFromRequest(request));
  if (!limited.ok) {
    return json(errorResult("rate_limited", `Try again in ${limited.retryAfterSec}s.`), 429, {
      ...cors,
      "Retry-After": String(limited.retryAfterSec),
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(errorResult("invalid_url", "Body must be JSON with url or urls."), 400, cors);
  }

  let parsed: ReturnType<typeof parseAgentBody>;
  try {
    parsed = parseAgentBody(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request body.";
    return json(errorResult("invalid_url", message), 400, cors);
  }

  const jobs = inputsFromBody(parsed);
  if (!jobs.length) {
    return json(errorResult("invalid_url", "Provide url or urls."), 400, cors);
  }

  const stream = parsed.stream || request.headers.get("accept")?.includes("text/event-stream");
  if (stream) {
    return sseResponse(jobs, cors);
  }

  if (jobs.length === 1) {
    const result = await resolveTranscript(jobs[0]!);
    return json(result, statusFor(result), cors);
  }

  const results = await mapPool(jobs, 2, (job) => resolveTranscript(job));
  const batch: AgentResponse = { kind: "batch", results };
  return json(batch, 200, cors);
}

function inputsFromBody(body: { url?: string; urls?: string[]; feedUrl?: string; guid?: string }): TranscriptInput[] {
  if (body.urls?.length) {
    return body.urls.slice(0, MAX_BULK).map((url) => ({ url }));
  }
  if (body.url) {
    return [{ url: body.url, feedUrl: body.feedUrl, guid: body.guid }];
  }
  return [];
}

function sseResponse(jobs: TranscriptInput[], cors: Record<string, string>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        for (let i = 0; i < jobs.length; i++) {
          send("progress", { index: i, total: jobs.length, url: jobs[i]?.url });
          const result = await resolveTranscript(jobs[i]!);
          send("result", { index: i, result });
        }
        send("done", { total: jobs.length });
      } catch (err) {
        send("error", toErrorResultSafe(err));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

function toErrorResultSafe(err: unknown): FetchResponse {
  const message = err instanceof Error ? err.message : "Stream failed.";
  return errorResult("unknown", message);
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allow = isAllowedOrigin(origin, request);
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Max-Age": "600",
  };
  if (allow && origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function isAllowedOrigin(origin: string | null, request: Request): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (ALLOWED_TELEGRAM.test(host)) return true;
    const reqHost = new URL(request.url).hostname;
    if (host === reqHost) return true;
    return false;
  } catch {
    return false;
  }
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

function statusFor(result: FetchResponse): number {
  if (result.kind !== "error") return 200;
  switch (result.code) {
    case "invalid_url":
      return 400;
    case "not_found":
      return 404;
    case "blocked":
      return 403;
    case "rate_limited":
      return 429;
    case "timeout":
      return 504;
    case "too_large":
      return 413;
    default:
      return 422;
  }
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return results;
}
