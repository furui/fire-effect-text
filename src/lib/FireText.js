import { clamp } from "./noise.js";
import { getSharedLUTs } from "./blackbody.js";
import { createNoise } from "./noise.js";
import {
  DEFAULT_OPTIONS,
  OVERLAY_BLEND_MODES,
  LAYOUT_KEYS,
  OVERLAY_STYLE_KEYS,
  FONT_KEYS,
  MAX_CELLS,
  MIN_GRID_WIDTH,
  MIN_GRID_HEIGHT,
  clampFlameHeight,
  clampSimScale,
} from "./physics.js";
import { selectBackends, isRendererName } from "./backends/select.js";
import { Canvas2DBackend } from "./backends/Canvas2DBackend.js";
import { WebGL2Backend } from "./backends/WebGL2Backend.js";
import { WebGPUBackend } from "./backends/WebGPUBackend.js";

const RENDERER_CLASSES = {
  canvas2d: Canvas2DBackend,
  webgl2: WebGL2Backend,
  webgpu: WebGPUBackend,
};

function normalizeRequested(value) {
  return value === "auto" || isRendererName(value) ? value : "auto";
}

function finitePositive(value) {
  const numeric = Number(value);
  return typeof value !== "string" && Number.isFinite(numeric) && numeric > 0
    ? numeric
    : null;
}

function abortError() {
  const error = new Error("FireText: initialization cancelled.");
  error.name = "AbortError";
  return error;
}

export { OVERLAY_BLEND_MODES, DEFAULT_OPTIONS };

export class FireText {
  /**
   * @param {HTMLCanvasElement | HTMLElement | string} target
   * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
   */
  constructor(target, options = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.requestedRenderer = normalizeRequested(this.opts.renderer);
    this.fallback = this.opts.fallback !== false;
    this._onRendererChange =
      typeof this.opts.onRendererChange === "function"
        ? this.opts.onRendererChange
        : null;
    this._onError =
      typeof this.opts.onError === "function" ? this.opts.onError : null;

    this.luts = getSharedLUTs();
    this.noise = createNoise(77);
    this._seed = 20261;
    this._rand = () => {
      this._seed = (16807 * this._seed) % 2147483647;
      return this._seed / 2147483647;
    };

    const el =
      typeof target === "string" ? document.querySelector(target) : target;
    if (!el) throw new Error("FireText: target element not found.");

    if (el.tagName === "CANVAS") {
      this.canvas = el;
      this.ownsCanvas = false;
    } else {
      this.canvas = document.createElement("canvas");
      this.canvas.style.display = "block";
      el.appendChild(this.canvas);
      this.ownsCanvas = true;
    }

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("FireText: could not create a 2D context.");
    this.ctx = ctx;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute(
      "aria-label",
      `Burning text effect: ${String(this.opts.text || "FIRE")}`
    );
    this.canvas.style.touchAction = "none";

    this.renderer = null;
    this.backend = null;
    this.isDestroyed = false;
    this.isPaused = Boolean(this.opts.paused);
    this.time = 0;
    this.lastFrameTs = 0;
    this.rafId = null;
    this._quality = 1;
    this._frameCostMs = 0;
    this._goodFrames = 0;
    this._initToken = 0;
    this._resizeScheduled = false;
    this._resizeFrame = null;
    this._fontLoadToken = 0;
    this._pointerDown = false;
    this._pointer = null;
    this._hidden =
      typeof document !== "undefined" && Boolean(document.hidden);
    this._offscreen = false;
    this._backendContext = {
      fireText: this,
      onContextLost: (reason) => this._handleContextLost(reason),
    };

    this._bindEvents();
    this._bindVisibility();
    this._measureAndBuild();
    this._syncContext(true);

    const ready = this._initialize();
    this.ready = ready;
    this.ready.catch(() => {});

    this._watchFonts();
    this.start();
  }

  async _initialize() {
    const token = ++this._initToken;
    const candidates = selectBackends(this.requestedRenderer, this.fallback);
    let lastError = null;

    for (let index = 0; index < candidates.length; index += 1) {
      const name = candidates[index];
      let backend = null;
      try {
        backend = this._createBackend(name);
        await backend.init(this._backendContext);
        if (token !== this._initToken || this.isDestroyed) {
          backend.destroy();
          throw abortError();
        }
        this.backend = backend;
        this.renderer = name;
        backend.setOptions(this.opts);
        this._syncContext(false);
        backend.resize(this._syncContext(false));
        if (this.isPaused) this._renderStillFrame();
        this._emitRendererChange({
          requested: this.requestedRenderer,
          renderer: name,
          reason:
            name === this.requestedRenderer
              ? this.requestedRenderer === "auto"
                ? "auto"
                : "requested"
              : "unavailable",
        });
        return this;
      } catch (error) {
        if (backend && backend !== this.backend) backend.destroy();
        if (error && error.name === "AbortError") throw error;
        lastError = error;
      }
    }

    const error =
      lastError ||
      new Error(
        `FireText: no renderer available for "${this.requestedRenderer}".`
      );
    this._emitError(error);
    throw error;
  }

  _createBackend(name) {
    const Backend = RENDERER_CLASSES[name];
    if (!Backend) throw new Error(`FireText: unknown renderer "${name}".`);
    return new Backend();
  }

  _syncContext(resetSimulation = false) {
    const context = this._backendContext;
    context.canvas = this.canvas;
    context.ctx = this.ctx;
    context.dpr = this.dpr;
    context.cssWidth = this.cssWidth;
    context.cssHeight = this.cssHeight;
    context.backingWidth = this.canvas.width;
    context.backingHeight = this.canvas.height;
    context.P = this.gridW;
    context.H = this.gridH;
    context.O = this.O;
    context.options = this.opts;
    context.luts = this.luts;
    context.noise = this.noise;
    context.emitterPoints = this.emitterPoints;
    context.emitterTextureData = this.emitterTextureData;
    context.emitterFuelData = this.emitterFuelTextureData;
    context.emitterPointData = this.emitterPointData;
    context.textLayout = this.textLayout;
    context.textBodyCanvas = this.textBodyCanvas;
    context.textEmberCanvas = this.textEmberCanvas;
    context.textOverlayCanvas = this.textOverlayCanvas;
    context.resetSimulation = resetSimulation;
    context.time = this.time;
    context.quality = this._quality;
    return context;
  }

  _getFontString(scale = 1) {
    const { fontStyle, fontWeight, fontSize, fontFamily } = this.opts;
    const px = Math.max(8, Math.round(Number(fontSize) * scale));
    return `${fontStyle || "normal"} ${fontWeight || "800"} ${px}px ${fontFamily}`;
  }

  _measureAndBuild() {
    if (this.isDestroyed) return;
    const lines = String(this.opts.text ?? " ")
      .replace(/\r\n/g, "\n")
      .split("\n");
    const fontSize = Math.max(12, Number(this.opts.fontSize) || 72);
    const lineHeight = fontSize * 1.18;

    const measureCtx = document.createElement("canvas").getContext("2d");
    if (!measureCtx) throw new Error("FireText: measurement context failed.");
    measureCtx.font = this._getFontString(1);
    if ("letterSpacing" in measureCtx && this.opts.letterSpacing) {
      measureCtx.letterSpacing = String(this.opts.letterSpacing);
    }

    let maxLineWidth = 0;
    for (const line of lines) {
      const metrics = measureCtx.measureText(line || " ");
      const width =
        Math.max(
          metrics.width,
          (metrics.actualBoundingBoxLeft || 0) +
            (metrics.actualBoundingBoxRight || 0)
        ) || fontSize * 0.5;
      if (width > maxLineWidth) maxLineWidth = width;
    }

    const totalTextHeight = fontSize + (lines.length - 1) * lineHeight;
    const padX = Math.round(fontSize * this.opts.paddingX);
    const flameReach = clampFlameHeight(this.opts.flameHeight);
    const minHeadroom = Math.round(
      fontSize * this.opts.flameHeadroom * Math.max(0.5, flameReach)
    );
    const padBottom = Math.round(fontSize * this.opts.paddingBottom);

    const explicitWidth = finitePositive(this.opts.width);
    const explicitHeight = finitePositive(this.opts.height);

    const cssWidth = Math.max(
      120,
      Math.round(explicitWidth || maxLineWidth + padX * 2)
    );
    const cssHeight = Math.max(
      90,
      Math.round(explicitHeight || totalTextHeight + minHeadroom + padBottom)
    );
    const headroom = explicitHeight
      ? Math.max(minHeadroom, cssHeight - totalTextHeight - padBottom)
      : minHeadroom;

    const dpr = Math.min(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      2
    );

    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = dpr;
    const backingWidth = Math.round(cssWidth * dpr);
    const backingHeight = Math.round(cssHeight * dpr);
    if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth;
    if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    const simCellCss = clampSimScale(
      this.opts.simScale,
      Math.max(2.2, fontSize / 32)
    );
    let gridW = Math.max(MIN_GRID_WIDTH, Math.round(cssWidth / simCellCss));
    let gridH = Math.max(MIN_GRID_HEIGHT, Math.round(cssHeight / simCellCss));
    if (gridW * gridH > MAX_CELLS) {
      const ratio = Math.sqrt(MAX_CELLS / (gridW * gridH));
      gridW = Math.max(MIN_GRID_WIDTH, Math.round(gridW * ratio));
      gridH = Math.max(MIN_GRID_HEIGHT, Math.round(gridH * ratio));
    }

    this.gridW = gridW;
    this.gridH = gridH;
    this.O = this.canvas.width / gridW;
    this.textLayout = {
      lines,
      fontSize,
      lineHeight,
      headroom,
      padBottom,
      totalTextHeight,
    };

    const layoutKey = [
      this.opts.text,
      this.opts.fontFamily,
      this.opts.fontWeight,
      this.opts.fontStyle,
      this.opts.letterSpacing,
      fontSize,
      flameReach,
      this.opts.flameHeadroom,
      this.opts.paddingX,
      this.opts.paddingBottom,
      simCellCss,
      cssWidth,
      cssHeight,
      dpr,
      gridW,
      gridH,
    ].join("|");

    const changed = layoutKey !== this._layoutKey;
    this._layoutKey = layoutKey;
    this._gridKey = `${gridW}x${gridH}:${this.canvas.width}x${this.canvas.height}`;

    if (changed || !this.textBodyCanvas) {
      this._buildTextAssets();
    }

    this._syncContext(changed);
    return changed;
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

  _renderOverlayCanvas() {
    if (!this.textLayout) return;
    const dpr = this.dpr;
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

  _buildTextAssets() {
    const { gridW, gridH, dpr } = this;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const { lines, fontSize, lineHeight, headroom, totalTextHeight } =
      this.textLayout;

    this._renderOverlayCanvas();

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
    const crackCount = Math.round((cw * ch) / (180 * dpr));
    for (let i = 0; i < crackCount; i += 1) {
      let cx = this._rand() * cw;
      let cy = topY + this._rand() * Math.max(10, botY - topY);
      ectx.strokeStyle = `rgba(255, ${120 + ((110 * this._rand()) | 0)}, 35, ${
        0.35 + 0.5 * this._rand()
      })`;
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
    maskCanvas.width = gridW;
    maskCanvas.height = gridH;
    const mctx = maskCanvas.getContext("2d");
    mctx.fillStyle = "#fff";
    mctx.font = this._getFontString(gridW / this.cssWidth);
    if ("letterSpacing" in mctx && this.opts.letterSpacing) {
      mctx.letterSpacing = String(this.opts.letterSpacing);
    }
    mctx.textAlign = "center";
    mctx.textBaseline = "middle";
    const simScale = gridW / this.cssWidth;
    const simStartY = (headroom + fontSize * 0.5) * simScale;
    for (let i = 0; i < lines.length; i += 1) {
      mctx.fillText(
        lines[i],
        gridW / 2,
        simStartY + i * lineHeight * simScale
      );
    }

    const maskData = mctx.getImageData(0, 0, gridW, gridH).data;
    this.emitterPoints = [];
    this.emitterTextureData = new Float32Array(gridW * gridH * 4);
    this.emitterFuelTextureData = new Float32Array(gridW * gridH * 4);
    const addFuel = (col, row, amount, phase) => {
      if (col < 0 || row < 0 || col >= gridW || row >= gridH) return;
      const idx = (row * gridW + col) * 4;
      if (this.emitterFuelTextureData[idx] === 0) {
        this.emitterFuelTextureData[idx + 1] = phase;
      }
      this.emitterFuelTextureData[idx] += amount;
    };

    for (let y = 1; y < gridH - 1; y += 1) {
      for (let x = 1; x < gridW - 1; x += 1) {
        const idx = (y * gridW + x) * 4;
        const alpha = maskData[idx + 3] / 255;
        if (alpha < 0.15) continue;

        const upAlpha = maskData[((y - 1) * gridW + x) * 4 + 3] / 255;
        const downAlpha = maskData[((y + 1) * gridW + x) * 4 + 3] / 255;
        const leftAlpha = maskData[(y * gridW + (x - 1)) * 4 + 3] / 255;
        const rightAlpha = maskData[(y * gridW + (x + 1)) * 4 + 3] / 255;

        const isTopEdge = upAlpha < 0.45;
        const isSideEdge =
          leftAlpha < 0.45 || rightAlpha < 0.45 || downAlpha < 0.45;
        const edgeWeight = isTopEdge ? 1.35 : isSideEdge ? 1.0 : 0.52;
        const phase = 10 * this._rand();

        this.emitterPoints.push({
          x: x + 0.5,
          y: y + 0.5,
          weight: alpha * edgeWeight,
          isEdge: isTopEdge || isSideEdge,
          phase,
        });

        const texel = (y * gridW + x) * 4;
        this.emitterTextureData[texel] = alpha * edgeWeight;
        this.emitterTextureData[texel + 1] = isTopEdge || isSideEdge ? 1 : 0;
        this.emitterTextureData[texel + 2] = phase;
        this.emitterTextureData[texel + 3] = isTopEdge ? 1 : 0;

        const weight = alpha * edgeWeight;
        addFuel(x, y - 1, 0.4 * weight, phase);
        addFuel(x, y, 0.6 * weight, phase);
      }
    }

    this.emitterPointData = new Float32Array(this.emitterPoints.length * 4);
    for (let i = 0; i < this.emitterPoints.length; i += 1) {
      const point = this.emitterPoints[i];
      this.emitterPointData[i * 4] = point.x;
      this.emitterPointData[i * 4 + 1] = point.y;
      this.emitterPointData[i * 4 + 2] = point.weight;
      this.emitterPointData[i * 4 + 3] = point.isEdge ? 1 : 0;
    }
  }

  setOptions(newOptions = {}) {
    if (this.isDestroyed) return this;
    const prev = this.opts;
    this.opts = { ...prev, ...newOptions };
    this._onRendererChange =
      typeof this.opts.onRendererChange === "function"
        ? this.opts.onRendererChange
        : this._onRendererChange;
    this._onError =
      typeof this.opts.onError === "function" ? this.opts.onError : this._onError;
    this.fallback = this.opts.fallback !== false;
    if (newOptions.renderer !== undefined) {
      const requested = normalizeRequested(newOptions.renderer);
      this.opts.renderer = requested;
      if (requested !== this.requestedRenderer) {
        this.setRenderer(requested).catch(() => {});
      }
    }

    if (newOptions.paused !== undefined) {
      const shouldPause = Boolean(newOptions.paused);
      if (shouldPause !== this.isPaused) {
        if (shouldPause) this.pause();
        else this.resume();
      }
    }

    if (LAYOUT_KEYS.some((key) => prev[key] !== this.opts[key])) {
      this._scheduleResize();
    } else if (OVERLAY_STYLE_KEYS.some((key) => prev[key] !== this.opts[key])) {
      this._renderOverlayCanvas();
      if (this.isPaused) this._renderStillFrame();
    } else if (this.backend) {
      this.backend.setOptions(this.opts);
      if (this.isPaused) this._renderStillFrame();
    } else if (this.isPaused) {
      this._renderStillFrame();
    }

    if (FONT_KEYS.some((key) => prev[key] !== this.opts[key])) {
      this._loadCurrentFont();
    }

    if (newOptions.text !== undefined) {
      this.canvas.setAttribute(
        "aria-label",
        `Burning text effect: ${String(newOptions.text || "FIRE")}`
      );
    }

    return this;
  }

  setText(text) {
    return this.setOptions({ text });
  }

  setFont(fontFamily, fontSize, fontWeight) {
    const patch = {};
    if (fontFamily !== undefined) patch.fontFamily = fontFamily;
    if (fontSize !== undefined) patch.fontSize = fontSize;
    if (fontWeight !== undefined) patch.fontWeight = fontWeight;
    return this.setOptions(patch);
  }

  _scheduleResize() {
    if (this.isDestroyed || this._resizeScheduled) return;
    this._resizeScheduled = true;
    this._resizeFrame = requestAnimationFrame(() => {
      this._resizeScheduled = false;
      this._resizeFrame = null;
      this.resize();
    });
  }

  resize() {
    if (this.isDestroyed) return;
    const changed = this._measureAndBuild();
    if (!this.backend) return;
    this.backend.setOptions(this.opts);
    this.backend.resize(this._syncContext(changed));
    if (this.isPaused) this._renderStillFrame();
  }

  async setRenderer(requested) {
    const normalized = normalizeRequested(requested);
    const forcedReason = this._forcedRendererReason;
    this._forcedRendererReason = null;
    const token = ++this._initToken;
    const previous = this.backend;
    const candidates = selectBackends(normalized, this.fallback);
    let lastError = null;

    for (let index = 0; index < candidates.length; index += 1) {
      const name = candidates[index];
      let backend = null;
      try {
        backend = this._createBackend(name);
        await backend.init(this._backendContext);
        if (token !== this._initToken || this.isDestroyed) {
          backend.destroy();
          throw abortError();
        }
        this.backend = backend;
        this.renderer = name;
        this.requestedRenderer = normalized;
        this.opts.renderer = normalized;
        backend.setOptions(this.opts);
        this._syncContext(false);
        backend.resize(this._syncContext(false));
        if (previous && previous !== backend) previous.destroy();
        this._emitRendererChange({
          requested: normalized,
          renderer: name,
          reason:
            forcedReason ||
            (name !== normalized
              ? "unavailable"
              : normalized === "auto"
                ? "auto"
                : "manual"),
        });
        if (this.isPaused) this._renderStillFrame();
        return this;
      } catch (error) {
        if (backend && backend !== this.backend) backend.destroy();
        if (error && error.name === "AbortError") throw error;
        lastError = error;
      }
    }

    const error =
      lastError ||
      new Error(`FireText: no renderer available for "${normalized}".`);
    this._emitError(error);
    if (!this.backend) throw error;
    return this;
  }

  _emitRendererChange(info) {
    if (this.isDestroyed || !this._onRendererChange) return;
    try {
      this._onRendererChange(info);
    } catch (error) {
      this._emitError(error);
    }
  }

  _emitError(error) {
    if (this.isDestroyed || !this._onError) return;
    try {
      this._onError(error);
    } catch {
      /* ignored */
    }
  }

  _handleContextLost(reason = "context-lost") {
    if (this.isDestroyed) return;
    if (!this.fallback) {
      this._emitRendererChange({
        requested: this.requestedRenderer,
        renderer: this.renderer,
        reason,
      });
      this._emitError(new Error(`FireText: ${reason}.`));
      return;
    }
    this._forcedRendererReason = reason;
    this.setRenderer("canvas2d").catch((error) => this._emitError(error));
  }

  _renderStillFrame() {
    if (!this.backend || this.isDestroyed) return;
    this._syncContext(false);
    this.backend.setOptions(this.opts);
    this.backend.render(this.ctx, {
      dt: 0,
      time: this.time,
      quality: this._quality,
      paused: true,
    });
  }

  _observeFrameCost(durationMs, rawFrameMs) {
    const cost = Math.max(durationMs, rawFrameMs || 0);
    this._frameCostMs += 0.05 * (cost - this._frameCostMs);
    if (this._frameCostMs > 22) {
      this._quality = Math.max(0.35, this._quality - 0.02);
      this._goodFrames = 0;
    } else if (this._frameCostMs < 13) {
      this._goodFrames += 1;
      if (this._goodFrames > 90) {
        this._quality = Math.min(1, this._quality + 0.01);
        this._goodFrames = 0;
      }
    }
  }

  _pointerStrength() {
    const numeric = Number(this.opts.pointerStrength);
    return clamp(Number.isFinite(numeric) ? numeric : 1, 0, 4);
  }

  _bindEvents() {
    this._onPointerDown = (event) => {
      if (!this.opts.interactive) return;
      const pos = this._getCanvasPos(event);
      this._pointerDown = true;
      this._pointer = { x: pos.x, y: pos.y };

      const strength = this._pointerStrength();
      if (strength > 0 && this.backend) {
        const O = this.O || 1;
        this.backend.pointerSplat(
          pos.x / O,
          pos.y / O,
          0,
          -900 * strength,
          12
        );
        if ("gust" in this.backend) {
          this.backend.gust = Math.min(
            1.5,
            this.backend.gust + 0.12 * strength
          );
        }
      }
    };

    this._onPointerMove = (event) => {
      if (!this.opts.interactive || !this._pointerDown) return;
      const pos = this._getCanvasPos(event);
      if (!this._pointer) {
        this._pointer = { x: pos.x, y: pos.y };
        return;
      }
      const dx = pos.x - this._pointer.x;
      const dy = pos.y - this._pointer.y;
      this._pointer.x = pos.x;
      this._pointer.y = pos.y;

      const O = this.O || 1;
      const strength = this._pointerStrength();
      if (strength <= 0) return;
      const simX = pos.x / O;
      const simY = pos.y / O;
      const impulseX = clamp(
        (dx / O) * 90 * strength,
        -1200,
        1200
      );
      const impulseY = clamp(
        (dy / O) * 90 * strength,
        -1200,
        1200
      );

      this.backend?.pointerSplat(simX, simY, impulseX, impulseY, 8);
      if (this.backend && "gust" in this.backend) {
        this.backend.gust = Math.min(
          1.5,
          this.backend.gust + 0.012 * strength * Math.hypot(dx, dy)
        );
      }
    };

    this._onPointerUp = () => {
      this._pointerDown = false;
      this._pointer = null;
    };

    this.canvas.addEventListener("pointerdown", this._onPointerDown);
    this.canvas.addEventListener("pointermove", this._onPointerMove);
    this.canvas.addEventListener("pointerup", this._onPointerUp);
    this.canvas.addEventListener("pointerleave", this._onPointerUp);
    this.canvas.addEventListener("pointercancel", this._onPointerUp);
  }

  _bindVisibility() {
    this._onVisibilityChange = () => {
      this._hidden = Boolean(document.hidden);
      if (!this._hidden) this._resetTiming();
    };
    document.addEventListener("visibilitychange", this._onVisibilityChange);

    if (typeof IntersectionObserver !== "undefined") {
      this._observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          const next = !entry.isIntersecting;
          if (this._offscreen && !next) this._resetTiming();
          this._offscreen = next;
        },
        { threshold: 0 }
      );
      this._observer.observe(this.canvas);
    }
  }

  _resetTiming() {
    this.lastFrameTs = performance.now();
    if (this.backend && typeof this.backend.resetTiming === "function") {
      this.backend.resetTiming();
    }
  }

  _watchFonts() {
    if (
      typeof document === "undefined" ||
      !document.fonts ||
      !document.fonts.ready
    ) {
      return;
    }
    document.fonts.ready.then(() => {
      if (!this.isDestroyed) this._scheduleResize();
    });
  }

  _loadCurrentFont() {
    if (typeof document === "undefined" || !document.fonts) return;
    const token = ++this._fontLoadToken;
    const font = this._getFontString(1);
    const load = document.fonts.load
      ? document.fonts.load(font)
      : Promise.resolve();
    load
      .then(() => {
        if (!this.isDestroyed && token === this._fontLoadToken) {
          this._scheduleResize();
        }
      })
      .catch(() => {});
  }

  _getCanvasPos(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / Math.max(1, rect.width);
    const scaleY = this.canvas.height / Math.max(1, rect.height);
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
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
    this._resetTiming();
    return this;
  }

  togglePause() {
    if (this.isPaused) this.resume();
    else this.pause();
    return this.isPaused;
  }

  start() {
    if (this.rafId !== null || this.isDestroyed) return this;
    this.lastFrameTs = performance.now();
    const loop = (now) => {
      if (this.isDestroyed) return;
      const active = !this.isPaused && !this._hidden && !this._offscreen;
      if (active && this.backend) {
        const rawFrameMs = now - this.lastFrameTs;
        const dt = clamp(rawFrameMs / 1000, 0.001, 0.05);
        this.time += dt;
        this._backendContext.time = this.time;
        const started = performance.now();
        this.backend.step(dt, this.time, this._quality);
        this.backend.render(this.ctx, {
          dt,
          time: this.time,
          quality: this._quality,
        });
        this._observeFrameCost(performance.now() - started, rawFrameMs);
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
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this._initToken += 1;
    this.stop();
    if (this._resizeFrame !== null) {
      cancelAnimationFrame(this._resizeFrame);
      this._resizeFrame = null;
    }
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerup", this._onPointerUp);
    this.canvas.removeEventListener("pointerleave", this._onPointerUp);
    this.canvas.removeEventListener("pointercancel", this._onPointerUp);
    if (this.backend) {
      this.backend.destroy();
      this.backend = null;
    }
    if (this.ownsCanvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}

export function createFireText(target, options) {
  return new FireText(target, options);
}

export default FireText;
