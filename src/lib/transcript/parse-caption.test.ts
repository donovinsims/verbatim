import { describe, expect, it } from "vitest";
import { groupWordCues, parseCaptionText } from "./parse-caption";

const SRT = `1
00:00:00,000 --> 00:00:01,500
Hello world

2
00:00:01,500 --> 00:00:03,000
This is a test
`;

const VTT = `WEBVTT

00:00:00.000 --> 00:00:01.500
Hello world

00:00:01.500 --> 00:00:03.000
This is a test
`;

const JSON3 = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
    { tStartMs: 1500, dDurationMs: 1500, segs: [{ utf8: "This is a test" }] },
    { tStartMs: 4000, dDurationMs: 500 },
  ],
});

const XML = `<transcript><text start="0" dur="1.5">Hello world</text><text start="1.5" dur="1.5">This is a test</text></transcript>`;

describe("parseCaptionText", () => {
  it("parses SRT, VTT, JSON3, and YouTube XML into the same cues", () => {
    for (const raw of [SRT, VTT, JSON3, XML]) {
      const cues = parseCaptionText(raw);
      expect(cues.length).toBe(2);
      expect(cues[0]?.text).toBe("Hello world");
      expect(cues[1]?.text).toBe("This is a test");
      expect(cues[0]?.startMs).toBe(0);
      expect(cues[1]?.startMs).toBe(1500);
    }
  });

  it("parses whisper-style JSON segments", () => {
    const cues = parseCaptionText(
      JSON.stringify({ segments: [{ start: 0, end: 1.2, text: "Hi" }, { start: 1.2, end: 2, text: "there" }] }),
    );
    expect(cues.map((c) => c.text)).toEqual(["Hi", "there"]);
  });

  it("merges duplicate overlapping cues", () => {
    const cues = parseCaptionText(
      JSON.stringify({
        events: [
          { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Same" }] },
          { tStartMs: 200, dDurationMs: 1000, segs: [{ utf8: "Same" }] },
        ],
      }),
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]?.endMs).toBeGreaterThan(1000);
  });
});

describe("groupWordCues", () => {
  it("groups words into sentence-sized cues and splits on speaker", () => {
    const cues = groupWordCues([
      { startMs: 0, endMs: 200, text: "Hello" },
      { startMs: 200, endMs: 400, text: "there." },
      { startMs: 900, endMs: 1100, text: "Yes", speaker: "A" },
      { startMs: 1100, endMs: 1300, text: "no", speaker: "B" },
    ]);
    expect(cues[0]?.text).toBe("Hello there.");
    expect(cues.some((c) => c.speaker === "A")).toBe(true);
    expect(cues.some((c) => c.speaker === "B")).toBe(true);
  });
});
