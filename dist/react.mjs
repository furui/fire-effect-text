// src/lib/FireTextReact.jsx
import React from "react";

// src/lib/noise.js
var clamp = (v, min, max) => v < min ? min : v > max ? max : v;
function createNoise(seed = 77) {
  let s = seed | 0 || 1;
  const rand = () => {
    s = 16807 * s % 2147483647;
    return (s - 1) / 2147483646;
  };
  const p = new Uint8Array(512);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = rand() * (i + 1) | 0;
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const grad3 = [
    [1, 1, 0],
    [-1, 1, 0],
    [1, -1, 0],
    [-1, -1, 0],
    [1, 0, 1],
    [-1, 0, 1],
    [1, 0, -1],
    [-1, 0, -1],
    [0, 1, 1],
    [0, -1, 1],
    [0, 1, -1],
    [0, -1, -1]
  ];
  const dot2 = (gi, x, y) => {
    const g = grad3[gi % 12];
    return g[0] * x + g[1] * y;
  };
  const dot3 = (gi, x, y, z) => {
    const g = grad3[gi % 12];
    return g[0] * x + g[1] * y + g[2] * z;
  };
  return {
    noise2(x, y) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const u = fade(xf);
      const v = fade(yf);
      const aa = p[p[X] + Y];
      const ab = p[p[X] + Y + 1];
      const ba = p[p[X + 1] + Y];
      const bb = p[p[X + 1] + Y + 1];
      const x1 = lerp(dot2(aa, xf, yf), dot2(ba, xf - 1, yf), u);
      const x2 = lerp(dot2(ab, xf, yf - 1), dot2(bb, xf - 1, yf - 1), u);
      return lerp(x1, x2, v);
    },
    noise3(x, y, z) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const Z = Math.floor(z) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const zf = z - Math.floor(z);
      const u = fade(xf);
      const v = fade(yf);
      const w = fade(zf);
      const A = p[X] + Y;
      const AA = p[A] + Z;
      const AB = p[A + 1] + Z;
      const B = p[X + 1] + Y;
      const BA = p[B] + Z;
      const BB = p[B + 1] + Z;
      return lerp(
        lerp(
          lerp(dot3(p[AA], xf, yf, zf), dot3(p[BA], xf - 1, yf, zf), u),
          lerp(dot3(p[AB], xf, yf - 1, zf), dot3(p[BB], xf - 1, yf - 1, zf), u),
          v
        ),
        lerp(
          lerp(dot3(p[AA + 1], xf, yf, zf - 1), dot3(p[BA + 1], xf - 1, yf, zf - 1), u),
          lerp(dot3(p[AB + 1], xf, yf - 1, zf - 1), dot3(p[BB + 1], xf - 1, yf - 1, zf - 1), u),
          v
        ),
        w
      );
    }
  };
}

// src/lib/blackbody.js
var LUT_SIZE = 1024;
var T_MAX = 1.5;
var kelvin = (t) => 500 + 1100 * t;
var lobe = (t, e, o, a) => {
  const l = (t - e) / (t < e ? o : a);
  return Math.exp(-0.5 * l * l);
};
var blackbody = (t) => {
  let e = 0, o = 0, a = 0;
  for (let l2 = 380; l2 <= 780; l2 += 4) {
    const r2 = 1e-9 * l2;
    const n2 = 1 / (Math.pow(1e6 * r2, 5) * (Math.exp(0.014388 / (r2 * t)) - 1));
    e += n2 * (1.056 * lobe(l2, 599.8, 37.9, 31) + 0.362 * lobe(l2, 442, 16, 26.7) - 0.065 * lobe(l2, 501.1, 20.4, 26.2));
    o += n2 * (0.821 * lobe(l2, 568.8, 46.9, 40.5) + 0.286 * lobe(l2, 530.9, 16.3, 31.1));
    a += n2 * (1.217 * lobe(l2, 437, 11.8, 36) + 0.681 * lobe(l2, 459, 26, 13.8));
  }
  const l = Math.max(0, 3.2406 * e - 1.5372 * o - 0.4986 * a);
  const r = Math.max(0, -0.9689 * e + 1.8758 * o + 0.0415 * a);
  const n = Math.max(0, 0.0557 * e - 0.204 * o + 1.057 * a);
  const i = Math.max(1e-30, 0.2126 * l + 0.7152 * r + 0.0722 * n);
  return { r: l / i, g: r / i, b: n / i, Y: o };
};
var sharedLUTs = null;
function getSharedLUTs() {
  if (sharedLUTs) return sharedLUTs;
  const r = 128;
  const detailNoise = new Float32Array(r * r);
  const lutR = new Float32Array(LUT_SIZE);
  const lutG = new Float32Array(LUT_SIZE);
  const lutB = new Float32Array(LUT_SIZE);
  const sparkPalette = [];
  const refY = blackbody(1600).Y;
  for (let t = 0; t < LUT_SIZE; t += 1) {
    const e = blackbody(kelvin(t / (LUT_SIZE - 1) * T_MAX));
    const o = Math.pow(e.Y / refY, 0.42);
    lutR[t] = e.r * o;
    lutG[t] = e.g * o;
    lutB[t] = e.b * o;
  }
  const toneSize = 2048;
  const toneMax = 8;
  const toneLUT = new Uint8ClampedArray(toneSize);
  for (let t = 0; t < toneSize; t += 1) {
    const e = t / (toneSize - 1) * toneMax;
    toneLUT[t] = 255 * Math.pow(1 - Math.exp(-e), 0.625);
  }
  {
    let t = 4242;
    const e = () => (t = 16807 * t % 2147483647, t / 2147483647);
    const o = (v) => v * v * (3 - 2 * v);
    for (const [freq, amp] of [
      [8, 0.5],
      [16, 0.3],
      [32, 0.2]
    ]) {
      const l = Array.from({ length: freq * freq }, e);
      const i = r / freq;
      for (let y = 0; y < r; y += 1) {
        for (let x = 0; x < r; x += 1) {
          const c = x / i;
          const h = y / i;
          const f = 0 | c;
          const d = 0 | h;
          const p = o(c - f);
          const b = o(h - d);
          const yn = (f + 1) % freq;
          const gn = (d + 1) % freq;
          const m = l[d * freq + f] + (l[d * freq + yn] - l[d * freq + f]) * p;
          const M = l[gn * freq + f] + (l[gn * freq + yn] - l[gn * freq + f]) * p;
          detailNoise[y * r + x] += (m + (M - m) * b) * amp;
        }
      }
    }
  }
  for (let t = 0; t < 64; t += 1) {
    const e = blackbody(900 + 22 * t);
    const o = 2.2 * Math.pow(e.Y / refY, 0.3);
    const a = (v) => Math.round(255 * (1 - Math.exp(-v * o)));
    sparkPalette.push(`rgb(${a(e.r)}, ${a(e.g)}, ${a(e.b)})`);
  }
  sharedLUTs = {
    detailSize: r,
    detailNoise,
    lutR,
    lutG,
    lutB,
    toneSize,
    toneMax,
    toneLUT,
    sparkPalette,
    refY
  };
  return sharedLUTs;
}

// src/lib/FireText.js
var IGNITION = 0.28;
var BURN = 6.5;
var HEAT = 2.4;
var SOOT = 0.9;
var BUOYANCY = 210;
var VORTICITY = 14;
var ITERATIONS = 35;
var COOLING = 1.5;
var TURBULENCE = 150;
var DETAIL = 0.9;
var DETAIL_SCALE = 3;
var OVERLAY_BLEND_MODES = [
  "source-over",
  "multiply",
  "screen",
  "overlay",
  "hard-light",
  "soft-light",
  "color-dodge",
  "color-burn",
  "darken",
  "lighten",
  "difference",
  "exclusion",
  "luminosity",
  "lighter"
];
var DEFAULT_OPTIONS = {
  text: "FIRE",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontSize: 96,
  fontWeight: "900",
  fontStyle: "normal",
  letterSpacing: "0px",
  fuel: 1.15,
  // Flame fuel intensity (0.3 - 2.2)
  wind: 0,
  // Horizontal wind (-1.0 to 1.0)
  autoWind: true,
  // Subtle natural wind breeze
  smoke: true,
  // Render soot/smoke plume
  sparks: true,
  // Render flying ember sparks
  bloom: true,
  // Render soft thermal glow
  showTextBody: true,
  // Render charred/glowing ember text body inside the fire
  overlayText: false,
  // Render crisp text overlay ON TOP of the fire effect
  overlayBlendMode: "source-over",
  // Canvas globalCompositeOperation for the overlay text
  overlayColor: "ember",
  // "ember", "molten", or any CSS color (e.g. "#180b04", "#ffffff")
  overlayOpacity: 0.82,
  // Opacity (0.0 - 1.0) of the foreground text overlay
  overlayStrokeColor: "rgba(255, 165, 70, 0.75)",
  // Optional stroke color on overlay text
  overlayStrokeWidth: 1.5,
  // Stroke width in CSS px (0 to disable)
  interactive: true,
  // Allow pointer/mouse drag to blow the flames
  paused: false,
  // Freeze / pause animation and simulation
  flameHeight: 1,
  // Multiplier for flame reach and upward buoyancy force (0.2 - 2.5)
  buoyancy: 1,
  // Alias/multiplier for upward buoyancy push
  background: "#07090f",
  // CSS color or "transparent"
  simScale: 3,
  // Simulation cell size in CSS pixels (lower = higher res, higher = faster)
  flameHeadroom: 1.35,
  // Extra vertical space above text (multiplier of fontSize)
  paddingX: 0.55,
  // Horizontal padding on each side (multiplier of fontSize)
  paddingBottom: 0.35,
  // Bottom padding below baseline (multiplier of fontSize)
  width: null,
  // Optional explicit canvas CSS width
  height: null
  // Optional explicit canvas CSS height
};
var FireText = class {
  /**
   * @param {HTMLCanvasElement | HTMLElement | string} target - Canvas element, container element, or CSS selector
   * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
   */
  constructor(target, options = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.luts = getSharedLUTs();
    this.noise = createNoise(77);
    this._seed = 20261;
    this._rand = () => {
      this._seed = 16807 * this._seed % 2147483647;
      return this._seed / 2147483647;
    };
    const el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) {
      throw new Error("FireText: target element not found.");
    }
    if (el instanceof HTMLCanvasElement) {
      this.canvas = el;
      this.ownsCanvas = false;
    } else {
      this.canvas = document.createElement("canvas");
      this.canvas.style.display = "block";
      el.appendChild(this.canvas);
      this.ownsCanvas = true;
    }
    this.ctx = this.canvas.getContext("2d");
    this.P = 0;
    this.$ = 0;
    this.O = 1;
    this.sparksList = [];
    this.emitterPoints = [];
    this.windSmooth = 0;
    this.gust = 0;
    this.avgBrightness = 0.6;
    this.peakKelvin = 1500;
    this.accumTime = 0;
    this.warmupSteps = 20;
    this.simCostMs = 0;
    this.time = 0;
    this.lastFrameTs = 0;
    this.rafId = null;
    this.isDestroyed = false;
    this.isPaused = Boolean(this.opts.paused);
    this.pointerState = null;
    this._bindEvents();
    this.resize();
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!this.isDestroyed) this.resize();
      });
    }
    this.start();
  }
  _getFontString(scale = 1) {
    const { fontStyle, fontWeight, fontSize, fontFamily } = this.opts;
    const px = Math.max(8, Math.round(Number(fontSize) * scale));
    return `${fontStyle || "normal"} ${fontWeight || "800"} ${px}px ${fontFamily}`;
  }
  /**
   * Update options dynamically (text, fontFamily, fontSize, fuel, wind, flameHeight, overlay*, etc.)
   * @param {Partial<typeof DEFAULT_OPTIONS>} newOptions
   */
  setOptions(newOptions = {}) {
    const prev = this.opts;
    this.opts = { ...prev, ...newOptions };
    if (newOptions.paused !== void 0) {
      const shouldPause = Boolean(newOptions.paused);
      if (shouldPause !== this.isPaused) {
        if (shouldPause) {
          this.pause();
        } else {
          this.resume();
        }
      }
    }
    const layoutKeys = [
      "text",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "letterSpacing",
      "simScale",
      "flameHeadroom",
      "flameHeight",
      "buoyancy",
      "paddingX",
      "paddingBottom",
      "width",
      "height"
    ];
    const overlayStyleKeys = [
      "overlayColor",
      "overlayStrokeColor",
      "overlayStrokeWidth"
    ];
    if (layoutKeys.some((k) => prev[k] !== this.opts[k])) {
      this.resize();
    } else if (overlayStyleKeys.some((k) => prev[k] !== this.opts[k])) {
      this._renderOverlayCanvas();
    }
    return this;
  }
  setText(text) {
    return this.setOptions({ text });
  }
  setFont(fontFamily, fontSize, fontWeight) {
    const patch = {};
    if (fontFamily !== void 0) patch.fontFamily = fontFamily;
    if (fontSize !== void 0) patch.fontSize = fontSize;
    if (fontWeight !== void 0) patch.fontWeight = fontWeight;
    return this.setOptions(patch);
  }
  resize() {
    const lines = String(this.opts.text ?? " ").replace(/\r\n/g, "\n").split("\n");
    const fontSize = Math.max(12, Number(this.opts.fontSize) || 72);
    const lineHeight = fontSize * 1.18;
    const measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = this._getFontString(1);
    if ("letterSpacing" in measureCtx && this.opts.letterSpacing) {
      measureCtx.letterSpacing = String(this.opts.letterSpacing);
    }
    let maxLineWidth = 0;
    for (const line of lines) {
      const m = measureCtx.measureText(line || " ");
      const w = Math.max(
        m.width,
        (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0)
      ) || fontSize * 0.5;
      if (w > maxLineWidth) maxLineWidth = w;
    }
    const totalTextHeight = fontSize + (lines.length - 1) * lineHeight;
    const padX = Math.round(fontSize * this.opts.paddingX);
    const flameReach = clamp(
      Number(this.opts.flameHeight ?? this.opts.buoyancy ?? 1),
      0.15,
      3
    );
    const minHeadroom = Math.round(
      fontSize * this.opts.flameHeadroom * Math.max(0.5, flameReach)
    );
    const padBottom = Math.round(fontSize * this.opts.paddingBottom);
    const cssWidth = Math.max(
      120,
      Math.round(this.opts.width || maxLineWidth + padX * 2)
    );
    const cssHeight = Math.max(
      90,
      Math.round(this.opts.height || totalTextHeight + minHeadroom + padBottom)
    );
    const headroom = this.opts.height ? Math.max(minHeadroom, cssHeight - totalTextHeight - padBottom) : minHeadroom;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    const dpr = Math.min(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      2
    );
    this.dpr = dpr;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    const simCellCss = clamp(
      Number(this.opts.simScale) || Math.max(2.2, fontSize / 32),
      1.8,
      6
    );
    const maxCells = 28e3;
    let P = Math.max(48, Math.round(cssWidth / simCellCss));
    let $ = Math.max(40, Math.round(cssHeight / simCellCss));
    if (P * $ > maxCells) {
      const ratio = Math.sqrt(maxCells / (P * $));
      P = Math.max(48, Math.round(P * ratio));
      $ = Math.max(40, Math.round($ * ratio));
    }
    this.P = P;
    this.$ = $;
    this.O = this.canvas.width / P;
    this.textLayout = {
      lines,
      fontSize,
      lineHeight,
      headroom,
      padBottom,
      totalTextHeight
    };
    this._initSimulationArrays();
    this._rasterizeTextMask();
    this._renderOverlayCanvas();
    this.sparksList.length = 0;
    for (let i = 0; i < 6; i += 1) {
      this._stepSimulation(1 / 60, i / 60);
      this._stepSparks(1 / 60);
    }
    this.warmupSteps = 18;
  }
  _initSimulationArrays() {
    const P = this.P;
    const $ = this.$;
    const total = P * $;
    this.y = new Float32Array(total);
    this.g = new Float32Array(total);
    this.m = new Float32Array(total);
    this.M = new Float32Array(total);
    this.x = new Float32Array(total);
    this.u = new Float32Array(total);
    this.w = new Float32Array(total);
    this.S = new Float32Array(total);
    this.C = new Float32Array(total);
    this.T = new Float32Array(total);
    this.v = new Float32Array(total);
    this.A = new Float32Array(total);
    this.I = new Float32Array(total);
    this.E = new Float32Array(total);
    this.L = new Float32Array(total);
    this.R = new Float32Array(total);
    for (let row = 0; row < $; row += 1) {
      for (let col = 0; col < P; col += 1) {
        const o = Math.min(col, P - 1 - col) / (0.12 * P);
        const a = row / (0.22 * $);
        this.R[row * P + col] = Math.min(1, o * o) * Math.min(1, a);
      }
    }
    this.G = new Float32Array(total);
    this.U = new Float32Array(total);
    this.D = new Float32Array(total);
    this.Y = new Float32Array(total);
    this.B = new Float32Array(total);
    this._resetDetailCoords(this.G, this.U, 0);
    this._resetDetailCoords(this.D, this.Y, 57);
    this.N = 0.7;
    this.W = 0.5 * this.N;
    this.X = 4;
    this.lt = Math.ceil(P / this.X) + 2;
    this.rt = Math.ceil($ / this.X) + 2;
    this.Z = new Float32Array(this.lt * this.rt);
    this.q = new Float32Array(this.lt * this.rt);
    this.K = new Float32Array($);
    for (let row = 0; row < $; row += 1) {
      this.K[row] = Math.min(1, Math.max(0.15, ($ - 1 - row) / (0.18 * $)));
    }
    this.k = new Float32Array(2 * P);
    for (let col = 0; col < 2 * P; col += 1) {
      const e = Math.min(col, 2 * P - 1 - col) / (2 * P * 0.08);
      this.k[col] = e >= 1 ? 1 : e * e * (3 - 2 * e);
    }
    this.H = document.createElement("canvas");
    this.H.width = 2 * P;
    this.H.height = 2 * $;
    this.V = this.H.getContext("2d");
    this.z = this.V.createImageData(2 * P, 2 * $);
    this.j = document.createElement("canvas");
    this.j.width = P;
    this.j.height = $;
    this.J = this.j.getContext("2d");
    this.Q = this.J.createImageData(P, $);
    this.tt = document.createElement("canvas");
    this.tt.width = Math.max(4, P >> 2) + 4;
    this.tt.height = Math.max(4, $ >> 2) + 4;
    this.et = this.tt.getContext("2d");
  }
  _resetDetailCoords(tx, ty, offset) {
    const P = this.P;
    const $ = this.$;
    for (let row = 0; row < $; row += 1) {
      for (let col = 0; col < P; col += 1) {
        tx[row * P + col] = col + offset;
        ty[row * P + col] = row + 0.37 * offset;
      }
    }
  }
  _drawTextLines(ctx, scale) {
    const { lines, fontSize, lineHeight, headroom } = this.textLayout;
    const cw = this.canvas.width;
    ctx.font = this._getFontString(scale);
    if ("letterSpacing" in ctx && this.opts.letterSpacing) {
      ctx.letterSpacing = String(this.opts.letterSpacing);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const startY = (headroom + fontSize * 0.5) * scale;
    for (let i = 0; i < lines.length; i += 1) {
      ctx.fillText(lines[i], cw / 2, startY + i * lineHeight * scale);
    }
  }
  _strokeTextLines(ctx, scale) {
    const { lines, fontSize, lineHeight, headroom } = this.textLayout;
    const cw = this.canvas.width;
    ctx.font = this._getFontString(scale);
    if ("letterSpacing" in ctx && this.opts.letterSpacing) {
      ctx.letterSpacing = String(this.opts.letterSpacing);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const startY = (headroom + fontSize * 0.5) * scale;
    for (let i = 0; i < lines.length; i += 1) {
      ctx.strokeText(lines[i], cw / 2, startY + i * lineHeight * scale);
    }
  }
  /**
   * Renders the foreground text overlay canvas (`this.textOverlayCanvas`)
   * so that the text can be composited on top of the fire effect with any blend mode.
   */
  _renderOverlayCanvas() {
    if (!this.textLayout) return;
    const { dpr } = this;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const { headroom, totalTextHeight } = this.textLayout;
    if (!this.textOverlayCanvas) {
      this.textOverlayCanvas = document.createElement("canvas");
    }
    this.textOverlayCanvas.width = cw;
    this.textOverlayCanvas.height = ch;
    const octx = this.textOverlayCanvas.getContext("2d");
    octx.clearRect(0, 0, cw, ch);
    const topY = headroom * dpr;
    const botY = (headroom + totalTextHeight) * dpr;
    const colorOpt = String(this.opts.overlayColor || "ember").trim();
    if (colorOpt === "ember") {
      const grad = octx.createLinearGradient(0, topY, 0, botY);
      grad.addColorStop(0, "#3a1b08");
      grad.addColorStop(0.5, "#1d0c04");
      grad.addColorStop(1, "#0b0502");
      octx.fillStyle = grad;
    } else if (colorOpt === "molten") {
      const grad = octx.createLinearGradient(0, topY, 0, botY);
      grad.addColorStop(0, "#fff3c4");
      grad.addColorStop(0.45, "#ff8b24");
      grad.addColorStop(1, "#a81c07");
      octx.fillStyle = grad;
    } else {
      octx.fillStyle = colorOpt;
    }
    this._drawTextLines(octx, dpr);
    const strokeW = Number(this.opts.overlayStrokeWidth) || 0;
    const strokeCol = this.opts.overlayStrokeColor;
    if (strokeW > 0 && strokeCol && strokeCol !== "none") {
      octx.save();
      octx.lineJoin = "round";
      octx.lineWidth = strokeW * dpr;
      octx.strokeStyle = strokeCol;
      this._strokeTextLines(octx, dpr);
      octx.restore();
    }
  }
  _rasterizeTextMask() {
    const { P, $, dpr } = this;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const { lines, fontSize, lineHeight, headroom, totalTextHeight } = this.textLayout;
    this.textBodyCanvas = document.createElement("canvas");
    this.textBodyCanvas.width = cw;
    this.textBodyCanvas.height = ch;
    const bctx = this.textBodyCanvas.getContext("2d");
    this.textEmberCanvas = document.createElement("canvas");
    this.textEmberCanvas.width = cw;
    this.textEmberCanvas.height = ch;
    const ectx = this.textEmberCanvas.getContext("2d");
    bctx.fillStyle = "#fff";
    this._drawTextLines(bctx, dpr);
    bctx.globalCompositeOperation = "source-in";
    const topY = headroom * dpr;
    const botY = (headroom + totalTextHeight) * dpr;
    const bodyGrad = bctx.createLinearGradient(0, topY, 0, botY);
    bodyGrad.addColorStop(0, "#3d2210");
    bodyGrad.addColorStop(0.5, "#1f1108");
    bodyGrad.addColorStop(1, "#0d0704");
    bctx.fillStyle = bodyGrad;
    bctx.fillRect(0, 0, cw, ch);
    ectx.save();
    ectx.shadowColor = "rgba(255, 110, 20, 0.95)";
    ectx.shadowBlur = Math.max(4, fontSize * 0.08 * dpr);
    ectx.fillStyle = "#ff6a14";
    this._drawTextLines(ectx, dpr);
    ectx.restore();
    ectx.globalCompositeOperation = "source-in";
    const emberGrad = ectx.createLinearGradient(0, topY, 0, botY);
    emberGrad.addColorStop(0, "rgba(255, 190, 75, 0.95)");
    emberGrad.addColorStop(0.45, "rgba(255, 105, 25, 0.75)");
    emberGrad.addColorStop(1, "rgba(220, 50, 10, 0.55)");
    ectx.fillStyle = emberGrad;
    ectx.fillRect(0, 0, cw, ch);
    ectx.lineCap = "round";
    const crackCount = Math.round(cw * ch / (180 * dpr));
    for (let i = 0; i < crackCount; i += 1) {
      let cx = this._rand() * cw;
      let cy = topY + this._rand() * Math.max(10, botY - topY);
      ectx.strokeStyle = `rgba(255, ${120 + (110 * this._rand() | 0)}, 35, ${0.35 + 0.5 * this._rand()})`;
      ectx.lineWidth = (0.7 + 1.4 * this._rand()) * dpr;
      ectx.beginPath();
      ectx.moveTo(cx, cy);
      for (let s = 0; s < 3; s += 1) {
        cx += (this._rand() - 0.5) * 14 * dpr;
        cy += (this._rand() - 0.5) * 10 * dpr;
        ectx.lineTo(cx, cy);
      }
      ectx.stroke();
    }
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = P;
    maskCanvas.height = $;
    const mctx = maskCanvas.getContext("2d");
    mctx.fillStyle = "#fff";
    mctx.font = this._getFontString(P / this.cssWidth);
    if ("letterSpacing" in mctx && this.opts.letterSpacing) {
      mctx.letterSpacing = String(this.opts.letterSpacing);
    }
    mctx.textAlign = "center";
    mctx.textBaseline = "middle";
    const simScale = P / this.cssWidth;
    const simStartY = (headroom + fontSize * 0.5) * simScale;
    for (let i = 0; i < lines.length; i += 1) {
      mctx.fillText(lines[i], P / 2, simStartY + i * lineHeight * simScale);
    }
    const maskData = mctx.getImageData(0, 0, P, $).data;
    this.emitterPoints = [];
    for (let y = 1; y < $ - 1; y += 1) {
      for (let x = 1; x < P - 1; x += 1) {
        const idx = (y * P + x) * 4;
        const alpha = maskData[idx + 3] / 255;
        if (alpha < 0.15) continue;
        const upAlpha = maskData[((y - 1) * P + x) * 4 + 3] / 255;
        const downAlpha = maskData[((y + 1) * P + x) * 4 + 3] / 255;
        const leftAlpha = maskData[(y * P + (x - 1)) * 4 + 3] / 255;
        const rightAlpha = maskData[(y * P + (x + 1)) * 4 + 3] / 255;
        const isTopEdge = upAlpha < 0.45;
        const isSideEdge = leftAlpha < 0.45 || rightAlpha < 0.45 || downAlpha < 0.45;
        const edgeWeight = isTopEdge ? 1.35 : isSideEdge ? 1 : 0.52;
        this.emitterPoints.push({
          x: x + 0.5,
          y: y + 0.5,
          weight: alpha * edgeWeight,
          isEdge: isTopEdge || isSideEdge,
          phase: 10 * this._rand()
        });
      }
    }
  }
  _splatFuel(field, x, y, amount) {
    const P = this.P;
    const $ = this.$;
    const l = x - 0.5;
    const r = y - 0.5;
    const n = Math.floor(l);
    const i = Math.floor(r);
    if (n < 0 || i < 0 || n >= P - 1 || i >= $ - 1) return;
    const s = l - n;
    const c = r - i;
    const h = i * P + n;
    field[h] += amount * (1 - s) * (1 - c);
    field[h + 1] += amount * s * (1 - c);
    field[h + P] += amount * (1 - s) * c;
    field[h + P + 1] += amount * s * c;
  }
  _splatTempMax(x, y, tempVal) {
    const P = this.P;
    const $ = this.$;
    const a = Math.floor(x);
    const l = Math.floor(y);
    if (a < 0 || l < 0 || a >= P || l >= $) return;
    const r = l * P + a;
    if (this.m[r] < tempVal) this.m[r] = tempVal;
  }
  _sampleBilinear(field, x, y) {
    const P = this.P;
    const $ = this.$;
    const a = clamp(x - 0.5, 0, P - 1.001);
    const l = clamp(y - 0.5, 0, $ - 1.001);
    const r = 0 | a;
    const n = 0 | l;
    const i = a - r;
    const s = l - n;
    const c = n * P + r;
    const h = field[c] + (field[c + 1] - field[c]) * i;
    return h + (field[c + P] + (field[c + P + 1] - field[c + P]) * i - h) * s;
  }
  _spawnSpark(x, y, boost = 1) {
    if (!this.opts.sparks || this.sparksList.length > 420) return;
    const a = this._rand;
    const flameReach = clamp(
      Number(this.opts.flameHeight ?? this.opts.buoyancy ?? 1),
      0.15,
      3
    );
    const sparkVyScale = Math.sqrt(flameReach);
    this.sparksList.push({
      x,
      y,
      px: x,
      py: y,
      vx: 30 * (a() - 0.5) * boost,
      vy: -(30 + 60 * a()) * boost * sparkVyScale,
      heat: 0.75 + 0.25 * a(),
      life: 1 + 2 * a(),
      age: 0,
      flutter: 10 * a()
    });
  }
  _injectTextFuel(dt, time) {
    const fuelSetting = clamp(Number(this.opts.fuel) || 1.15, 0.2, 2.5);
    const o = fuelSetting * (1 + 0.8 * this.gust);
    const pts = this.emitterPoints;
    const len = pts.length;
    if (len === 0) return;
    const densityNorm = clamp(
      420 / Math.max(120, Math.sqrt(len) * 8),
      0.35,
      1.35
    );
    for (let i = 0; i < len; i += 1) {
      const pt = pts[i];
      const nVal = 0.42 + 0.58 * Math.max(
        0,
        1.4 * this.noise.noise3(
          0.18 * pt.x,
          0.18 * pt.y,
          1.85 * time + pt.phase
        ) + 0.5
      );
      const u = pt.weight * nVal * o * dt * densityNorm;
      if (u > 0) {
        this._splatFuel(this.M, pt.x, pt.y - 0.4, 5.2 * u);
        this._splatTempMax(
          pt.x,
          pt.y,
          0.64 * Math.min(1.25, fuelSetting) * nVal
        );
        if (pt.isEdge && this._rand() < 0.045 * u * (1 + 3 * this.gust)) {
          this._spawnSpark(pt.x, pt.y - 0.8, 1 + this.gust);
        }
      }
    }
  }
  _stepSimulation(dt, time) {
    const P = this.P;
    const $ = this.$;
    const o = P * $;
    const { y, g, m, M, x, Z, q, K, L } = this;
    this._injectTextFuel(dt, time);
    const windForce = 28 * this.windSmooth + 4 * this.noise.noise2(0.4 * time, 9.7);
    const damp = Math.exp(-2 * dt);
    const gust = this.gust;
    const flameReach = clamp(
      Number(this.opts.flameHeight ?? this.opts.buoyancy ?? 1),
      0.15,
      3
    );
    const coolingRate = COOLING * Math.max(0.35, 1.35 - 0.35 * flameReach);
    for (let e = 0; e < o; e += 1) {
      let temp = m[e];
      let fuel = M[e];
      if (fuel > 1e-4 && temp > IGNITION) {
        let burned = BURN * fuel * dt * (1 + 0.6 * gust);
        if (burned > fuel) burned = fuel;
        fuel -= burned;
        temp += burned * HEAT;
        x[e] += burned * SOOT;
      }
      temp -= dt * (coolingRate * temp + 1.2 * temp * temp * temp * temp);
      m[e] = temp < 0 ? 0 : temp > T_MAX ? T_MAX : temp;
      M[e] = fuel * (1 - 0.5 * dt);
      const soot = x[e] * (1 - 0.05 * dt);
      x[e] = soot > 3 ? 3 : soot;
      g[e] -= dt * BUOYANCY * flameReach * m[e];
      if (m[e] < 0.25) {
        g[e] *= damp * (1 - 4 * m[e]) + 4 * m[e];
      }
    }
    const windBlend = 1 - Math.exp(-2.5 * dt);
    for (let row = 0; row < $; row += 1) {
      const rowOffset = row * P;
      let avgVx = 0;
      for (let col = 0; col < P; col += 1) avgVx += y[rowOffset + col];
      avgVx /= P;
      const deltaVx = (windForce * (1 - row / $ + 0.3) - avgVx) * windBlend;
      for (let col = 0; col < P; col += 1) y[rowOffset + col] += deltaVx;
    }
    const c = this.lt;
    const h = this.rt;
    const X = this.X;
    for (let row = 0; row < h; row += 1) {
      for (let col = 0; col < c; col += 1) {
        Z[row * c + col] = this.noise.noise3(
          1.3 * col,
          1.3 * row + 3.5 * time,
          1.4 * time
        );
        q[row * c + col] = this.noise.noise3(
          1.3 * col + 31.7,
          1.3 * row + 3.5 * time,
          1.4 * time
        );
      }
    }
    for (let row = 0; row < $; row += 1) {
      const oy = row / X;
      const ay = Math.min(h - 2, 0 | oy);
      const ly = oy - ay;
      for (let col = 0; col < P; col += 1) {
        const idx = row * P + col;
        const temp = m[idx];
        if (temp < 0.05) continue;
        const ox = col / X;
        const sx = Math.min(c - 2, 0 | ox);
        const hx = ox - sx;
        const f = ay * c + sx;
        const d = (Z[f] * (1 - hx) + Z[f + 1] * hx) * (1 - ly) + (Z[f + c] * (1 - hx) + Z[f + c + 1] * hx) * ly;
        const p = (q[f] * (1 - hx) + q[f + 1] * hx) * (1 - ly) + (q[f + c] * (1 - hx) + q[f + c + 1] * hx) * ly;
        const b = TURBULENCE * dt * Math.min(1, 1.5 * temp) * K[row];
        y[idx] += d * b;
        g[idx] += p * b * 0.6;
      }
    }
    for (let row = 1; row < $ - 1; row += 1) {
      for (let col = 1; col < P - 1; col += 1) {
        const idx = row * P + col;
        L[idx] = 0.5 * (g[idx + 1] - g[idx - 1] - (y[idx + P] - y[idx - P]));
      }
    }
    for (let row = 2; row < $ - 2; row += 1) {
      for (let col = 2; col < P - 2; col += 1) {
        const idx = row * P + col;
        const l = 0.5 * (Math.abs(L[idx + 1]) - Math.abs(L[idx - 1]));
        const r = 0.5 * (Math.abs(L[idx + P]) - Math.abs(L[idx - P]));
        const n = Math.sqrt(l * l + r * r) + 1e-5;
        const i = L[idx] * VORTICITY * dt * (0.4 + Math.min(1, 2 * m[idx]));
        y[idx] += r / n * i;
        g[idx] -= l / n * i;
      }
    }
    this._projectPressure();
    const maxCol = P - 1.001;
    const maxRow = $ - 1.001;
    const { v, A } = this;
    for (let row = 0; row < $; row += 1) {
      for (let col = 0; col < P; col += 1) {
        const idx = row * P + col;
        const bx = col - dt * y[idx];
        const by = row - dt * g[idx];
        v[idx] = bx < 0 ? 0 : bx > maxCol ? maxCol : bx;
        A[idx] = by < 0 ? 0 : by > maxRow ? maxRow : by;
      }
    }
    this._advectField(this.y, this.u);
    this._advectField(this.g, this.w);
    this._advectField(this.m, this.S);
    this._advectField(this.M, this.C);
    this._advectField(this.x, this.T);
    for (const coordField of [this.G, this.U, this.D, this.Y]) {
      this._advectField(coordField, this.B);
      coordField.set(this.B);
    }
    const prevW = this.W;
    this.W += dt;
    if (this.W >= this.N) {
      this.W -= this.N;
      this._resetDetailCoords(
        this.G,
        this.U,
        this._rand() * this.luts.detailSize
      );
    }
    if (prevW < 0.5 * this.N && this.W >= 0.5 * this.N) {
      this._resetDetailCoords(
        this.D,
        this.Y,
        this._rand() * this.luts.detailSize
      );
    }
    [this.y, this.u] = [this.u, this.y];
    [this.g, this.w] = [this.w, this.g];
    [this.m, this.S] = [this.S, this.m];
    [this.M, this.C] = [this.C, this.M];
    [this.x, this.T] = [this.T, this.x];
    for (let col = 0; col < P; col += 1) {
      const idx = ($ - 1) * P + col;
      if (this.g[idx] > 0) this.g[idx] = 0;
    }
    this._projectPressure();
  }
  _advectField(src, dst) {
    const P = this.P;
    const total = P * this.$;
    const { v, A } = this;
    for (let idx = 0; idx < total; idx += 1) {
      const ox = v[idx];
      const oy = A[idx];
      const rx = 0 | ox;
      const ry = 0 | oy;
      const ix = ox - rx;
      const sy = oy - ry;
      const c = ry * P + rx;
      const h = src[c] + (src[c + 1] - src[c]) * ix;
      const f = src[c + P] + (src[c + P + 1] - src[c + P]) * ix;
      dst[idx] = h + (f - h) * sy;
    }
  }
  _projectPressure() {
    const P = this.P;
    const $ = this.$;
    const { y, g, I, E } = this;
    for (let row = 0; row < $; row += 1) {
      for (let col = 0; col < P; col += 1) {
        const idx = row * P + col;
        const a = col < P - 1 ? y[idx + 1] : y[idx];
        const l = col > 0 ? y[idx - 1] : y[idx];
        const r = row < $ - 1 ? g[idx + P] : -g[idx];
        const n = row > 0 ? g[idx - P] : g[idx];
        E[idx] = -0.5 * (a - l + r - n);
      }
    }
    const omega = 1.82;
    const iters = this.simCostMs > 14 ? ITERATIONS - 12 : ITERATIONS;
    for (let step = 0; step < 2 * iters; step += 1) {
      const parity = 1 & step;
      for (let row = 0; row < $; row += 1) {
        const isBottom = row === $ - 1;
        for (let col = row + parity & 1; col < P; col += 2) {
          const idx = row * P + col;
          const neighbors = (col > 0 ? I[idx - 1] : 0) + (col < P - 1 ? I[idx + 1] : 0) + (row > 0 ? I[idx - P] : 0) + (isBottom ? 0 : I[idx + P]);
          const target = (E[idx] + neighbors) / (isBottom ? 3 : 4);
          I[idx] += omega * (target - I[idx]);
        }
      }
    }
    for (let row = 0; row < $; row += 1) {
      for (let col = 0; col < P; col += 1) {
        const idx = row * P + col;
        const a = col < P - 1 ? I[idx + 1] : 0;
        const l = col > 0 ? I[idx - 1] : 0;
        const r = row < $ - 1 ? I[idx + P] : I[idx];
        const n = row > 0 ? I[idx - P] : 0;
        y[idx] -= 0.5 * (a - l);
        g[idx] -= 0.5 * (r - n);
      }
    }
  }
  _renderFlameBuffer() {
    const P = this.P;
    const $ = this.$;
    const { m, G, U, D, Y, k, z, V } = this;
    const {
      detailSize: r,
      detailNoise: n,
      lutR: i,
      lutG: s,
      lutB: c,
      toneSize: d,
      toneMax: p,
      toneLUT: b
    } = this.luts;
    const data = z.data;
    const w2 = 2 * P;
    const h2 = 2 * $;
    const lutScale = (LUT_SIZE - 1) / T_MAX;
    const toneScale = (d - 1) / p;
    const exposure = 3.1;
    const blend = 1 - Math.abs(1 - this.W / this.N * 2);
    let lumSum = 0;
    let maxTemp = 0;
    for (let py = 0; py < h2; py += 1) {
      const oy = clamp(0.5 * (py + 0.5) - 0.5, 0, $ - 1.001);
      const My = 0 | oy;
      const xy = oy - My;
      for (let px = 0; px < w2; px += 1) {
        const ux = clamp(0.5 * (px + 0.5) - 0.5, 0, P - 1.001);
        const wx = 0 | ux;
        const Sx = ux - wx;
        const C = My * P + wx;
        const T = m[C] + (m[C + 1] - m[C]) * Sx;
        let v = (T + (m[C + P] + (m[C + P + 1] - m[C + P]) * Sx - T) * xy) * k[px];
        const A = 4 * (py * w2 + px);
        if (v > 0.15) {
          const tx0 = G[C] + (G[C + 1] - G[C]) * Sx + (G[C + P] - G[C] + (G[C + P + 1] - G[C + P] - (G[C + 1] - G[C])) * Sx) * xy;
          const ty0 = U[C] + (U[C + 1] - U[C]) * Sx + (U[C + P] - U[C] + (U[C + P + 1] - U[C + P] - (U[C + 1] - U[C])) * Sx) * xy;
          const tx1 = D[C] + (D[C + 1] - D[C]) * Sx + (D[C + P] - D[C] + (D[C + P + 1] - D[C + P] - (D[C + 1] - D[C])) * Sx) * xy;
          const ty1 = Y[C] + (Y[C + 1] - Y[C]) * Sx + (Y[C + P] - Y[C] + (Y[C + P + 1] - Y[C + P] - (Y[C + 1] - Y[C])) * Sx) * xy;
          const l0 = n[((ty0 * DETAIL_SCALE | 0) & r - 1) * r + ((tx0 * DETAIL_SCALE | 0) & r - 1)];
          const l1 = n[((ty1 * DETAIL_SCALE | 0) & r - 1) * r + ((tx1 * DETAIL_SCALE | 0) & r - 1)];
          v *= 1 + DETAIL * (l0 * blend + l1 * (1 - blend) - 0.5);
          if (v > T_MAX) v = T_MAX;
        }
        if (v < 0.2) {
          data[A] = 0;
          data[A + 1] = 0;
          data[A + 2] = 0;
          data[A + 3] = 0;
          continue;
        }
        if (v > maxTemp) maxTemp = v;
        const I = v * lutScale | 0;
        const E = i[I] * exposure;
        lumSum += E;
        const L = E * toneScale | 0;
        const R = s[I] * exposure * toneScale | 0;
        const B = c[I] * exposure * toneScale | 0;
        const rOut = b[L < d ? L : d - 1];
        const gOut = b[R < d ? R : d - 1];
        const bOut = b[B < d ? B : d - 1];
        data[A] = rOut;
        data[A + 1] = gOut;
        data[A + 2] = bOut;
        data[A + 3] = Math.min(
          255,
          Math.max(rOut, gOut, bOut, (v - 0.2) * 640 | 0)
        );
      }
    }
    V.putImageData(z, 0, 0);
    const M = clamp(lumSum / (w2 * h2) * 14, 0.15, 1);
    this.avgBrightness += 0.25 * (M - this.avgBrightness);
    this.peakKelvin += 0.05 * (kelvin(maxTemp) - this.peakKelvin);
  }
  _renderSmokeBuffer() {
    if (!this.opts.smoke) return;
    const P = this.P;
    const $ = this.$;
    const total = P * $;
    const { x, m, R, Q, J, avgBrightness } = this;
    const data = Q.data;
    for (let idx = 0; idx < total; idx += 1) {
      const soot = x[idx];
      const a = 4 * idx;
      const l = (1 - Math.exp(-1.5 * soot)) * R[idx];
      const row = idx / P | 0;
      const n = Math.min(
        1,
        1.6 * m[idx] + 0.5 * avgBrightness * (row / $) * (row / $)
      );
      data[a] = 52 + 150 * n;
      data[a + 1] = 50 + 70 * n;
      data[a + 2] = 58 + 20 * n;
      data[a + 3] = 205 * l;
    }
    J.putImageData(Q, 0, 0);
  }
  _stepSparks(dt) {
    const P = this.P;
    const $ = this.$;
    const list = this.sparksList;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const sp = list[i];
      sp.age += dt;
      sp.px = sp.x;
      sp.py = sp.y;
      const vxField = this._sampleBilinear(this.y, sp.x, sp.y);
      const vyField = this._sampleBilinear(this.g, sp.x, sp.y);
      const blend = 1 - Math.exp(-3.2 * dt);
      sp.vx += (vxField - sp.vx) * blend + 40 * Math.sin(9 * sp.age + sp.flutter) * dt;
      sp.vy += (vyField - sp.vy) * blend + 12 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.heat -= dt * (0.22 + 0.5 * sp.age / sp.life);
      if (sp.age > sp.life || sp.heat <= 0 || sp.y < -10 || sp.x < -20 || sp.x > P + 20 || sp.y > $ + 10) {
        list.splice(i, 1);
      }
    }
  }
  _drawFrame(dt, time) {
    const perfStart = performance.now();
    let targetWind = Number(this.opts.wind) || 0;
    if (this.opts.autoWind) {
      targetWind += 0.25 * this.noise.noise2(0.05 * time, 1.3);
    }
    this.windSmooth += (targetWind - this.windSmooth) * (1 - Math.exp(-2 * dt));
    this.gust = Math.max(0, this.gust - 0.8 * dt);
    this.accumTime += dt;
    if (this.warmupSteps > 0) {
      const extra = Math.min(this.warmupSteps, 2);
      this.warmupSteps -= extra;
      this.accumTime += extra / 60;
    }
    let substeps = 0;
    while (this.accumTime > 0 && substeps < 4) {
      this._stepSimulation(1 / 60, time);
      this._stepSparks(1 / 60);
      this.accumTime -= 1 / 60;
      substeps += 1;
    }
    this.accumTime = Math.min(this.accumTime, 0);
    this._renderFlameBuffer();
    this._renderSmokeBuffer();
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const O = this.O;
    ctx.clearRect(0, 0, cw, ch);
    if (this.opts.background && this.opts.background !== "transparent") {
      ctx.fillStyle = this.opts.background;
      ctx.fillRect(0, 0, cw, ch);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const amb = ctx.createRadialGradient(
        cw * 0.5,
        ch * 0.65,
        0,
        cw * 0.5,
        ch * 0.65,
        Math.max(cw, ch) * 0.58
      );
      amb.addColorStop(
        0,
        `rgba(255, 115, 35, ${0.14 * this.avgBrightness})`
      );
      amb.addColorStop(1, "rgba(255, 115, 35, 0)");
      ctx.fillStyle = amb;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
    if (this.opts.smoke) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.j, 0, 0, cw, ch);
      ctx.restore();
    }
    if (this.opts.showTextBody && this.textBodyCanvas) {
      ctx.drawImage(this.textBodyCanvas, 0, 0, cw, ch);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const flicker = 0.72 + 0.28 * this.noise.noise2(1.9 * time, 4.2);
      ctx.globalAlpha = clamp(
        flicker * Math.min(1.2, Number(this.opts.fuel) || 1.15) * 0.85,
        0,
        1
      );
      ctx.drawImage(this.textEmberCanvas, 0, 0, cw, ch);
      ctx.restore();
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(this.H, 0, 0, cw, ch);
    if (this.opts.bloom) {
      const f = this.tt.width;
      const d = this.tt.height;
      this.et.clearRect(0, 0, f, d);
      this.et.drawImage(this.H, 2, 2, f - 4, d - 4);
      const px = 2 / (f - 4) * cw;
      const py = 2 / (d - 4) * ch;
      ctx.globalAlpha = 0.34;
      ctx.drawImage(this.tt, -px, -py, cw + 2 * px, ch + 2 * py);
      ctx.globalAlpha = 0.18;
      ctx.drawImage(
        this.tt,
        -px * 2.5,
        -py * 2.5,
        cw + 5 * px,
        ch + 5 * py
      );
    }
    ctx.restore();
    if (this.opts.overlayText && this.textOverlayCanvas) {
      ctx.save();
      ctx.globalCompositeOperation = this.opts.overlayBlendMode || "source-over";
      ctx.globalAlpha = clamp(Number(this.opts.overlayOpacity ?? 0.82), 0, 1);
      ctx.drawImage(this.textOverlayCanvas, 0, 0, cw, ch);
      ctx.restore();
    }
    if (this.opts.sparks && this.sparksList.length > 0) {
      const palette = this.luts.sparkPalette;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const sp of this.sparksList) {
        const cIdx = clamp(63 * sp.heat | 0, 0, 63);
        ctx.strokeStyle = palette[cIdx];
        ctx.globalAlpha = clamp(1.4 * sp.heat, 0, 1);
        ctx.lineWidth = Math.max(1, 0.34 * O);
        ctx.beginPath();
        ctx.moveTo(sp.px * O, sp.py * O);
        ctx.lineTo(sp.x * O + 0.01, sp.y * O);
        ctx.stroke();
      }
      ctx.restore();
    }
    this.simCostMs += 0.05 * (performance.now() - perfStart - this.simCostMs);
  }
  _bindEvents() {
    this._onPointerDown = (e) => {
      if (!this.opts.interactive) return;
      const pos = this._getCanvasPos(e);
      this.pointerState = { x: pos.x, y: pos.y };
    };
    this._onPointerMove = (e) => {
      if (!this.opts.interactive) return;
      const pos = this._getCanvasPos(e);
      if (!this.pointerState) {
        this.pointerState = { x: pos.x, y: pos.y };
        return;
      }
      const dx = pos.x - this.pointerState.x;
      const dy = pos.y - this.pointerState.y;
      this.pointerState.x = pos.x;
      this.pointerState.y = pos.y;
      const O = this.O;
      const simX = pos.x / O;
      const simY = pos.y / O;
      const vxImpulse = clamp(dx / O * 30, -500, 500);
      const vyImpulse = clamp(dy / O * 30, -500, 500);
      const radius = 8;
      const x0 = Math.max(0, Math.floor(simX - 2 * radius));
      const x1 = Math.min(this.P - 1, Math.ceil(simX + 2 * radius));
      const y0 = Math.max(0, Math.floor(simY - 2 * radius));
      const y1 = Math.min(this.$ - 1, Math.ceil(simY + 2 * radius));
      for (let r = y0; r <= y1; r += 1) {
        for (let c = x0; c <= x1; c += 1) {
          const ox = c - simX;
          const oy = r - simY;
          const w = Math.exp(-(ox * ox + oy * oy) / (radius * radius));
          this.y[r * this.P + c] += vxImpulse * w * 0.14;
          this.g[r * this.P + c] += vyImpulse * w * 0.14;
        }
      }
      if (x1 >= x0 && y1 >= y0) {
        this.gust = Math.min(1.5, this.gust + 35e-4 * Math.hypot(dx, dy));
      }
    };
    this._onPointerLeave = () => {
      this.pointerState = null;
    };
    this.canvas.addEventListener("pointerdown", this._onPointerDown);
    this.canvas.addEventListener("pointermove", this._onPointerMove);
    this.canvas.addEventListener("pointerup", this._onPointerLeave);
    this.canvas.addEventListener("pointerleave", this._onPointerLeave);
  }
  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / Math.max(1, rect.width);
    const scaleY = this.canvas.height / Math.max(1, rect.height);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }
  pause() {
    this.isPaused = true;
    this.opts.paused = true;
    return this;
  }
  resume() {
    this.isPaused = false;
    this.opts.paused = false;
    this.lastFrameTs = performance.now();
    return this;
  }
  togglePause() {
    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
    return this.isPaused;
  }
  start() {
    if (this.rafId !== null || this.isDestroyed) return this;
    this.lastFrameTs = performance.now();
    const loop = (now) => {
      if (this.isDestroyed) return;
      if (!this.isPaused) {
        const dt = clamp((now - this.lastFrameTs) / 1e3, 1e-3, 0.05);
        this.time += dt;
        this._drawFrame(dt, this.time);
      }
      this.lastFrameTs = now;
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
    return this;
  }
  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    return this;
  }
  destroy() {
    this.isDestroyed = true;
    this.stop();
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this._onPointerDown);
      this.canvas.removeEventListener("pointermove", this._onPointerMove);
      this.canvas.removeEventListener("pointerup", this._onPointerLeave);
      this.canvas.removeEventListener("pointerleave", this._onPointerLeave);
      if (this.ownsCanvas && this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
    }
  }
};

// src/lib/FireTextReact.jsx
function createFireTextComponent(ReactInstance = React) {
  const R = ReactInstance;
  if (!R) {
    throw new Error("createFireTextComponent requires a valid React instance.");
  }
  const Component = R.forwardRef(function FireTextReact2({
    text = DEFAULT_OPTIONS.text,
    fontFamily = DEFAULT_OPTIONS.fontFamily,
    fontSize = DEFAULT_OPTIONS.fontSize,
    fontWeight = DEFAULT_OPTIONS.fontWeight,
    fontStyle = DEFAULT_OPTIONS.fontStyle,
    letterSpacing = DEFAULT_OPTIONS.letterSpacing,
    fuel = DEFAULT_OPTIONS.fuel,
    wind = DEFAULT_OPTIONS.wind,
    autoWind = DEFAULT_OPTIONS.autoWind,
    flameHeight = DEFAULT_OPTIONS.flameHeight,
    buoyancy = DEFAULT_OPTIONS.buoyancy,
    paused = DEFAULT_OPTIONS.paused,
    smoke = DEFAULT_OPTIONS.smoke,
    sparks = DEFAULT_OPTIONS.sparks,
    bloom = DEFAULT_OPTIONS.bloom,
    showTextBody = DEFAULT_OPTIONS.showTextBody,
    overlayText = DEFAULT_OPTIONS.overlayText,
    overlayBlendMode = DEFAULT_OPTIONS.overlayBlendMode,
    overlayColor = DEFAULT_OPTIONS.overlayColor,
    overlayOpacity = DEFAULT_OPTIONS.overlayOpacity,
    overlayStrokeColor = DEFAULT_OPTIONS.overlayStrokeColor,
    overlayStrokeWidth = DEFAULT_OPTIONS.overlayStrokeWidth,
    interactive = DEFAULT_OPTIONS.interactive,
    background = DEFAULT_OPTIONS.background,
    simScale = DEFAULT_OPTIONS.simScale,
    flameHeadroom = DEFAULT_OPTIONS.flameHeadroom,
    paddingX = DEFAULT_OPTIONS.paddingX,
    paddingBottom = DEFAULT_OPTIONS.paddingBottom,
    width = DEFAULT_OPTIONS.width,
    height = DEFAULT_OPTIONS.height,
    className,
    style
  }, ref) {
    const canvasRef = R.useRef(null);
    const instanceRef = R.useRef(null);
    R.useImperativeHandle(ref, () => instanceRef.current, []);
    R.useEffect(() => {
      if (!canvasRef.current) return void 0;
      const instance = new FireText(canvasRef.current, {
        text,
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        letterSpacing,
        fuel,
        wind,
        autoWind,
        flameHeight,
        buoyancy,
        paused,
        smoke,
        sparks,
        bloom,
        showTextBody,
        overlayText,
        overlayBlendMode,
        overlayColor,
        overlayOpacity,
        overlayStrokeColor,
        overlayStrokeWidth,
        interactive,
        background,
        simScale,
        flameHeadroom,
        paddingX,
        paddingBottom,
        width,
        height
      });
      instanceRef.current = instance;
      return () => {
        instance.destroy();
        instanceRef.current = null;
      };
    }, []);
    R.useEffect(() => {
      if (!instanceRef.current) return;
      instanceRef.current.setOptions({
        text,
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        letterSpacing,
        fuel,
        wind,
        autoWind,
        flameHeight,
        buoyancy,
        paused,
        smoke,
        sparks,
        bloom,
        showTextBody,
        overlayText,
        overlayBlendMode,
        overlayColor,
        overlayOpacity,
        overlayStrokeColor,
        overlayStrokeWidth,
        interactive,
        background,
        simScale,
        flameHeadroom,
        paddingX,
        paddingBottom,
        width,
        height
      });
    }, [
      text,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      letterSpacing,
      fuel,
      wind,
      autoWind,
      flameHeight,
      buoyancy,
      paused,
      smoke,
      sparks,
      bloom,
      showTextBody,
      overlayText,
      overlayBlendMode,
      overlayColor,
      overlayOpacity,
      overlayStrokeColor,
      overlayStrokeWidth,
      interactive,
      background,
      simScale,
      flameHeadroom,
      paddingX,
      paddingBottom,
      width,
      height
    ]);
    return R.createElement("canvas", {
      ref: canvasRef,
      className,
      style: { display: "block", ...style }
    });
  });
  return Component;
}
var FireTextReact = createFireTextComponent(React);
var FireTextReact_default = FireTextReact;
export {
  FireTextReact as FireText,
  FireTextReact,
  OVERLAY_BLEND_MODES,
  createFireTextComponent,
  FireTextReact_default as default
};
//# sourceMappingURL=react.mjs.map
