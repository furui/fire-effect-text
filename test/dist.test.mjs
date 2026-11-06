import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../dist/index.mjs";
import * as vanilla from "../dist/vanilla.mjs";
import * as react from "../dist/react.mjs";

test("dist core bundle", () => {
  assert.equal(typeof core.FireText, "function");
  assert.equal(typeof core.createFireText, "function");
  assert.equal(typeof core.DEFAULT_OPTIONS, "object");
  assert.ok(core.OVERLAY_BLEND_MODES.includes("overlay"));
  assert.equal(core.default, core.FireText);
  assert.equal("blackbody" in core, false);
  assert.equal("createNoise" in core, false);
});

test("dist vanilla bundle", () => {
  assert.equal(typeof vanilla.FireText, "function");
  assert.equal(vanilla.default, vanilla.FireText);
});

test("dist react bundle", () => {
  assert.equal(typeof react.FireTextReact, "object");
  assert.equal(typeof react.createFireTextComponent, "function");
  assert.equal(react.default, react.FireTextReact);
});
