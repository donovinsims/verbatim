import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTranscript } from "./resolve";

const YT_PLAYER = {
  videoDetails: { videoId: "jNQXAC9IVRw", title: "Me at the Zoo", author: "jawed", lengthSeconds: "19" },
  playabilityStatus: { status: "OK" },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        {
          baseUrl: "https://www.youtube.com/api/timedtext?v=jNQXAC9IVRw&lang=en",
          languageCode: "en",
          kind: "",
        },
      ],
    },
  },
};

const JSON3 = JSON.stringify({
  events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "Alright, so here we are" }] }],
});

describe("resolveTranscript", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns invalid_url for empty input", async () => {
    const r = await resolveTranscript({ url: "   " });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.code).toBe("invalid_url");
  });

  it("returns a youtube transcript from a mocked player + captions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("watch?v=")) {
          return new Response(`var ytInitialPlayerResponse = ${JSON.stringify(YT_PLAYER)};`, { status: 200 });
        }
        if (url.includes("timedtext")) {
          return new Response(JSON3, { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("youtubei/v1/player")) {
          return new Response(JSON.stringify(YT_PLAYER), { status: 200 });
        }
        return new Response("no", { status: 404 });
      }),
    );
    const r = await resolveTranscript({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" });
    expect(r.kind).toBe("transcript");
    if (r.kind === "transcript") {
      expect(r.title).toContain("Zoo");
      expect(r.cues[0]?.text).toMatch(/Alright/i);
      expect(r.wordCount).toBeGreaterThan(0);
    }
  });

  it("returns a collection for an Apple show lookup + RSS", async () => {
    const rss = `<?xml version="1.0"?>
      <rss><channel>
        <title>Darknet Diaries</title>
        <itunes:author>Jack Rhysider</itunes:author>
        <item>
          <title>Carna Botnet</title>
          <guid>ep-13</guid>
          <link>https://darknetdiaries.com/episode/13/</link>
          <itunes:duration>33:00</itunes:duration>
        </item>
        <item>
          <title>Conti</title>
          <guid>ep-180</guid>
          <link>https://darknetdiaries.com/episode/180/</link>
        </item>
      </channel></rss>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("itunes.apple.com/lookup")) {
          return new Response(JSON.stringify({ results: [{ feedUrl: "https://podcast.darknetdiaries.com" }] }), {
            status: 200,
          });
        }
        if (url.includes("podcast.darknetdiaries.com")) {
          return new Response(rss, { status: 200, headers: { "content-type": "application/rss+xml" } });
        }
        return new Response("no", { status: 404 });
      }),
    );
    const r = await resolveTranscript({
      url: "https://podcasts.apple.com/us/podcast/darknet-diaries/id1296350485",
    });
    expect(r.kind).toBe("collection");
    if (r.kind === "collection") {
      expect(r.items.length).toBeGreaterThan(0);
      expect(r.items[0]?.feedUrl).toBeTruthy();
      expect(r.items[0]?.guid).toBeTruthy();
    }
  });
});
