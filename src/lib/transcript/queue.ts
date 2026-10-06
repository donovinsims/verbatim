import type { HistoryItem, TranscriptResult } from "./types";
import { canonicalJobKey, splitInputUrls } from "./parse-url";

export const MAX_BULK = 20;
export const MAX_HISTORY = 12;
export const HISTORY_KEY = "verbatim.history.v2";
export const SINGLE_CONCURRENCY = 1;
export const BULK_CONCURRENCY = 2;

export function splitAndCapUrls(text: string, cap = MAX_BULK): {
  urls: string[];
  truncated: boolean;
  dropped: number;
} {
  const all = splitInputUrls(text);
  if (all.length <= cap) return { urls: all, truncated: false, dropped: 0 };
  return { urls: all.slice(0, cap), truncated: true, dropped: all.length - cap };
}

export function dedupeJobs<T extends { url: string; feedUrl?: string; guid?: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const keys = new Set(existing.map((j) => canonicalJobKey(j)));
  const out: T[] = [];
  for (const job of incoming) {
    const key = canonicalJobKey(job);
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(job);
  }
  return out;
}

export function historyFromTranscript(t: TranscriptResult, pastedUrl: string): HistoryItem {
  return {
    title: t.title,
    author: t.author,
    wordCount: t.wordCount,
    url: pastedUrl,
    canonicalUrl: t.canonicalUrl,
    savedAt: new Date().toISOString(),
  };
}

export function loadHistory(storage?: Pick<Storage, "getItem"> | null): HistoryItem[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isHistoryItem)
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

export function saveHistory(
  items: HistoryItem[],
  storage?: Pick<Storage, "setItem"> | null,
): HistoryItem[] {
  const next = compactHistory(items).slice(0, MAX_HISTORY);
  if (storage) {
    try {
      storage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* quota — keep memory copy */
    }
  }
  return next;
}

export function pushHistory(
  items: HistoryItem[],
  incoming: HistoryItem,
  storage?: Pick<Storage, "setItem"> | null,
): HistoryItem[] {
  const without = items.filter(
    (h) => h.canonicalUrl.toLowerCase() !== incoming.canonicalUrl.toLowerCase(),
  );
  return saveHistory([incoming, ...without], storage);
}

export function compactHistory(items: HistoryItem[]): HistoryItem[] {
  const seen = new Set<string>();
  const out: HistoryItem[] = [];
  for (const item of items) {
    const key = item.canonicalUrl.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: item.title.slice(0, 180),
      author: item.author?.slice(0, 80),
      wordCount: item.wordCount,
      url: item.url,
      canonicalUrl: item.canonicalUrl,
      savedAt: item.savedAt,
    });
  }
  return out;
}

function isHistoryItem(v: unknown): v is HistoryItem {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.title === "string" && typeof r.url === "string" && typeof r.canonicalUrl === "string";
}

export function newJobId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function concurrencyFor(mode: "single" | "bulk"): number {
  return mode === "bulk" ? BULK_CONCURRENCY : SINGLE_CONCURRENCY;
}
