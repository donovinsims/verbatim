import { describe, expect, it } from "vitest";
import { combinedScore, isGoodEpisodeMatch, scoreDuration, scoreTitle } from "./match";

describe("scoreTitle", () => {
  it("scores exact and near titles highly", () => {
    expect(scoreTitle("Carna Botnet", "Carna Botnet")).toBe(1);
    expect(scoreTitle("13: Carna Botnet", "Carna Botnet")).toBeGreaterThan(0.7);
    expect(scoreTitle("Ep 13 Carna Botnet - Darknet Diaries", "Carna Botnet")).toBeGreaterThan(0.55);
  });

  it("scores unrelated titles low", () => {
    expect(scoreTitle("Carna Botnet", "Ubiquiti")).toBeLessThan(0.3);
  });
});

describe("scoreDuration", () => {
  it("is high when close and low when far", () => {
    expect(scoreDuration(33 * 60_000, 34 * 60_000)).toBeGreaterThan(0.75);
    expect(scoreDuration(33 * 60_000, 90 * 60_000)).toBeLessThan(0.4);
    expect(scoreDuration(undefined, 1000)).toBe(0.5);
  });
});

describe("isGoodEpisodeMatch", () => {
  it("accepts a duration-aligned YouTube fallback", () => {
    expect(
      isGoodEpisodeMatch("13: Carna Botnet", "Carna Botnet | Darknet Diaries", 33 * 60_000, 34 * 60_000),
    ).toBe(true);
  });

  it("rejects a title collision with the wrong runtime", () => {
    expect(isGoodEpisodeMatch("Conti", "Conti trailer", 63 * 60_000, 90_000)).toBe(false);
  });

  it("combined score is a weighted blend", () => {
    const s = combinedScore("Carna Botnet", "Carna Botnet", 1000, 1000);
    expect(s).toBeGreaterThan(0.9);
  });
});
