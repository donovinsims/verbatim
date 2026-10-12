import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAudioBudget, transcribeEnclosure } from "./stt";

describe("xAI speech-to-text", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps word timestamps and diarized speakers in the transcript cues", async () => {
    vi.stubEnv("XAI_API_KEY", "test-secret");
    let sentForm: FormData | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://audio.test/episode.mp3") {
        return new Response(null, { status: 200, headers: { "content-length": "1024" } });
      }
      if (url === "https://api.x.ai/v1/stt") {
        sentForm = init?.body as FormData;
        return new Response(
          JSON.stringify({
            text: "Welcome back. Hi there.",
            language: "en",
            duration: 4,
            words: [
              { text: "Welcome", start: 0.25, end: 0.48, speaker: 0 },
              { text: "back.", start: 0.48, end: 0.95, speaker: 0 },
              { text: "Hi", start: 1.2, end: 1.5, speaker: 1 },
              { text: "there.", start: 1.5, end: 1.9, speaker: 1 },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("unexpected request", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeEnclosure({
      enclosureUrl: "https://audio.test/episode.mp3",
      title: "Sample",
      sourceUrl: "https://podcast.test/episode",
      canonicalUrl: "https://podcast.test/episode",
      durationMs: 4_000,
    });

    expect(result.cues).toEqual([
      { startMs: 250, endMs: 950, text: "Welcome back.", speaker: "Speaker 0" },
      { startMs: 1_200, endMs: 1_900, text: "Hi there.", speaker: "Speaker 1" },
    ]);
    expect(sentForm?.get("model")).toBe("grok-voice-transcribe-2.0");
    expect(sentForm?.get("url")).toBe("https://audio.test/episode.mp3");
    expect(sentForm?.get("format")).toBe("true");
    expect(sentForm?.get("diarize")).toBe("true");
  });

  it("enforces the existing two-hour and 50 MB limits", () => {
    expect(() => assertAudioBudget(2 * 60 * 60 * 1000)).not.toThrow();
    expect(() => assertAudioBudget(2 * 60 * 60 * 1000 + 1)).toThrow(
      expect.objectContaining({ code: "too_large" }),
    );
    expect(() => assertAudioBudget(undefined, 50 * 1024 * 1024)).not.toThrow();
    expect(() => assertAudioBudget(undefined, 50 * 1024 * 1024 + 1)).toThrow(
      expect.objectContaining({ code: "too_large" }),
    );
  });

  it("reports when the server key is missing", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    await expect(
      transcribeEnclosure({
        enclosureUrl: "https://audio.test/episode.mp3",
        title: "Sample",
        sourceUrl: "https://podcast.test/episode",
        canonicalUrl: "https://podcast.test/episode",
      }),
    ).rejects.toMatchObject({ code: "stt_unavailable" });
  });
});
