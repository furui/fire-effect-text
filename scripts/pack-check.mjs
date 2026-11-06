import { execFileSync } from "node:child_process";

const raw = execFileSync(
  "npm",
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
);
const [info] = JSON.parse(raw);
const files = new Set(info.files.map((file) => file.path));

const required = [
  "dist/index.mjs",
  "dist/index.cjs",
  "dist/vanilla.mjs",
  "dist/vanilla.cjs",
  "dist/react.mjs",
  "dist/react.cjs",
  "dist/fire-text.global.js",
  "types/index.d.ts",
  "types/vanilla.d.ts",
  "types/react.d.ts",
  "docs/preview.png",
  "README.md",
  "LICENSE",
];

const missing = required.filter((file) => !files.has(file));
if (missing.length) {
  throw new Error(`Missing files in package tarball: ${missing.join(", ")}`);
}

const forbidden = ["src/", "demo/", "test/", "scripts/", ".kilo/", ".github/"];
const leaked = [...files].filter((file) =>
  forbidden.some((prefix) => file.startsWith(prefix))
);
if (leaked.length) {
  throw new Error(`Unexpected files in package tarball: ${leaked.join(", ")}`);
}

console.log(`Package tarball OK (${files.size} files).`);
