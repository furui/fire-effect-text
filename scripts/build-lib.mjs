import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const shared = {
  bundle: true,
  sourcemap: true,
  target: ["es2020"],
};

await build({
  ...shared,
  entryPoints: ["src/index.js"],
  format: "esm",
  outfile: "dist/index.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/index.js"],
  format: "cjs",
  outfile: "dist/index.cjs",
});

await build({
  ...shared,
  entryPoints: ["src/vanilla.js"],
  format: "esm",
  outfile: "dist/vanilla.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/vanilla.js"],
  format: "cjs",
  outfile: "dist/vanilla.cjs",
});

await build({
  ...shared,
  entryPoints: ["src/vanilla.js"],
  format: "iife",
  globalName: "FireTextBundle",
  outfile: "dist/fire-text.global.js",
});

await build({
  ...shared,
  entryPoints: ["src/react.js"],
  format: "esm",
  external: ["react"],
  outfile: "dist/react.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/react.js"],
  format: "cjs",
  external: ["react"],
  outfile: "dist/react.cjs",
});

console.log("Built dist/ bundles (core, vanilla, React, IIFE).");
