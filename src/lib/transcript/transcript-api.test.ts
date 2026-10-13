import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { fetchTranscriptApi } from "./transcript-api.ts";

const oldFetch = globalThis.fetch;
const oldPrimary = process.env.TRANSCRIPTAPI_API_KEY;
const oldSecondary = process.env.TRANSCRIPTAPI_API_KEY_2;

before(() => {
  process.env.TRANSCRIPTAPI_API_KEY = "primary-test-key";
  process.env.TRANSCRIPTAPI_API_KEY_2 = "secondary-test-key";
});

after(() => {
  globalThis.fetch = oldFetch;
  if (oldPrimary === undefined) delete process.env.TRANSCRIPTAPI_API_KEY;
  else process.env.TRANSCRIPTAPI_API_KEY = oldPrimary;
  if (oldSecondary === undefined) delete process.env.TRANSCRIPTAPI_API_KEY_2;
  else process.env.TRANSCRIPTAPI_API_KEY_2 = oldSecondary;
});

describe("TranscriptAPI key fallback", () => {
  it("uses the secondary account after the primary is rate limited", async () => {
    const authorization: string[] = [];
    let calls = 0;
    globalThis.fetch = (async (_input, init) => {
      calls += 1;
      authorization.push(new Headers(init?.headers).get("authorization") ?? "");
      if (calls === 1) return new Response("rate limited", { status: 429 });
      return new Response(
        JSON.stringify({
          transcript: [{ text: "A useful caption", start: 1.25, duration: 2.5 }],
          title: "Example video",
          author_name: "Example channel",
          duration: 3.75,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await fetchTranscriptApi("abcdefghijk", "https://youtu.be/abcdefghijk");

    assert.equal(calls, 2);
    assert.deepEqual(authorization, ["Bearer primary-test-key", "Bearer secondary-test-key"]);
    assert.equal(result.title, "Example video");
    assert.equal(result.cues[0]?.startMs, 1250);
    assert.equal(result.cues[0]?.text, "A useful caption");
  });

  it("does not spend the secondary account when the primary succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ transcript: "A transcript" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await fetchTranscriptApi("abcdefghijk", "https://youtu.be/abcdefghijk");

    assert.equal(calls, 1);
    assert.equal(result.text, "A transcript");
  });
});
