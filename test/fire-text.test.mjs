import test from "node:test";
import assert from "node:assert/strict";
import {
  FireText,
  createFireText,
  DEFAULT_OPTIONS,
  OVERLAY_BLEND_MODES,
} from "../src/index.js";
import {
  blackbody,
  kelvin,
  LUT_SIZE,
  T_MAX,
  getSharedLUTs,
} from "../src/lib/blackbody.js";
import { createNoise, clamp } from "../src/lib/noise.js";
import { selectBackends } from "../src/lib/backends/select.js";
import {
  clampFuel,
  clampFlameHeight,
  clampSimScale,
} from "../src/lib/physics.js";

test("FireText exports and constants", () => {
  assert.equal(typeof FireText, "function");
  assert.equal(typeof createFireText, "function");
  assert.equal(typeof DEFAULT_OPTIONS, "object");
  assert.equal(Array.isArray(OVERLAY_BLEND_MODES), true);
  assert.equal(Object.isFrozen(OVERLAY_BLEND_MODES), true);
  assert.ok(OVERLAY_BLEND_MODES.includes("source-over"));
  assert.ok(OVERLAY_BLEND_MODES.includes("hard-light"));
});

test("Default options", () => {
  assert.equal(DEFAULT_OPTIONS.flameHeight, 1.0);
  assert.equal("buoyancy" in DEFAULT_OPTIONS, false);
  assert.equal(DEFAULT_OPTIONS.paused, false);
  assert.equal(DEFAULT_OPTIONS.overlayText, false);
  assert.equal(DEFAULT_OPTIONS.overlayBlendMode, "source-over");
  assert.equal(DEFAULT_OPTIONS.renderer, "auto");
  assert.equal(DEFAULT_OPTIONS.fallback, true);
  assert.equal(DEFAULT_OPTIONS.interactive, true);
  assert.equal(DEFAULT_OPTIONS.pointerStrength, 1.0);
});

test("Option clamps match documented ranges", () => {
  assert.equal(clampFuel(99), 2.5);
  assert.equal(clampFuel(0), 0.2);
  assert.equal(clampFlameHeight(99), 3.0);
  assert.equal(clampFlameHeight(0), 0.15);
  assert.equal(clampFlameHeight(undefined), 1.0);
  assert.equal(clampSimScale(99), 6.0);
  assert.equal(clampSimScale(0, 3.0), 3.0);
});

test("Renderer selection", () => {
  assert.deepEqual(selectBackends("auto", true), [
    "webgpu",
    "webgl2",
    "canvas2d",
  ]);
  assert.deepEqual(selectBackends("auto", false), [
    "webgpu",
    "webgl2",
    "canvas2d",
  ]);
  assert.deepEqual(selectBackends("webgpu", true), [
    "webgpu",
    "webgl2",
    "canvas2d",
  ]);
  assert.deepEqual(selectBackends("webgpu", false), ["webgpu"]);
  assert.deepEqual(selectBackends("webgl2", true), ["webgl2", "canvas2d"]);
  assert.deepEqual(selectBackends("webgl2", false), ["webgl2"]);
  assert.deepEqual(selectBackends("canvas2d", true), ["canvas2d"]);
  assert.deepEqual(selectBackends("nope", true), [
    "webgpu",
    "webgl2",
    "canvas2d",
  ]);
});

test("Mathematics and blackbody functions", () => {
  assert.equal(clamp(10, 0, 5), 5);
  assert.equal(clamp(-2, 0, 5), 0);
  assert.equal(clamp(3, 0, 5), 3);

  const noise = createNoise(42);
  assert.equal(typeof noise.noise2(1.5, 2.5), "number");
  assert.equal(typeof noise.noise3(1.5, 2.5, 3.5), "number");
  assert.equal(noise.permutation.length, 512);
  assert.equal(noise.grad3.length, 12);

  const bb = blackbody(1200);
  assert.ok(bb.r > 0);
  assert.ok(bb.Y > 0);
  assert.equal(typeof kelvin(1.0), "number");

  const luts = getSharedLUTs();
  assert.equal(luts.lutR.length, LUT_SIZE);
  assert.equal(luts.lutG.length, LUT_SIZE);
  assert.equal(luts.lutB.length, LUT_SIZE);
  assert.equal(T_MAX, 1.5);
  assert.equal(luts.sparkPalette.length, 64);
});
