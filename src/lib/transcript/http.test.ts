import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchBuffer, runWithTranscriptSignal } from "./http.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("an overall transcript abort cancels an in-flight shared HTTP request", async () => {
  let receivedSignal: AbortSignal | undefined;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    receivedSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      receivedSignal?.addEventListener("abort", () => reject(receivedSignal?.reason), { once: true });
    });
  }) as typeof fetch;

  const controller = new AbortController();
  const request = runWithTranscriptSignal(controller.signal, () =>
    fetchBuffer("https://example.test/feed", { timeoutMs: 1_000 }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort(new Error("overall deadline"));

  await assert.rejects(request, /overall deadline/);
  assert.equal(receivedSignal?.aborted, true);
});

test("an explicit HTTP timeout still aborts only that request", async () => {
  let receivedSignal: AbortSignal | undefined;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    receivedSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      receivedSignal?.addEventListener("abort", () => reject(receivedSignal?.reason), { once: true });
    });
  }) as typeof fetch;

  await assert.rejects(fetchBuffer("https://example.test/feed", { timeoutMs: 5 }), /Request timed out/);
  assert.equal(receivedSignal?.aborted, true);
});
