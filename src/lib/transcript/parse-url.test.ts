import { describe, expect, it } from "vitest";
import { canonicalJobKey, parseSourceUrl, splitInputUrls } from "./parse-url";

describe("splitInputUrls", () => {
  it("splits on newlines and commas and dedupes", () => {
    const urls = splitInputUrls("https://youtu.be/a\nhttps://youtu.be/b, https://youtu.be/a\n\n");
    expect(urls).toEqual(["https://youtu.be/a", "https://youtu.be/b"]);
  });
});

describe("parseSourceUrl", () => {
  it("parses YouTube watch, short, embed, and youtu.be", () => {
    expect(parseSourceUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw").kind).toBe("youtube-video");
    expect(parseSourceUrl("https://youtu.be/jNQXAC9IVRw").videoId).toBe("jNQXAC9IVRw");
    expect(parseSourceUrl("https://www.youtube.com/shorts/jNQXAC9IVRw").videoId).toBe("jNQXAC9IVRw");
    expect(parseSourceUrl("https://www.youtube.com/embed/jNQXAC9IVRw").videoId).toBe("jNQXAC9IVRw");
  });

  it("keeps playlist id but prefers video when both exist", () => {
    const parsed = parseSourceUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PLabc");
    expect(parsed.kind).toBe("youtube-video");
    expect(parsed.playlistId).toBe("PLabc");
  });

  it("parses playlist-only links", () => {
    const parsed = parseSourceUrl("https://www.youtube.com/playlist?list=PLabc123");
    expect(parsed.kind).toBe("youtube-playlist");
    expect(parsed.playlistId).toBe("PLabc123");
  });

  it("parses Apple show and episode ids", () => {
    const show = parseSourceUrl("https://podcasts.apple.com/us/podcast/darknet-diaries/id1296350485");
    expect(show.kind).toBe("apple-show");
    expect(show.appleShowId).toBe("1296350485");
    const ep = parseSourceUrl(
      "https://podcasts.apple.com/us/podcast/carna-botnet/id1296350485?i=1000402428920",
    );
    expect(ep.kind).toBe("apple-episode");
    expect(ep.appleEpisodeId).toBe("1000402428920");
  });

  it("parses Spotify show and episode", () => {
    expect(parseSourceUrl("https://open.spotify.com/episode/52s3YMuCACqHmFb0EufNgw").kind).toBe(
      "spotify-episode",
    );
    expect(parseSourceUrl("https://open.spotify.com/show/4XPl3uEEL9hvqMkoZrzbx5").kind).toBe("spotify-show");
  });

  it("detects RSS-looking paths", () => {
    expect(parseSourceUrl("https://podcast.darknetdiaries.com/rss").kind).toBe("rss");
    expect(parseSourceUrl("https://example.com/feed.xml").kind).toBe("rss");
  });

  it("marks junk as unknown", () => {
    expect(parseSourceUrl("not a url at all").kind).toBe("unknown");
    expect(parseSourceUrl("https://example.com/blog/hello").kind).toBe("unknown");
  });
});

describe("canonicalJobKey", () => {
  it("uses feed+guid when present so show picks do not collapse", () => {
    const a = canonicalJobKey({
      url: "https://darknetdiaries.com/episode/13/",
      feedUrl: "https://podcast.darknetdiaries.com",
      guid: "ep-13",
    });
    const b = canonicalJobKey({
      url: "https://podcasts.apple.com/us/podcast/darknet-diaries/id1296350485",
      feedUrl: "https://podcast.darknetdiaries.com",
    });
    expect(a).not.toBe(b);
    expect(a).toContain("ep:");
  });
});
