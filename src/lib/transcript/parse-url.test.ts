import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSourceUrl, normalizeUrl } from "./parse-url.ts";

describe("parseSourceUrl", () => {
  it("parses YouTube watch, short, and shorts URLs", () => {
    assert.equal(parseSourceUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw").kind, "youtube-video");
    assert.equal(parseSourceUrl("https://youtu.be/jNQXAC9IVRw").kind, "youtube-video");
    assert.equal(parseSourceUrl("jNQXAC9IVRw").kind, "youtube-video");
    assert.equal(parseSourceUrl("https://www.youtube.com/shorts/jNQXAC9IVRw").kind, "youtube-video");
  });

  it("parses Apple Podcasts episode and show URLs", () => {
    const episode = parseSourceUrl(
      "https://podcasts.apple.com/us/podcast/the-courthouse-revisited/id1296350485?i=1000786685956",
    );
    assert.deepEqual(episode, {
      kind: "apple-episode",
      showId: "1296350485",
      episodeId: "1000786685956",
      url: "https://podcasts.apple.com/us/podcast/the-courthouse-revisited/id1296350485?i=1000786685956",
    });
    const nested = parseSourceUrl("https://podcasts.apple.com/us/podcast/name/id1296350485/id1000786685956");
    assert.equal(nested.kind, "apple-episode");
    if (nested.kind === "apple-episode") {
      assert.equal(nested.showId, "1296350485");
      assert.equal(nested.episodeId, "1000786685956");
    }
    const show = parseSourceUrl("https://podcasts.apple.com/us/podcast/darknet-diaries/id1296350485");
    assert.equal(show.kind, "apple-show");
  });

  it("parses Spotify episode, show, intl, and URI forms", () => {
    const ep = parseSourceUrl("https://open.spotify.com/episode/5Q2dkZHfnGb2Y4BzzoN298");
    assert.equal(ep.kind, "spotify-episode");
    const intl = parseSourceUrl("https://open.spotify.com/intl-de/episode/5Q2dkZHfnGb2Y4BzzoN298");
    assert.equal(intl.kind, "spotify-episode");
    if (intl.kind === "spotify-episode") assert.equal(intl.id, "5Q2dkZHfnGb2Y4BzzoN298");
    const nestedIntl = parseSourceUrl("https://open.spotify.com/intl/en/episode/5Q2dkZHfnGb2Y4BzzoN298");
    assert.equal(nestedIntl.kind, "spotify-episode");
    const uri = parseSourceUrl("spotify:episode:5Q2dkZHfnGb2Y4BzzoN298");
    assert.equal(uri.kind, "spotify-episode");
    const show = parseSourceUrl("https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL");
    assert.equal(show.kind, "spotify-show");
  });

  it("normalizes host-only Apple and Spotify URLs", () => {
    assert.equal(
      normalizeUrl("podcasts.apple.com/us/podcast/id1296350485"),
      "https://podcasts.apple.com/us/podcast/id1296350485",
    );
    assert.equal(
      normalizeUrl("open.spotify.com/episode/5Q2dkZHfnGb2Y4BzzoN298"),
      "https://open.spotify.com/episode/5Q2dkZHfnGb2Y4BzzoN298",
    );
  });
});
