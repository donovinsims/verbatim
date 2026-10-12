import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appleSpring, project, rubberband } from "./spring.ts";

describe("apple projection", () => {
  it("projects a flick further than the release point", () => {
    const delta = project(-800);
    assert.ok(delta < -300, `projected ${delta}`);
  });

  it("rubber-bands past the leading edge", () => {
    const resisted = rubberband(100, 280);
    assert.ok(resisted > 0 && resisted < 100);
  });
});

describe("appleSpring", () => {
  it("maps damping 1 / response 0.4 to a stiff critical spring", () => {
    const { stiffness, damping } = appleSpring(1, 0.4);
    const omega = (2 * Math.PI) / 0.4;
    assert.ok(Math.abs(stiffness - omega * omega) < 0.001);
    assert.ok(Math.abs(damping - 2 * omega) < 0.001);
  });
});
