import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const shared = {
  bundle: true,
  sourcemap: true,
  target: ["es2020"],
};

// 1. Main entry (ESM + CJS)
await build({
  ...shared,
  entryPoints: ["src/index.js"],
  format: "esm",
  external: ["react"],
  outfile: "dist/index.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/index.js"],
  format: "cjs",
  external: ["react"],
  outfile: "dist/index.cjs",
});

// 2. Vanilla-only entry (zero dependencies, ESM + CJS + global IIFE)
await build({
  ...shared,
  entryPoints: ["src/lib/FireText.js"],
  format: "esm",
  outfile: "dist/vanilla.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/lib/FireText.js"],
  format: "cjs",
  outfile: "dist/vanilla.cjs",
});

await build({
  ...shared,
  entryPoints: ["src/lib/FireText.js"],
  format: "iife",
  globalName: "FireTextBundle",
  outfile: "dist/fire-text.global.js",
});

// 3. React entry (ESM + CJS)
await build({
  ...shared,
  entryPoints: ["src/lib/FireTextReact.jsx"],
  format: "esm",
  external: ["react"],
  outfile: "dist/react.mjs",
});

await build({
  ...shared,
  entryPoints: ["src/lib/FireTextReact.jsx"],
  format: "cjs",
  external: ["react"],
  outfile: "dist/react.cjs",
});

console.log("Built dist/ bundles (ESM, CJS, Vanilla, React, IIFE).");
