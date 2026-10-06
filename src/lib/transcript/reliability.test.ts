import { afterEach, describe, expect, it, vi } from "vitest";
import { TranscriptError } from "./errors";
import { assertOk, fetchText, mapFetchError } from "./http";
import { checkRateLimit } from "./rate-limit";
import { toErrorResult } from "./errors";
import { assertAudioBudget } from "./stt";
import { parseInput, parseAgentBody } from "./input";

describe("http error mapping", () => {
  it("maps abort to timeout", () => {
    const err = mapFetchError(Object.assign(new Error("aborted"), { name: "AbortError" }));
    expect(err.code).toBe("timeout");
  });

  it("maps 403/404/429 via assertOk", async () => {
    await expect(assertOk(new Response("", { status: 403 }), "https://youtube.com")).rejects.toMatchObject({
      code: "blocked",
    });
    await expect(assertOk(new Response("", { status: 404 }), "https://youtube.com")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(assertOk(new Response("", { status: 429 }), "https://youtube.com")).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("toErrorResult preserves TranscriptError codes", () => {
    const r = toErrorResult(new TranscriptError("no_transcript", "none"));
    expect(r.kind).toBe("error");
    expect(r.code).toBe("no_transcript");
    expect(r.hint).toBeTruthy();
  });
});

describe("fetchText timeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws timeout when the fetch aborts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        return await new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }),
    );
    await expect(fetchText("https://example.com", { timeoutMs: 20 })).rejects.toMatchObject({
      code: "timeout",
    });
  });
});

describe("rate limit", () => {
  it("trips after the window fills", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(key).ok).toBe(true);
    }
    const blocked = checkRateLimit(key);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});

describe("stt budget", () => {
  it("rejects audio over 2h or 50MB", () => {
    expect(() => assertAudioBudget(3 * 60 * 60 * 1000)).toThrowError(/2 hour/);
    expect(() => assertAudioBudget(60_000, 51 * 1024 * 1024)).toThrowError(/50 MB/);
    expect(() => assertAudioBudget(60_000, 1024)).not.toThrow();
  });
});

describe("validators", () => {
  it("parseInput requires a url", () => {
    expect(() => parseInput({})).toThrow();
    expect(parseInput({ url: " https://youtu.be/a " }).url).toBe("https://youtu.be/a");
  });

  it("agent body accepts url or urls and caps at 20", () => {
    expect(parseAgentBody({ url: "https://youtu.be/a" }).url).toBeTruthy();
    expect(parseAgentBody({ urls: ["https://youtu.be/a", "https://youtu.be/b"] }).urls).toHaveLength(2);
    expect(() => parseAgentBody({})).toThrow();
    expect(() => parseAgentBody({ urls: Array.from({ length: 21 }, () => "https://youtu.be/a") })).toThrow();
  });
});
