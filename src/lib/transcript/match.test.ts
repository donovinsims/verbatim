import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseDurationSeconds,
  rankYoutubeHits,
  titleScore,
  transcriptLooksComplete,
  youtubeCandidateScore,
} from "./match.ts";

describe("parseDurationSeconds", () => {
  it("parses clocks, labels, and itunes integers", () => {
    assert.equal(parseDurationSeconds("3:16:19"), 11779);
    assert.equal(parseDurationSeconds("12:05"), 725);
    assert.equal(parseDurationSeconds("11779"), 11779);
    assert.equal(parseDurationSeconds("11779000"), 11779);
    assert.equal(parseDurationSeconds("3 hours, 16 minutes, 19 seconds"), 11779);
    assert.equal(parseDurationSeconds("21 seconds"), 21);
    assert.equal(parseDurationSeconds({ runs: [{ text: "3:16:19" }] }), 11779);
  });
});

describe("youtube ranking", () => {
  it("prefers the full episode over short clips with closer titles", () => {
    const episodeTitle = "44 Harsh Truths About Human Nature - Naval Ravikant - #922";
    const showTitle = "Modern Wisdom";
    const duration = 11779;
    const clipScore = youtubeCandidateScore(
      { title: "44 Harsh Truths About Human Nature - Naval Ravikant (4K)-Chris Williamson.", durationSeconds: 21 },
      episodeTitle,
      showTitle,
      duration,
    );
    const fullScore = youtubeCandidateScore(
      { title: "44 Harsh Truths About The Game Of Life - Naval Ravikant (4K)", durationSeconds: 11779 },
      episodeTitle,
      showTitle,
      duration,
    );
    assert.ok(fullScore > clipScore, `full ${fullScore} should beat clip ${clipScore}`);
    assert.equal(clipScore, 0);

    const ranked = rankYoutubeHits(
      [
        { videoId: "short1", title: "44 Harsh Truths About Human Nature - Naval Ravikant (4K)", durationSeconds: 21 },
        { videoId: "full", title: "44 Harsh Truths About The Game Of Life - Naval Ravikant (4K)", durationSeconds: 11779 },
        { videoId: "short2", title: "44 Harsh Truths About Human Nature - Naval Ravikant (4K)", durationSeconds: 25 },
      ],
      episodeTitle,
      showTitle,
      duration,
    );
    assert.equal(ranked[0]?.videoId, "full");
  });

  it("rejects a clip-length transcript for a 3-hour episode", () => {
    assert.equal(
      transcriptLooksComplete({ wordCount: 48, durationSeconds: 21, cues: [{ startMs: 0, endMs: 2000, text: "Hello" }] }, 11779),
      false,
    );
    assert.equal(
      transcriptLooksComplete(
        { wordCount: 18000, durationSeconds: 11779, cues: Array.from({ length: 80 }, () => ({ startMs: 0, endMs: 1000, text: "x" })) },
        11779,
      ),
      true,
    );
  });

  it("still scores exact titles highly", () => {
    assert.ok(titleScore("44 Harsh Truths About Human Nature - Naval Ravikant - #922", "44 Harsh Truths About Human Nature - Naval Ravikant - #922") >= 0.99);
  });
});
