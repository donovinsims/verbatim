import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTranscript } from "./resolve";

const YT_PLAYER = {
  videoDetails: {
    videoId: "jNQXAC9IVRw",
    title: "Me at the Zoo",
    author: "jawed",
    lengthSeconds: "19",
  },
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
    vi.unstubAllEnvs();
  });

  it("returns invalid_url for empty input", async () => {
    const r = await resolveTranscript({ url: "   " });
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.code).toBe("invalid_url");
  });

  it("returns a youtube transcript from a mocked player + captions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("watch?v=")) {
        return new Response(`var ytInitialPlayerResponse = ${JSON.stringify(YT_PLAYER)};`, {
          status: 200,
        });
      }
      if (url.includes("timedtext")) {
        return new Response(JSON3, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("youtubei/v1/player")) {
        return new Response(JSON.stringify(YT_PLAYER), { status: 200 });
      }
      return new Response("no", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await resolveTranscript({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" });
    expect(r.kind).toBe("transcript");
    if (r.kind === "transcript") {
      expect(r.title).toContain("Zoo");
      expect(r.cues[0]?.text).toMatch(/Alright/i);
      expect(r.wordCount).toBeGreaterThan(0);
    }
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("transcriptapi.com")),
    ).toBe(false);
  });

  it("uses public Invidious captions before hosted providers when YouTube captions are empty", async () => {
    vi.stubEnv("TRANSCRIPTAPI_API_KEY", "");
    const playerWithoutCaptions = { ...YT_PLAYER, captions: undefined };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("watch?v=")) {
        return new Response(
          `var ytInitialPlayerResponse = ${JSON.stringify(playerWithoutCaptions)};`,
          {
            status: 200,
          },
        );
      }
      if (url.includes("youtubei/v1/player")) {
        return new Response(JSON.stringify(playerWithoutCaptions), { status: 200 });
      }
      if (url.includes("/api/v1/captions/jNQXAC9IVRw?label=English")) {
        return new Response("WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nPublic mirror transcript", {
          status: 200,
          headers: { "content-type": "text/vtt" },
        });
      }
      if (url.includes("/api/v1/captions/jNQXAC9IVRw")) {
        return new Response(
          JSON.stringify({
            captions: [
              {
                languageCode: "en",
                label: "English",
                url: "/api/v1/captions/jNQXAC9IVRw?label=English",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("unexpected request", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveTranscript({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" });

    expect(result).toMatchObject({
      kind: "transcript",
      text: "Public mirror transcript",
      language: "en",
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("youtube2text.org"))).toBe(
      false,
    );
  });

  it("uses the original keyless hosted transcript route when mirrors have no captions", async () => {
    vi.stubEnv("TRANSCRIPTAPI_API_KEY", "");
    const playerWithoutCaptions = { ...YT_PLAYER, captions: undefined };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("watch?v=")) {
        return new Response(
          `var ytInitialPlayerResponse = ${JSON.stringify(playerWithoutCaptions)};`,
          {
            status: 200,
          },
        );
      }
      if (url.includes("youtubei/v1/player")) {
        return new Response(JSON.stringify(playerWithoutCaptions), { status: 200 });
      }
      if (url.includes("/api/v1/captions/")) {
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("youtube2text.org/api/demo-key")) {
        return new Response(JSON.stringify({ apiKey: "demo-key" }), { status: 200 });
      }
      if (url.includes("youtube2text.org/api/transcribe")) {
        expect(new Headers(init?.headers).get("x-api-key")).toBe("demo-key");
        return new Response(
          JSON.stringify({
            result: { content: "Keyless hosted transcript", title: "Recovered title" },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return new Response("unexpected request", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveTranscript({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" });

    expect(result).toMatchObject({
      kind: "transcript",
      title: "Recovered title",
      text: "Keyless hosted transcript",
    });
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("transcriptapi.com")),
    ).toBe(false);
  });

  it("continues trying YouTube clients after an unsuccessful playback response", async () => {
    let playerCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("watch?v=")) return new Response("watch page unavailable", { status: 200 });
      if (url.includes("youtubei/v1/player")) {
        playerCalls += 1;
        if (playerCalls === 1) {
          return new Response(
            JSON.stringify({
              playabilityStatus: { status: "UNPLAYABLE", reason: "This video is unavailable" },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify(YT_PLAYER), { status: 200 });
      }
      if (url.includes("timedtext")) return new Response(JSON3, { status: 200 });
      return new Response("unexpected request", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveTranscript({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" });

    expect(result.kind).toBe("transcript");
    expect(playerCalls).toBeGreaterThan(1);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("transcriptapi.com")),
    ).toBe(false);
  });

  it("uses TranscriptAPI when YouTube returns empty caption tracks", async () => {
    vi.stubEnv("TRANSCRIPTAPI_API_KEY", "test-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("watch?v=")) {
          return new Response(`var ytInitialPlayerResponse = ${JSON.stringify(YT_PLAYER)};`, {
            status: 200,
          });
        }
        if (url.includes("timedtext")) return new Response("", { status: 200 });
        if (url.includes("transcriptapi.com/api/v2/youtube/transcript")) {
          return new Response(
            JSON.stringify({
              transcript: [{ text: "Recovered by fallback", start: 2, duration: 3 }],
              language: "en",
              title: "Recovered video",
              author_name: "Recovered channel",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("unexpected request", { status: 404 });
      }),
    );

    const result = await resolveTranscript({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" });

    expect(result).toMatchObject({
      kind: "transcript",
      title: "Recovered video",
      author: "Recovered channel",
      language: "en",
      text: "Recovered by fallback",
      source: "youtube",
    });
    if (result.kind === "transcript") {
      expect(result.cues).toEqual([{ text: "Recovered by fallback", startMs: 2000, endMs: 5000 }]);
    }
  });

  it("checks ambiguous YouTube unavailable responses with TranscriptAPI", async () => {
    vi.stubEnv("TRANSCRIPTAPI_API_KEY", "test-secret");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("watch?v=")) {
        return new Response(
          `var ytInitialPlayerResponse = ${JSON.stringify({
            ...YT_PLAYER,
            playabilityStatus: { status: "UNPLAYABLE", reason: "This video is unavailable" },
          })};`,
          { status: 200 },
        );
      }
      if (url.includes("youtubei/v1/player")) {
        return new Response(
          JSON.stringify({
            playabilityStatus: { status: "UNPLAYABLE", reason: "This video is unavailable" },
          }),
          {
            status: 200,
          },
        );
      }
      if (url.includes("transcriptapi.com/api/v2/youtube/transcript")) {
        return new Response(
          JSON.stringify({
            transcript: [
              { text: "Provider verified the public transcript", start: 0, duration: 4 },
            ],
            title: "Recovered video",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("unexpected request", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveTranscript({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" });

    expect(result).toMatchObject({
      kind: "transcript",
      title: "Recovered video",
      text: "Provider verified the public transcript",
    });
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("transcriptapi.com")),
    ).toBe(true);
  });

  it("preserves definitive private-video restrictions without using TranscriptAPI", async () => {
    vi.stubEnv("TRANSCRIPTAPI_API_KEY", "test-secret");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("watch?v=")) {
        return new Response(
          `var ytInitialPlayerResponse = ${JSON.stringify({
            ...YT_PLAYER,
            playabilityStatus: { status: "UNPLAYABLE", reason: "This is a private video" },
          })};`,
          { status: 200 },
        );
      }
      if (url.includes("youtubei/v1/player")) {
        return new Response(
          JSON.stringify({
            playabilityStatus: { status: "UNPLAYABLE", reason: "This is a private video" },
          }),
          { status: 200 },
        );
      }
      return new Response("unexpected request", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveTranscript({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" });

    expect(result).toMatchObject({ kind: "error", code: "blocked" });
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("transcriptapi.com")),
    ).toBe(false);
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
          return new Response(
            JSON.stringify({ results: [{ feedUrl: "https://podcast.darknetdiaries.com" }] }),
            {
              status: 200,
            },
          );
        }
        if (url.includes("podcast.darknetdiaries.com")) {
          return new Response(rss, {
            status: 200,
            headers: { "content-type": "application/rss+xml" },
          });
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

  it.each([
    [
      "Apple episode",
      "https://podcasts.apple.com/us/podcast/carna-botnet/id1296350485?i=1000402428920",
    ],
    ["Spotify episode", "https://open.spotify.com/episode/52s3YMuCACqHmFb0EufNgw"],
  ])("resolves the exact Carna Botnet match for the %s sample", async (_label, sourceUrl) => {
    const rss = `<?xml version="1.0"?><rss><channel>
      <title>Darknet Diaries</title><itunes:author>Jack Rhysider</itunes:author>
      <item><title>Carna Botnet</title><guid>ep-13</guid><link>https://darknetdiaries.com/episode/13/</link>
        <podcast:transcript url="https://feed.test/carna.vtt" type="text/vtt"/>
      </item>
      <item><title>Wrong episode</title><guid>ep-14</guid><link>https://darknetdiaries.com/episode/14/</link></item>
    </channel></rss>`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("itunes.apple.com/lookup?id=1000402428920")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                trackName: "Carna Botnet",
                trackId: 1000402428920,
                collectionId: 1296350485,
                episodeGuid: "ep-13",
                feedUrl: "https://feed.test/rss",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("open.spotify.com/oembed")) {
        return new Response(
          JSON.stringify({ title: "Carna Botnet", author_name: "Darknet Diaries" }),
          { status: 200 },
        );
      }
      if (url.includes("itunes.apple.com/search")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                trackName: "Carna Botnet",
                trackId: 1000402428920,
                collectionId: 1296350485,
                episodeGuid: "ep-13",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("itunes.apple.com/lookup?id=1296350485")) {
        return new Response(JSON.stringify({ results: [{ feedUrl: "https://feed.test/rss" }] }), {
          status: 200,
        });
      }
      if (url === "https://feed.test/rss") {
        return new Response(rss, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        });
      }
      if (url === "https://feed.test/carna.vtt") {
        return new Response(
          "WEBVTT\n\n00:00:01.000 --> 00:00:10.000\nCarna Botnet transcript. The automated infrastructure scanned public servers around the world and found vulnerable devices. Researchers documented the campaign, its network traffic, the botnet command systems, and how administrators responded to unexpected activity. The episode explains the investigation and its lasting security lessons for organizations and users.",
          { status: 200 },
        );
      }
      return new Response("unexpected request", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveTranscript({ url: sourceUrl });

    if (result.kind === "error")
      throw new Error(
        `${result.code}: ${result.message}; ${result.hint ?? ""}; requests=${fetchMock.mock.calls.map(([input]) => String(input)).join(",")}`,
      );
    expect(result).toMatchObject({ kind: "transcript", title: "Carna Botnet", source: "podcast" });
    if (result.kind === "transcript") {
      expect(result.text).toContain("Carna Botnet transcript");
      expect(result.cues[0]?.startMs).toBe(1000);
    }
  });

  it("returns an episode list when the resolved podcast episode is not confidently in the feed", async () => {
    const rss = `<?xml version="1.0"?><rss><channel><title>Darknet Diaries</title>
      <item><title>Different episode</title><guid>ep-other</guid><link>https://darknetdiaries.com/other</link></item>
    </channel></rss>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("itunes.apple.com/lookup?id=1000402428920")) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  trackName: "Carna Botnet",
                  trackId: 1000402428920,
                  collectionId: 1296350485,
                  episodeGuid: "ep-13",
                  feedUrl: "https://feed.test/rss",
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url === "https://feed.test/rss") return new Response(rss, { status: 200 });
        return new Response("unexpected request", { status: 404 });
      }),
    );

    const result = await resolveTranscript({
      url: "https://podcasts.apple.com/us/podcast/carna-botnet/id1296350485?i=1000402428920",
    });

    expect(result).toMatchObject({ kind: "collection", title: "Darknet Diaries" });
    if (result.kind === "collection") expect(result.items[0]?.title).toBe("Different episode");
  });

  it("returns a Spotify show episode list when catalog matching is uncertain", async () => {
    const rss = `<?xml version="1.0"?><rss><channel><title>Darknet Diaries</title>
      <item><title>Recent episode</title><guid>recent-1</guid><link>https://darknetdiaries.com/recent</link></item>
    </channel></rss>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("open.spotify.com/oembed")) {
          return new Response(
            JSON.stringify({ title: "Unknown episode title", author_name: "Darknet Diaries" }),
            { status: 200 },
          );
        }
        if (url.includes("itunes.apple.com/search") && url.includes("entity=podcastEpisode")) {
          return new Response(
            JSON.stringify({
              results: [{ trackName: "Some other episode", collectionId: 1296350485 }],
            }),
            { status: 200 },
          );
        }
        if (url.includes("itunes.apple.com/search") && url.includes("entity=podcast")) {
          return new Response(
            JSON.stringify({
              results: [{ collectionName: "Darknet Diaries", feedUrl: "https://feed.test/rss" }],
            }),
            { status: 200 },
          );
        }
        if (url === "https://feed.test/rss") return new Response(rss, { status: 200 });
        return new Response("unexpected request", { status: 404 });
      }),
    );

    const result = await resolveTranscript({
      url: "https://open.spotify.com/episode/52s3YMuCACqHmFb0EufNgw",
    });

    expect(result).toMatchObject({ kind: "collection", title: "Darknet Diaries" });
    if (result.kind === "collection") expect(result.items[0]?.title).toBe("Recent episode");
  });
});
