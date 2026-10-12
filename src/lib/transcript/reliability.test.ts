import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportTranscript, slugify, toJson, toPlainText, toSrt } from "./formats.ts";
import { rankYoutubeHits, transcriptLooksComplete } from "./match.ts";
import { splitInputUrls } from "./parse-url.ts";
import { jobKey, mergeQueue } from "./queue.ts";
import type { TranscriptResult } from "./types.ts";

function fakeTranscript(title: string, words: number, cues = 400): TranscriptResult {
  const text = Array.from({ length: words }, (_, i) => `word${i % 97}`).join(" ");
  return {
    url: `https://example.com/${slugify(title)}`,
    canonicalUrl: `https://example.com/${slugify(title)}`,
    source: "podcast",
    title,
    author: "Stress Host",
    durationSeconds: 3 * 3600,
    language: "en",
    isGenerated: true,
    thumbnail: null,
    fetchedAt: new Date().toISOString(),
    cues: Array.from({ length: cues }, (_, i) => ({
      startMs: i * 30_000,
      endMs: i * 30_000 + 28_000,
      text: `Cue ${i} ${text.slice(0, 80)}`,
    })),
    text,
    wordCount: words,
    trackLabel: "Auto captions",
  };
}

describe("bulk paste parsing", () => {
  it("splits, skips comments, and de-dupes within one paste", () => {
    const urls = splitInputUrls(`
https://www.youtube.com/watch?v=jNQXAC9IVRw
https://podcasts.apple.com/us/podcast/id1296350485?i=1000786685956
# ignore me
https://www.youtube.com/watch?v=jNQXAC9IVRw
https://open.spotify.com/episode/77T8QzpcCdhYdZcdudNwuH
    `);
    assert.equal(urls.length, 3);
  });

  it("caps naturally at dozens of unique lines without dropping valid links", () => {
    const lines = Array.from({ length: 80 }, (_, i) => `https://www.youtube.com/watch?v=${String(i).padStart(11, "a")}`);
    const urls = splitInputUrls(lines.join("\n"));
    assert.equal(urls.length, 80);
  });
});

describe("queue overflow", () => {
  it("never drops in-flight jobs when the queue is full", () => {
    const prev = Array.from({ length: 18 }, (_, i) => ({
      id: `old-${i}`,
      url: `https://example.com/${i}`,
      status: i < 2 ? "running" : "done",
    }));
    const created = Array.from({ length: 8 }, (_, i) => ({
      id: `new-${i}`,
      url: `https://example.com/new-${i}`,
      status: "queued",
    }));
    const result = mergeQueue(prev, created, { replace: false, max: 20 });
    assert.equal(result.next.length, 20);
    assert.equal(result.added, 2);
    assert.equal(result.skippedFull, 6);
    assert.ok(result.next.some((j) => j.status === "running"));
    assert.equal(result.next.filter((j) => j.id.startsWith("old-")).length, 18);
  });

  it("skips duplicates and retries failed jobs", () => {
    const prev = [
      { id: "a", url: "https://open.spotify.com/episode/abc?si=123", status: "done" },
      { id: "b", url: "https://example.com/fail", status: "error" },
    ];
    const result = mergeQueue(
      prev,
      [
        { id: "a2", url: "https://open.spotify.com/episode/abc", status: "queued" },
        { id: "b2", url: "https://example.com/fail", status: "queued" },
      ],
      { replace: false, max: 20 },
    );
    assert.equal(result.skippedDupes, 1);
    assert.equal(result.added, 1);
    assert.equal(result.next.some((j) => j.id === "b"), false);
    assert.ok(result.next.some((j) => j.id === "b2"));
  });

  it("treats Spotify share params as the same episode", () => {
    assert.equal(
      jobKey({ url: "https://open.spotify.com/episode/abc?si=xyz" }),
      jobKey({ url: "https://open.spotify.com/episode/abc" }),
    );
  });
});

describe("large transcript export", () => {
  it("serializes a 40k-word transcript without throwing", () => {
    const t = fakeTranscript("Naval three hour", 42_246, 395);
    const txt = toPlainText(t, true);
    const srt = toSrt(t);
    const json = toJson(t);
    assert.ok(txt.length > 10_000, `txt ${txt.length}`);
    assert.ok(srt.includes("-->"));
    assert.ok(json.includes("Naval"));
    const file = exportTranscript(t, "txt");
    assert.match(file.filename, /\.txt$/);
    assert.ok(json.length > 80_000, `json ${json.length}`);
  });

  it("zips colliding titles without overwriting", async () => {
    const a = fakeTranscript("Same Title", 200, 4);
    const b = fakeTranscript("Same Title", 200, 4);
    b.canonicalUrl = "https://example.com/b";
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const used = new Set<string>();
    for (const t of [a, b]) {
      const file = exportTranscript(t, "txt");
      let name = file.filename;
      if (used.has(name)) {
        const stem = name.replace(/\.[^.]+$/, "");
        const ext = name.slice(stem.length);
        let i = 2;
        while (used.has(`${stem}-${i}${ext}`)) i += 1;
        name = `${stem}-${i}${ext}`;
      }
      used.add(name);
      zip.file(name, file.content);
    }
    assert.equal(used.size, 2);
  });
});

describe("history quota shape", () => {
  it("compact history entries stay tiny compared to full transcripts", () => {
    const full = JSON.stringify(fakeTranscript("Long episode", 42_000, 400));
    const compact = JSON.stringify({
      url: "https://example.com/long-episode",
      canonicalUrl: "https://example.com/long-episode",
      title: "Long episode",
      author: "Stress Host",
      source: "podcast",
      durationSeconds: 10800,
      wordCount: 42000,
      fetchedAt: "2026-09-11T00:00:00.000Z",
    });
    assert.ok(full.length > 80_000, `full ${full.length}`);
    assert.ok(compact.length < 500, `compact ${compact.length}`);
  });
});

describe("youtube ranking under noisy search", () => {
  it("still picks the long match among a pile of shorts", () => {
    const hits = [
      ...Array.from({ length: 12 }, (_, i) => ({
        videoId: `short${String(i).padStart(6, "0")}x`,
        title: "44 Harsh Truths About Human Nature clip",
        durationSeconds: 15 + i,
      })),
      {
        videoId: "fullvideo00x",
        title: "44 Harsh Truths About The Game Of Life - Naval Ravikant",
        durationSeconds: 11779,
      },
    ];
    const ranked = rankYoutubeHits(
      hits,
      "44 Harsh Truths About Human Nature - Naval Ravikant - #922",
      "Modern Wisdom",
      11779,
    );
    assert.equal(ranked[0]?.videoId, "fullvideo00x");
    assert.equal(
      transcriptLooksComplete({ wordCount: 40, durationSeconds: 21, cues: [{ startMs: 0, endMs: 1000, text: "hi" }] }, 11779),
      false,
    );
  });
});
