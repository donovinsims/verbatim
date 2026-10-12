import type { CollectionResult, TranscriptResult, TranscriptSource } from "./types";

export const MAX_BULK = 20;
export const MAX_HISTORY = 12;
export const HISTORY_KEY = "verbatim.history.v2";
export const QUEUE_KEY = "verbatim.queue.v1";
export const FETCH_TIMEOUT_MS = 90_000;
const LEGACY_HISTORY_KEY = "verbatim.history.v1";

const DROP_PARAMS = new Set([
  "si",
  "feature",
  "pp",
  "fbclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);

export type Queueable = {
  id: string;
  url: string;
  guid?: string;
  feedUrl?: string;
  status: string;
};

export type HistoryEntry = {
  url: string;
  canonicalUrl: string;
  title: string;
  author: string;
  source: TranscriptSource;
  durationSeconds: number | null;
  wordCount: number;
  fetchedAt: string;
  thumbnail: string | null;
};

export function jobKey(job: { url: string; guid?: string }): string {
  if (job.guid?.trim()) return `guid:${job.guid.trim().toLowerCase()}`;
  const raw = job.url.trim();
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (DROP_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    return u.toString().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export function mergeQueue<T extends Queueable>(
  prev: T[],
  incoming: T[],
  opts: { replace: boolean; max?: number },
): { next: T[]; added: number; skippedDupes: number; skippedFull: number } {
  const max = opts.max ?? MAX_BULK;
  if (opts.replace) {
    const next = incoming.slice(0, max);
    return {
      next,
      added: next.length,
      skippedDupes: 0,
      skippedFull: Math.max(0, incoming.length - next.length),
    };
  }

  const incomingKeys = new Set(incoming.map(jobKey));
  const base = prev.filter((j) => !(j.status === "error" && incomingKeys.has(jobKey(j))));
  const keys = new Set(base.map(jobKey));
  const accepted: T[] = [];
  let skippedDupes = 0;
  let skippedFull = 0;
  for (const job of incoming) {
    const key = jobKey(job);
    if (keys.has(key)) {
      skippedDupes += 1;
      continue;
    }
    if (base.length + accepted.length >= max) {
      skippedFull += 1;
      continue;
    }
    keys.add(key);
    accepted.push(job);
  }
  return {
    next: [...base, ...accepted],
    added: accepted.length,
    skippedDupes,
    skippedFull,
  };
}

export function compactHistoryEntry(
  item: Pick<
    TranscriptResult,
    "url" | "canonicalUrl" | "title" | "author" | "source" | "durationSeconds" | "wordCount" | "fetchedAt" | "thumbnail"
  >,
): HistoryEntry {
  return {
    url: item.url,
    canonicalUrl: item.canonicalUrl || item.url,
    title: item.title || "Transcript",
    author: item.author || "",
    source: item.source,
    durationSeconds: item.durationSeconds ?? null,
    wordCount: item.wordCount ?? 0,
    fetchedAt: item.fetchedAt,
    thumbnail: item.thumbnail ?? null,
  };
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map(asHistoryEntry).filter((row) => row.canonicalUrl).slice(0, MAX_HISTORY);
    }
    const legacy = localStorage.getItem(LEGACY_HISTORY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as unknown;
      if (Array.isArray(parsed)) {
        const compact = parsed.map(asHistoryEntry).filter((row) => row.canonicalUrl).slice(0, MAX_HISTORY);
        saveHistory(compact);
        localStorage.removeItem(LEGACY_HISTORY_KEY);
        return compact;
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return [];
}

export function saveHistory(items: HistoryEntry[]): HistoryEntry[] {
  let next = items.slice(0, MAX_HISTORY).map(asHistoryEntry);
  for (;;) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    } catch {
      if (next.length === 0) return [];
      next = next.slice(0, -1);
    }
  }
}

function asHistoryEntry(item: unknown): HistoryEntry {
  const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const source = rec.source === "youtube" || rec.source === "rss" ? rec.source : "podcast";
  return {
    url: typeof rec.url === "string" ? rec.url : "",
    canonicalUrl: typeof rec.canonicalUrl === "string" ? rec.canonicalUrl : typeof rec.url === "string" ? rec.url : "",
    title: typeof rec.title === "string" && rec.title ? rec.title : "Transcript",
    author: typeof rec.author === "string" ? rec.author : "",
    source,
    durationSeconds: typeof rec.durationSeconds === "number" ? rec.durationSeconds : null,
    wordCount: typeof rec.wordCount === "number" ? rec.wordCount : 0,
    fetchedAt: typeof rec.fetchedAt === "string" ? rec.fetchedAt : new Date().toISOString(),
    thumbnail: typeof rec.thumbnail === "string" && rec.thumbnail ? rec.thumbnail : null,
  };
}

export type PersistedJob = {
  id: string;
  url: string;
  feedUrl?: string;
  guid?: string;
  label: string;
  status: "queued" | "done" | "error" | "collection";
  error?: string;
  hint?: string;
  retries?: number;
  transcript?: TranscriptResult;
  collection?: CollectionResult;
};

export function loadQueue(): PersistedJob[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(asPersistedJob).filter((row) => row.url).slice(0, MAX_BULK);
  } catch {
    return [];
  }
}

export function saveQueue(jobs: PersistedJob[]): PersistedJob[] {
  let next = jobs.slice(0, MAX_BULK).map((job) => ({
    ...job,
    status: job.status === "queued" ? ("queued" as const) : job.status,
  }));
  for (;;) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
      return next;
    } catch {
      const heavy = next.findIndex((j) => j.transcript && Array.isArray(j.transcript.cues) && j.transcript.cues.length > 0);
      if (heavy >= 0 && next[heavy].transcript) {
        next = next.map((j, i) =>
          i === heavy && j.transcript
            ? { ...j, transcript: { ...j.transcript, cues: [{ startMs: 0, endMs: 0, text: j.transcript.text }] } }
            : j,
        );
        continue;
      }
      if (next.length === 0) return [];
      next = next.slice(0, -1);
    }
  }
}

function asPersistedJob(item: unknown): PersistedJob {
  const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const status =
    rec.status === "done" || rec.status === "error" || rec.status === "collection" ? rec.status : "queued";
  return {
    id: typeof rec.id === "string" ? rec.id : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    url: typeof rec.url === "string" ? rec.url : "",
    feedUrl: typeof rec.feedUrl === "string" ? rec.feedUrl : undefined,
    guid: typeof rec.guid === "string" ? rec.guid : undefined,
    label: typeof rec.label === "string" && rec.label ? rec.label : typeof rec.url === "string" ? rec.url : "Link",
    status,
    error: typeof rec.error === "string" ? rec.error : undefined,
    hint: typeof rec.hint === "string" ? rec.hint : undefined,
    retries: typeof rec.retries === "number" ? rec.retries : 0,
    transcript: rec.transcript && typeof rec.transcript === "object" ? (rec.transcript as TranscriptResult) : undefined,
    collection: rec.collection && typeof rec.collection === "object" ? (rec.collection as CollectionResult) : undefined,
  };
}
