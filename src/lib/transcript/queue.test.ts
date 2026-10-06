import { describe, expect, it } from "vitest";
import {
  compactHistory,
  dedupeJobs,
  HISTORY_KEY,
  historyFromTranscript,
  loadHistory,
  MAX_BULK,
  MAX_HISTORY,
  pushHistory,
  saveHistory,
  splitAndCapUrls,
} from "./queue";
import type { TranscriptResult } from "./types";

function transcript(over: Partial<TranscriptResult> = {}): TranscriptResult {
  return {
    kind: "transcript",
    title: "Me at the Zoo",
    author: "jawed",
    source: "youtube",
    sourceUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    canonicalUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    cues: [{ startMs: 0, endMs: 1000, text: "Alright" }],
    text: "Alright",
    wordCount: 1,
    fetchedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("splitAndCapUrls", () => {
  it("caps bulk at 20", () => {
    const text = Array.from({ length: 25 }, (_, i) => `https://youtu.be/${i}`).join("\n");
    const { urls, truncated, dropped } = splitAndCapUrls(text);
    expect(urls).toHaveLength(MAX_BULK);
    expect(truncated).toBe(true);
    expect(dropped).toBe(5);
  });
});

describe("dedupeJobs", () => {
  it("skips the same canonical video", () => {
    const existing = [{ url: "https://youtu.be/jNQXAC9IVRw" }];
    const incoming = [{ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" }];
    expect(dedupeJobs(existing, incoming)).toEqual([]);
  });

  it("does not treat a guid pick as the parent show", () => {
    const existing = [{ url: "https://podcasts.apple.com/us/podcast/x/id1", feedUrl: "https://feed.example/rss" }];
    const incoming = [
      {
        url: "https://example.com/ep",
        feedUrl: "https://feed.example/rss",
        guid: "ep-1",
      },
    ];
    expect(dedupeJobs(existing, incoming)).toHaveLength(1);
  });
});

describe("history", () => {
  it("stores compact metadata only, last 12, newest first", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    let items = loadHistory(storage);
    for (let i = 0; i < 15; i++) {
      items = pushHistory(
        items,
        historyFromTranscript(
          transcript({ title: `T${i}`, canonicalUrl: `https://www.youtube.com/watch?v=${i}` }),
          `https://youtu.be/${i}`,
        ),
        storage,
      );
    }
    expect(items).toHaveLength(MAX_HISTORY);
    expect(items[0]?.title).toBe("T14");
    expect(JSON.parse(store.get(HISTORY_KEY) ?? "[]")).toHaveLength(MAX_HISTORY);
    const packed = compactHistory(items);
    expect(packed[0] && "cues" in packed[0]).toBe(false);
  });

  it("survives corrupt localStorage", () => {
    const storage = { getItem: () => "not-json", setItem: () => undefined };
    expect(loadHistory(storage)).toEqual([]);
  });

  it("saveHistory writes the key", () => {
    const store: Record<string, string> = {};
    saveHistory(
      [{ title: "A", url: "u", canonicalUrl: "c", savedAt: "t" }],
      { setItem: (k, v) => { store[k] = v; } },
    );
    expect(store[HISTORY_KEY]).toContain("A");
  });
});
