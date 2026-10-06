import { TranscriptError } from "./errors";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const PODCAST_UA = "Verbatim/1.0 (transcript fetcher; +https://verbatim.app)";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export type HttpOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  accept?: string;
};

export async function fetchResponse(url: string, opts: HttpOptions = {}): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      "User-Agent": opts.userAgent ?? BROWSER_UA,
      Accept: opts.accept ?? "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      ...opts.headers,
    };
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body,
      redirect: "follow",
      signal: controller.signal,
    });
    return res;
  } catch (err) {
    throw mapFetchError(err);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url: string, opts: HttpOptions = {}): Promise<string> {
  const res = await fetchResponse(url, opts);
  await assertOk(res, url);
  const buf = await readLimited(res, opts.maxBytes ?? DEFAULT_MAX_BYTES);
  return new TextDecoder("utf-8").decode(buf);
}

export async function fetchBuffer(url: string, opts: HttpOptions = {}): Promise<Uint8Array> {
  const res = await fetchResponse(url, opts);
  await assertOk(res, url);
  return readLimited(res, opts.maxBytes ?? DEFAULT_MAX_BYTES);
}

export async function fetchJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const text = await fetchText(url, {
    ...opts,
    accept: opts.accept ?? "application/json, text/javascript, */*;q=0.8",
  });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new TranscriptError("unknown", "The source returned invalid JSON.");
  }
}

export async function fetchHead(url: string, opts: HttpOptions = {}): Promise<Response> {
  try {
    return await fetchResponse(url, { ...opts, method: "HEAD", timeoutMs: opts.timeoutMs ?? 10_000 });
  } catch {
    return fetchResponse(url, { ...opts, method: "GET", timeoutMs: opts.timeoutMs ?? 10_000 });
  }
}

export async function readLimited(res: Response, maxBytes: number): Promise<Uint8Array> {
  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > maxBytes) {
      throw new TranscriptError(
        "too_large",
        `Response is ${len} bytes; the cap is ${maxBytes} bytes.`,
      );
    }
  }
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new TranscriptError("too_large", `Response exceeded ${maxBytes} bytes.`);
    }
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw new TranscriptError("too_large", `Response exceeded ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function assertOk(res: Response, url: string): Promise<void> {
  if (res.ok) return;
  const status = res.status;
  if (status === 404 || status === 410) {
    throw new TranscriptError("not_found", `Nothing found at ${hostOf(url)} (${status}).`);
  }
  if (status === 401 || status === 403 || status === 451) {
    throw new TranscriptError("blocked", `${hostOf(url)} refused the request (${status}).`);
  }
  if (status === 429) {
    throw new TranscriptError("rate_limited", `${hostOf(url)} rate-limited the request.`);
  }
  if (status >= 500) {
    throw new TranscriptError("network", `${hostOf(url)} returned ${status}.`);
  }
  throw new TranscriptError("network", `${hostOf(url)} returned ${status}.`);
}

export function mapFetchError(err: unknown): TranscriptError {
  if (err instanceof TranscriptError) return err;
  if (err instanceof Error) {
    const name = err.name.toLowerCase();
    const msg = err.message.toLowerCase();
    if (name === "aborterror" || msg.includes("aborted") || msg.includes("timeout")) {
      return new TranscriptError("timeout", "The request timed out.");
    }
    return new TranscriptError("network", err.message);
  }
  return new TranscriptError("network", "Network request failed.");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "source";
  }
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&/gi, "&")
    .replace(/"/gi, '"')
    .replace(/&#39;|'/gi, "'")
    .replace(/</gi, "<")
    .replace(/>/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
}

export function stripHtml(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function extractJsonObject(source: string, marker: string): unknown | null {
  const idx = source.indexOf(marker);
  if (idx < 0) return null;
  const start = source.indexOf("{", idx);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = source.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
