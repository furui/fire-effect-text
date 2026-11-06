import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

async function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* not ready */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the preview server.");
}

const vite = join(root, "node_modules", ".bin", "vite");
if (!existsSync(vite)) {
  throw new Error("vite is not installed. Run npm install first.");
}

const server = spawn(
  vite,
  ["preview", "--port", "4173", "--strictPort"],
  { cwd: root, stdio: "inherit" }
);

let browser;
try {
  await waitForServer("http://127.0.0.1:4173/");
  const chrome = findChrome();
  browser = await chromium.launch({
    ...(chrome ? { executablePath: chrome } : { channel: "chrome" }),
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 520 },
    deviceScaleFactor: 2,
  });
  await page.goto("http://127.0.0.1:4173/?preview=1", {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("#preview-stage");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(3500);
  mkdirSync(join(root, "docs"), { recursive: true });
  await page
    .locator("#preview-stage")
    .screenshot({ path: join(root, "docs", "preview.png") });
  console.log("Wrote docs/preview.png");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
