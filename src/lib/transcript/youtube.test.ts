import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyYoutubePlayability } from "./youtube.ts";

describe("YouTube playability classification", () => {
  it("allows the hosted provider to check ambiguous server playback failures", () => {
    assert.equal(classifyYoutubePlayability("UNPLAYABLE", "This video is unavailable"), "blocked");
    assert.equal(
      classifyYoutubePlayability("LOGIN_REQUIRED", "Sign in to confirm you are not a bot"),
      "blocked",
    );
  });

  it("preserves private and deleted video errors", () => {
    assert.equal(classifyYoutubePlayability("UNPLAYABLE", "This is a private video"), "not_found");
    assert.equal(classifyYoutubePlayability("ERROR", "This video has been deleted"), "not_found");
  });

  it("preserves explicit account and age restrictions", () => {
    assert.equal(
      classifyYoutubePlayability("LOGIN_REQUIRED", "Sign in to confirm your age"),
      "auth_required",
    );
    assert.equal(
      classifyYoutubePlayability("LOGIN_REQUIRED", "This video is for members only"),
      "auth_required",
    );
  });
});
