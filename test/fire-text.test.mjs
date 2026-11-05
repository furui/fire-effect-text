import test from "node:test";
import assert from "node:assert/strict";
import { FireText, createFireText, DEFAULT_OPTIONS, OVERLAY_BLEND_MODES } from "../dist/vanilla.mjs";
import { blackbody, kelvin, createNoise, clamp } from "../dist/index.mjs";

test("FireText exports and constants", () => {
  assert.equal(typeof FireText, "function");
  assert.equal(typeof createFireText, "function");
  assert.equal(typeof DEFAULT_OPTIONS, "object");
  assert.equal(Array.isArray(OVERLAY_BLEND_MODES), true);
  assert.ok(OVERLAY_BLEND_MODES.includes("source-over"));
  assert.ok(OVERLAY_BLEND_MODES.includes("hard-light"));
});

test("Default options include flameHeight, paused, and overlay settings", () => {
  assert.equal(DEFAULT_OPTIONS.flameHeight, 1.0);
  assert.equal(DEFAULT_OPTIONS.buoyancy, 1.0);
  assert.equal(DEFAULT_OPTIONS.paused, false);
  assert.equal(DEFAULT_OPTIONS.overlayText, false);
  assert.equal(DEFAULT_OPTIONS.overlayBlendMode, "source-over");
});

test("Mathematics & Blackbody radiation functions", () => {
  assert.equal(clamp(10, 0, 5), 5);
  assert.equal(clamp(-2, 0, 5), 0);
  assert.equal(clamp(3, 0, 5), 3);

  const noise = createNoise(42);
  const n2 = noise.noise2(1.5, 2.5);
  const n3 = noise.noise3(1.5, 2.5, 3.5);
  assert.equal(typeof n2, "number");
  assert.equal(typeof n3, "number");

  const bb = blackbody(1200);
  assert.ok(bb.r > 0);
  assert.ok(bb.Y > 0);
  assert.equal(typeof kelvin(1.0), "number");
});
