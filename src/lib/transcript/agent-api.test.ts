import { describe, expect, it, vi } from "vitest";
import { handleTranscribeRequest } from "./agent-api";

describe("handleTranscribeRequest", () => {
  it("describes the endpoint on GET", async () => {
    const res = await handleTranscribeRequest(new Request("https://verbatim.local/api/transcribe"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { method: string };
    expect(body.method).toBe("POST");
  });

  it("rejects empty JSON with invalid_url", async () => {
    const res = await handleTranscribeRequest(
      new Request("https://verbatim.local/api/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { kind: string; code: string };
    expect(body.kind).toBe("error");
    expect(body.code).toBe("invalid_url");
  });

  it("allows Telegram CORS and blocks a random origin", async () => {
    const allowed = await handleTranscribeRequest(
      new Request("https://verbatim.local/api/transcribe", {
        method: "OPTIONS",
        headers: { origin: "https://web.telegram.org" },
      }),
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://web.telegram.org");

    const denied = await handleTranscribeRequest(
      new Request("https://verbatim.local/api/transcribe", {
        method: "OPTIONS",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("returns a batch wrapper for urls[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    const res = await handleTranscribeRequest(
      new Request("https://verbatim.local/api/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          urls: ["https://example.com/not-a-feed", "https://example.com/also-not"],
        }),
      }),
    );
    const body = (await res.json()) as { kind: string; results: unknown[] };
    expect(body.kind).toBe("batch");
    expect(body.results).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});
