import { AsyncLocalStorage } from "node:async_hooks";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const APP_UA = "VerbatimTranscript/1.0 (https://grok.com)";
const transcriptRequestSignal = new AsyncLocalStorage<AbortSignal>();

export function runWithTranscriptSignal<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  return transcriptRequestSignal.run(signal, work);
}

export function getTranscriptSignal(): AbortSignal | undefined {
  return transcriptRequestSignal.getStore();
}

export class HttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function fetchBuffer(
  url: string,
  opts: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string | ArrayBuffer | Uint8Array;
    timeoutMs?: number;
    ua?: "browser" | "app";
    signal?: AbortSignal;
  } = {},
): Promise<{ status: number; contentType: string; body: ArrayBuffer; url: string }> {
  const controller = new AbortController();
  const parentSignal = opts.signal ?? getTranscriptSignal();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 18_000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "User-Agent": opts.ua === "app" ? APP_UA : BROWSER_UA,
        Accept: "*/*",
        ...opts.headers,
      },
      body: opts.body as BodyInit | undefined,
      signal: controller.signal,
      redirect: "follow",
    });
    const body = await res.arrayBuffer();
    return {
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body,
      url: res.url || url,
    };
  } catch (err) {
    if (parentSignal?.aborted) throw parentSignal.reason ?? new Error("Transcript request cancelled");
    if (controller.signal.aborted) throw new Error("Request timed out");
    throw err;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

export async function fetchText(
  url: string,
  opts: Parameters<typeof fetchBuffer>[1] = {},
): Promise<{ status: number; contentType: string; text: string; url: string }> {
  const res = await fetchBuffer(url, opts);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(res.body);
  return { status: res.status, contentType: res.contentType, text, url: res.url };
}

export async function fetchJson<T>(
  url: string,
  opts: Parameters<typeof fetchBuffer>[1] = {},
): Promise<T> {
  const res = await fetchText(url, {
    ...opts,
    headers: { Accept: "application/json", ...opts.headers },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new HttpError(res.status, res.text);
  }
  return JSON.parse(res.text) as T;
}

export async function resolveRedirect(url: string, timeoutMs = 12_000): Promise<string> {
  const res = await fetchText(url, { timeoutMs, ua: "browser" });
  return res.url || url;
}

export function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number.parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

export function stripHtml(input: string): string {
  return decodeEntities(input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  attempts = 2,
  delayMs = 350,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw last;
}
