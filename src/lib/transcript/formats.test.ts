import { describe, expect, it } from "vitest";
import { serializeTranscript, toSrt, toVtt } from "./formats";
import type { TranscriptResult } from "./types";

const sample: TranscriptResult = {
  kind: "transcript",
  title: "Zoo",
  author: "jawed",
  source: "youtube",
  sourceUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  canonicalUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  cues: [
    { startMs: 0, endMs: 1500, text: "Hello", speaker: "Host" },
    { startMs: 1500, endMs: 3000, text: "World" },
  ],
  text: "Hello\nWorld",
  wordCount: 2,
  fetchedAt: "2026-01-01T00:00:00.000Z",
};

describe("serializeTranscript", () => {
  it("emits TXT with optional timestamps", () => {
    const plain = serializeTranscript(sample, "txt", { timestamps: false });
    expect(plain).toContain("Hello\nWorld");
    const timed = serializeTranscript(sample, "txt", { timestamps: true });
    expect(timed).toMatch(/\[0:00].*Hello/);
  });

  it("emits valid-enough SRT and VTT", () => {
    const srt = toSrt(sample.cues);
    expect(srt).toContain("00:00:00,000 --> 00:00:01,500");
    expect(srt).toContain("Host: Hello");
    const vtt = toVtt(sample.cues, sample.title);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:01.500");
  });

  it("emits JSON that round-trips cues", () => {
    const json = JSON.parse(serializeTranscript(sample, "json")) as TranscriptResult;
    expect(json.cues).toHaveLength(2);
    expect(json.kind).toBe("transcript");
  });
});
