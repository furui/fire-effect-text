import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

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

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/test/browser-page.html";
      const file = normalize(join(root, pathname));
      if (!file.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type": MIME[extname(file)] || "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        port: server.address().port,
      });
    });
  });
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test("browser renderer selection and output", async (t) => {
  const chrome = findChrome();
  if (!chrome) {
    t.skip("Chrome is not installed; skipping browser tests.");
    return;
  }

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: chrome,
      headless: true,
    });
  } catch (error) {
    t.skip(`Could not launch Chrome: ${error.message}`);
    return;
  }

  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}/test/browser-page.html`;
  t.after(async () => {
    await browser.close();
    server.close();
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base);

  const canvasResult = await page.evaluate(() => window.startFire("canvas2d"));
  assert.equal(canvasResult.ok, true, canvasResult.error);
  assert.equal(canvasResult.renderer, "canvas2d");
  await wait(1400);
  const canvasStats = await page.evaluate(() => window.canvasStats());
  assert.ok(canvasStats.mean > 0.4, `canvas mean ${canvasStats.mean}`);
  assert.ok(canvasStats.lit > 0.01, `canvas lit ${canvasStats.lit}`);

  const glResult = await page.evaluate(() => window.startFire("webgl2", false));
  if (glResult.ok) {
    assert.equal(glResult.renderer, "webgl2");
    await wait(1400);
    const glStats = await page.evaluate(() => window.canvasStats());
    assert.ok(glStats.mean > 0.4, `webgl2 mean ${glStats.mean}`);
    assert.ok(glStats.lit > 0.005, `webgl2 lit ${glStats.lit}`);
    assert.ok(
      Math.abs(glStats.mean - canvasStats.mean) < 110,
      `webgl2 and canvas2d differ too much (${glStats.mean} vs ${canvasStats.mean})`
    );

    await page.evaluate(() => window.startFire("webgl2", true));
    await wait(1200);
    const lost = await page.evaluate(() => window.loseWebGLContext());
    if (lost) {
      await wait(2600);
      const afterLoss = await page.evaluate(() => window.fire.renderer);
      assert.equal(afterLoss, "canvas2d");
    }
  } else {
    t.diagnostic(`WebGL2 unavailable in this browser: ${glResult.error}`);
  }

  const gpuResult = await page.evaluate(() => window.startFire("webgpu", false));
  if (gpuResult.ok) {
    assert.equal(gpuResult.renderer, "webgpu");
    await wait(1400);
    const gpuStats = await page.evaluate(() => window.canvasStats());
    assert.ok(gpuStats.mean > 0.4, `webgpu mean ${gpuStats.mean}`);
  } else {
    t.diagnostic(`WebGPU unavailable in this browser: ${gpuResult.error}`);
  }

  const fallbackPage = await context.newPage();
  await fallbackPage.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      value: undefined,
      configurable: true,
    });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (type === "webgl2") return null;
      return original.call(this, type, ...args);
    };
  });
  await fallbackPage.goto(base);
  const fallback = await fallbackPage.evaluate(() => window.startFire("auto"));
  assert.equal(fallback.ok, true, fallback.error);
  assert.equal(fallback.renderer, "canvas2d");
  await wait(1200);
  const fallbackStats = await fallbackPage.evaluate(() => window.canvasStats());
  assert.ok(fallbackStats.lit > 0.005);
  await fallbackPage.close();
});
