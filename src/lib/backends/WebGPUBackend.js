import { clamp } from "../noise.js";
import {
  ITERATIONS,
  MIN_ITERATIONS,
  MAX_SUBSTEPS,
  SPARK_POOL,
  clampFuel,
  clampFlameHeight,
} from "../physics.js";
import { LUT_SIZE } from "../blackbody.js";
import {
  WG_INJECT,
  WG_STATE,
  WG_VELOCITY,
  WG_WIND,
  WG_CURL,
  WG_VORTICITY,
  WG_DIVERGENCE,
  WG_PRESSURE,
  WG_GRADIENT,
  WG_BACKTRACE,
  WG_ADVECT,
  WG_ADVECT_VELOCITY,
  WG_ADVECT_DETAIL,
  WG_POINTER,
  WG_PARTICLE_UPDATE,
  WG_PARTICLE_VERT,
  WG_PARTICLE_FRAG,
  WG_BLOOM_DOWN,
  WG_BLUR,
  WG_COMPOSITE,
  WG_FULLSCREEN_VERT,
} from "./webgpuShaders.js";

const STORAGE = 0x80 | 0x08 | 0x04;
const UNIFORM = 0x40 | 0x08;
const PARAM_FLOATS = 40;
const PARAM_BYTES = 256;

function parseCssColor(css) {
  if (!css || css === "transparent") return [0, 0, 0, 0];
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255];
}

function packPixels(canvas) {
  if (!canvas) return { data: new Uint32Array(1), width: 1, height: 1 };
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d");
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint32Array(width * height);
  for (let i = 0; i < data.length; i += 1) {
    const o = i * 4;
    data[i] =
      rgba[o] | (rgba[o + 1] << 8) | (rgba[o + 2] << 16) | (rgba[o + 3] << 24);
  }
  return { data, width, height };
}

export class WebGPUBackend {
  constructor() {
    this.name = "webgpu";
    this.options = null;
    this.context = null;
    this._time = 0;
    this._windSmooth = 0;
    this._gust = 0;
    this._accumTime = 0;
    this._detailPhase = 0.7;
    this._detailPeriod = 0.7;
    this._seed = 20261;
    this._frameSeed = 0;
    this._paramIndex = 0;
    this._destroyed = false;
  }

  async init(context) {
    this.context = context;
    this.options = context.options;
    this.noise = context.noise;
    this.luts = context.luts;
    this._rand = () => {
      this._seed = (16807 * this._seed) % 2147483647;
      return this._seed / 2147483647;
    };

    if (typeof document === "undefined" || !navigator.gpu) {
      throw new Error("WebGPU is not available.");
    }
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) throw new Error("WebGPU adapter unavailable.");
    const device = await adapter.requestDevice();
    this.device = device;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.gpuCanvas = document.createElement("canvas");
    this.gpuCanvas.width = context.backingWidth;
    this.gpuCanvas.height = context.backingHeight;
    this.gpuContext = this.gpuCanvas.getContext("webgpu");
    if (!this.gpuContext) throw new Error("WebGPU canvas context unavailable.");
    this.gpuContext.configure({
      device,
      format: this.format,
      alphaMode: "premultiplied",
    });

    device.lost.then(() => {
      if (!this._destroyed && this.context) {
        this.context.onContextLost("context-lost");
      }
    });

    this._createStaticBuffers();
    this._createPipelines();
    this.resize(context);
  }

  _createPipelines() {
    const device = this.device;
    const compute = (code) =>
      device.createComputePipeline({
        layout: "auto",
        compute: {
          module: device.createShaderModule({ code }),
          entryPoint: "main",
        },
      });
    this.pipelines = {
      inject: compute(WG_INJECT),
      state: compute(WG_STATE),
      velocity: compute(WG_VELOCITY),
      wind: compute(WG_WIND),
      curl: compute(WG_CURL),
      vorticity: compute(WG_VORTICITY),
      divergence: compute(WG_DIVERGENCE),
      pressure: compute(WG_PRESSURE),
      gradient: compute(WG_GRADIENT),
      backtrace: compute(WG_BACKTRACE),
      advect: compute(WG_ADVECT),
      advectVelocity: compute(WG_ADVECT_VELOCITY),
      advectDetail: compute(WG_ADVECT_DETAIL),
      pointer: compute(WG_POINTER),
      particleUpdate: compute(WG_PARTICLE_UPDATE),
      bloomDown: compute(WG_BLOOM_DOWN),
      blur: compute(WG_BLUR),
    };

    const fullscreen = device.createShaderModule({ code: WG_FULLSCREEN_VERT });
    const composite = device.createShaderModule({ code: WG_COMPOSITE });
    this.pipelines.composite = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: fullscreen, entryPoint: "vs" },
      fragment: {
        module: composite,
        entryPoint: "fs",
        targets: [{ format: this.format }],
      },
      primitive: { topology: "triangle-list" },
    });

    const particleVert = device.createShaderModule({ code: WG_PARTICLE_VERT });
    const particleFrag = device.createShaderModule({ code: WG_PARTICLE_FRAG });
    this.pipelines.particles = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: particleVert, entryPoint: "vs" },
      fragment: {
        module: particleFrag,
        entryPoint: "fs",
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: "one", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "line-list" },
    });
  }

  _buffer(size, usage = STORAGE) {
    return this.device.createBuffer({
      size: Math.max(4, Math.ceil(size / 4) * 4),
      usage,
    });
  }

  _write(buffer, data) {
    this.device.queue.writeBuffer(buffer, 0, data);
  }

  _createStaticBuffers() {
    const device = this.device;
    const luts = this.luts;

    const lut = new Float32Array(LUT_SIZE * 4);
    for (let i = 0; i < LUT_SIZE; i += 1) {
      lut[i * 4] = luts.lutR[i];
      lut[i * 4 + 1] = luts.lutG[i];
      lut[i * 4 + 2] = luts.lutB[i];
      lut[i * 4 + 3] = 1;
    }
    this.lutBuf = this._buffer(lut.byteLength);
    this._write(this.lutBuf, lut);

    const aux = new Float32Array(luts.toneSize + luts.detailSize * luts.detailSize);
    for (let i = 0; i < luts.toneSize; i += 1) {
      aux[i] = luts.toneLUT[i] / 255;
    }
    aux.set(luts.detailNoise, luts.toneSize);
    this.auxBuf = this._buffer(aux.byteLength);
    this._write(this.auxBuf, aux);

    this.permBuf = this._buffer(512 * 4);
    this._write(this.permBuf, new Uint32Array(this.noise.permutation));

    const palette = new Float32Array(64 * 4);
    for (let i = 0; i < 64; i += 1) {
      const match = /rgba?\(([^)]+)\)/.exec(
        luts.sparkPalette[i] || "rgb(0, 0, 0)"
      );
      const parts = match
        ? match[1].split(",").map((part) => Number(part.trim()))
        : [0, 0, 0];
      palette[i * 4] = (parts[0] || 0) / 255;
      palette[i * 4 + 1] = (parts[1] || 0) / 255;
      palette[i * 4 + 2] = (parts[2] || 0) / 255;
      palette[i * 4 + 3] = 1;
    }
    this.paletteBuf = this._buffer(palette.byteLength);
    this._write(this.paletteBuf, palette);

    this._paramPool = [];
    this._bgCache = new Map();
  }

  _param(values) {
    const data = new Float32Array(PARAM_FLOATS);
    const base = {
      size: [this.context.P, this.context.H, 0, 0],
      m0: [0, 0, 1.15, 1],
      m1: [0, 0, 0, 0],
      m2: [0, 0, 1, 1],
      m3: [0, 0, 0, 0],
      m4: [0, 0, 0, 0],
      canvas: [
        this.gpuCanvas.width,
        this.gpuCanvas.height,
        this.context.O,
        this.bloomW || 4,
      ],
      m5: [this.bloomH || 4, 0, 0, 0],
      m6: [0, 0, 0, 0.6],
      bg: [0, 0, 0, 0],
    };
    const merged = { ...base, ...values };
    const order = ["size", "m0", "m1", "m2", "m3", "m4", "canvas", "m5", "m6", "bg"];
    for (let i = 0; i < order.length; i += 1) {
      const vec = merged[order[i]];
      data[i * 4] = vec[0] || 0;
      data[i * 4 + 1] = vec[1] || 0;
      data[i * 4 + 2] = vec[2] || 0;
      data[i * 4 + 3] = vec[3] || 0;
    }
    let buffer = this._paramPool[this._paramIndex];
    if (!buffer) {
      buffer = this._buffer(PARAM_BYTES, UNIFORM);
      this._paramPool[this._paramIndex] = buffer;
    }
    this._paramIndex += 1;
    this._write(buffer, data);
    return buffer;
  }

  _allocate() {
    const device = this.device;
    const P = this.context.P;
    const H = this.context.H;
    const N = P * H;
    this._destroyDynamic();

    this.velA = this._buffer(N * 16);
    this.velB = this._buffer(N * 16);
    this.stateA = this._buffer(N * 16);
    this.stateB = this._buffer(N * 16);
    this.detailA = this._buffer(N * 2 * 16);
    this.detailB = this._buffer(N * 2 * 16);
    this.back = this._buffer(N * 16);
    this.divergence = this._buffer(N * 4);
    this.curl = this._buffer(N * 4);
    this.pressureA = this._buffer(N * 4);
    this.pressureB = this._buffer(N * 4);
    this.wind = this._buffer(H * 4);

    this.particleStateA = this._buffer(SPARK_POOL * 16);
    this.particleStateB = this._buffer(SPARK_POOL * 16);
    this.particleMetaA = this._buffer(SPARK_POOL * 16);
    this.particleMetaB = this._buffer(SPARK_POOL * 16);

    this.bloomW = Math.max(4, P >> 2) + 4;
    this.bloomH = Math.max(4, H >> 2) + 4;
    const bloomBytes = this.bloomW * this.bloomH * 4;
    this.bloomA = this._buffer(bloomBytes);
    this.bloomB = this._buffer(bloomBytes);
    this.bloomC = this._buffer(bloomBytes);

    const bodySize = this.gpuCanvas.width * this.gpuCanvas.height;
    this.bodyBuf = this._buffer(bodySize * 4);
    this.emberBuf = this._buffer(bodySize * 4);

    this.emitterBuf = this._buffer(Math.max(1, N) * 16);
    this.fuelEmitterBuf = this._buffer(Math.max(1, N) * 16);
    this.pointBuf = this._buffer(16);
    this.pointW = 1;
    this.pointCount = 0;

    const detail = new Float32Array(N * 2 * 4);
    for (let row = 0; row < H; row += 1) {
      for (let col = 0; col < P; col += 1) {
        const i = (row * P + col) * 4;
        detail[i] = col;
        detail[i + 1] = row;
        detail[N * 4 + i] = col + 57;
        detail[N * 4 + i + 1] = row + 0.37 * 57;
      }
    }
    this._write(this.detailA, detail);

    this._uploadTextAssets(this.context);
    this._resetTimingState();
    this._pressureCurrent = this.pressureA;
    this._warmupSteps = 6;
  }

  _destroyDynamic() {
    const keys = [
      "velA","velB","stateA","stateB","detailA","detailB","back",
      "divergence","curl","pressureA","pressureB","wind",
      "particleStateA","particleStateB","particleMetaA","particleMetaB",
      "bloomA","bloomB","bloomC","bodyBuf","emberBuf","emitterBuf","fuelEmitterBuf","pointBuf",
    ];
    for (const key of keys) {
      if (this[key]) this[key].destroy();
      this[key] = null;
    }
    this.bodySource = null;
    this.emitterSource = null;
    this.fuelSource = null;
    this.pointSource = null;
  }

  _resetTimingState() {
    this._detailPhase = 0.7;
    this._windSmooth = 0;
    this._gust = 0;
    this._accumTime = 0;
    this._frameSeed = 0;
  }

  _uploadTextAssets(context) {
    if (
      this.bodySource === context.textBodyCanvas &&
      this.emitterSource === context.emitterTextureData &&
      this.fuelSource === context.emitterFuelData &&
      this.pointSource === context.emitterPointData
    ) {
      return;
    }
    const P = context.P;

    if (context.emitterTextureData && context.emitterTextureData.length) {
      this._write(this.emitterBuf, context.emitterTextureData);
    } else {
      this._write(
        this.emitterBuf,
        new Float32Array(Math.max(1, P * H * 4))
      );
    }
    if (context.emitterFuelData && context.emitterFuelData.length) {
      this._write(this.fuelEmitterBuf, context.emitterFuelData);
    } else {
      this._write(
        this.fuelEmitterBuf,
        new Float32Array(Math.max(1, P * H * 4))
      );
    }

    const points = context.emitterPointData || new Float32Array(0);
    this.pointCount = points.length / 4;
    if (this.pointBuf) this.pointBuf.destroy();
    this.pointBuf = this._buffer(Math.max(1, this.pointCount) * 16);
    if (this.pointCount > 0) this._write(this.pointBuf, points);
    this.pointW = Math.max(1, Math.min(P, 2048));

    const body = packPixels(context.textBodyCanvas);
    const ember = packPixels(context.textEmberCanvas);
    const needed = Math.max(body.data.byteLength, ember.data.byteLength);
    if (!this.bodyBuf || this.bodyBuf.size < needed) {
      if (this.bodyBuf) this.bodyBuf.destroy();
      if (this.emberBuf) this.emberBuf.destroy();
      this.bodyBuf = this._buffer(needed);
      this.emberBuf = this._buffer(needed);
    }
    this._write(this.bodyBuf, body.data);
    this._write(this.emberBuf, ember.data);
    this.bodySource = context.textBodyCanvas;
    this.emitterSource = context.emitterTextureData;
    this.fuelSource = context.emitterFuelData;
    this.pointSource = context.emitterPointData;
  }

  resize(context) {
    this.context = context;
    this.options = context.options;
    this.noise = context.noise;
    this.luts = context.luts;
    if (!this.device || this._destroyed) return;

    const canvasW = context.backingWidth;
    const canvasH = context.backingHeight;
    if (this.gpuCanvas.width !== canvasW) this.gpuCanvas.width = canvasW;
    if (this.gpuCanvas.height !== canvasH) this.gpuCanvas.height = canvasH;

    const key = `${context.P}x${context.H}:${canvasW}x${canvasH}`;
    const changed = key !== this._resourceKey;
    this._resourceKey = key;

    if (changed || !this.velA) {
      this._allocate();
    } else if (context.resetSimulation) {
      this._clearSimulation();
      this._uploadTextAssets(context);
    } else {
      this._uploadTextAssets(context);
    }
  }

  _clearSimulation() {
    const device = this.device;
    const P = this.context.P;
    const H = this.context.H;
    const N = P * H;
    const zeros = new Float32Array(N * 4);
    for (const buffer of [this.velA, this.velB, this.stateA, this.stateB]) {
      this._write(buffer, zeros);
    }
    const scalarZeros = new Float32Array(N);
    for (const buffer of [
      this.pressureA,
      this.pressureB,
      this.divergence,
      this.curl,
    ]) {
      this._write(buffer, scalarZeros);
    }
    const detail = new Float32Array(N * 2 * 4);
    for (let row = 0; row < H; row += 1) {
      for (let col = 0; col < P; col += 1) {
        const i = (row * P + col) * 4;
        detail[i] = col;
        detail[i + 1] = row;
        detail[N * 4 + i] = col + 57;
        detail[N * 4 + i + 1] = row + 0.37 * 57;
      }
    }
    this._write(this.detailA, detail);
    this._write(this.particleStateA, new Float32Array(SPARK_POOL * 4));
    this._write(this.particleMetaA, new Float32Array(SPARK_POOL * 4));
    this._resetTimingState();
    this._pressureCurrent = this.pressureA;
    this._warmupSteps = 4;
  }

  setOptions(options) {
    this.options = options;
  }

  resetTiming() {
    this._accumTime = 0;
  }

  _compute(encoder, pipeline, paramBuffer, buffers, wx, wy) {
    const entries = [
      { binding: 0, resource: { buffer: paramBuffer } },
    ];
    for (let i = 0; i < buffers.length; i += 1) {
      if (buffers[i]) {
        entries.push({ binding: i + 1, resource: { buffer: buffers[i] } });
      }
    }
    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries,
    });
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(wx, wy, 1);
    pass.end();
  }

  _swapVelocity() {
    const tmp = this.velA;
    this.velA = this.velB;
    this.velB = tmp;
  }

  _swapState() {
    const tmp = this.stateA;
    this.stateA = this.stateB;
    this.stateB = tmp;
  }

  _swapDetail() {
    const tmp = this.detailA;
    this.detailA = this.detailB;
    this.detailB = tmp;
  }

  _swapParticles() {
    let tmp = this.particleStateA;
    this.particleStateA = this.particleStateB;
    this.particleStateB = tmp;
    tmp = this.particleMetaA;
    this.particleMetaA = this.particleMetaB;
    this.particleMetaB = tmp;
  }

  _project(encoder, quality) {
    const P = this.context.P;
    const H = this.context.H;
    const wx = Math.ceil(P / 8);
    const wy = Math.ceil(H / 8);
    this._compute(
      encoder,
      this.pipelines.divergence,
      this._param({}),
      [this.velA, this.divergence],
      wx,
      wy
    );

    const iters = Math.max(
      MIN_ITERATIONS,
      Math.round(ITERATIONS * Math.max(0.3, Math.min(1, quality)))
    );
    let src = this._pressureCurrent;
    let dst = src === this.pressureA ? this.pressureB : this.pressureA;
    for (let i = 0; i < iters; i += 1) {
      this._compute(
        encoder,
        this.pipelines.pressure,
        this._param({ m3: [0, 0, 0, 0] }),
        [src, this.divergence, dst],
        wx,
        wy
      );
      this._compute(
        encoder,
        this.pipelines.pressure,
        this._param({ m3: [1, 0, 0, 0] }),
        [dst, this.divergence, src],
        wx,
        wy
      );
    }
    this._pressureCurrent = src;

    this._compute(
      encoder,
      this.pipelines.gradient,
      this._param({}),
      [this.velA, this._pressureCurrent, this.velB],
      wx,
      wy
    );
    this._swapVelocity();
  }

  _runSimulation(dt, time, quality) {
    this._paramIndex = 0;
    const opts = this.options;
    const P = this.context.P;
    const H = this.context.H;
    const N = P * H;
    const fuel = clampFuel(opts.fuel);
    const flameReach = clampFlameHeight(opts.flameHeight);
    const densityNorm = clamp(
      420 / Math.max(120, Math.sqrt(this.context.emitterPoints.length) * 8),
      0.35,
      1.35
    );
    let windForce = 28 * this._windSmooth;
    if (opts.autoWind) {
      windForce += 4 * this.noise.noise2(0.4 * time, 9.7);
    }
    const windBlend = 1 - Math.exp(-2.5 * dt);
    const damp = Math.exp(-2 * dt);
    const wx = Math.ceil(P / 8);
    const wy = Math.ceil(H / 8);
    const encoder = this.device.createCommandEncoder();

    const base = {
      m0: [dt, time, fuel, flameReach],
      m1: [0, this._gust, 0, 0],
      m2: [0, 0, densityNorm, quality],
    };

    this._compute(
      encoder,
      this.pipelines.inject,
      this._param({ ...base, m2: [0, 0, densityNorm, quality] }),
      [this.stateA, this.emitterBuf, this.stateB, this.fuelEmitterBuf, null, null, null, null, this.permBuf],
      wx,
      wy
    );
    this._swapState();

    this._compute(
      encoder,
      this.pipelines.wind,
      this._param({}),
      [this.velA, this.wind],
      H,
      1
    );

    this._compute(
      encoder,
      this.pipelines.state,
      this._param({ m0: [dt, time, fuel, flameReach], m1: [1.5, this._gust, 0, 0] }),
      [this.stateA, this.stateB],
      wx,
      wy
    );
    this._swapState();

    this._compute(
      encoder,
      this.pipelines.velocity,
      this._param({
        m0: [dt, time, fuel, flameReach],
        m1: [0, this._gust, windForce, windBlend],
        m2: [damp, 150, densityNorm, quality],
      }),
      [this.velA, this.stateA, this.wind, this.velB, null, null, null, null, this.permBuf],
      wx,
      wy
    );
    this._swapVelocity();

    this._compute(
      encoder,
      this.pipelines.curl,
      this._param({}),
      [this.velA, this.curl],
      wx,
      wy
    );
    this._compute(
      encoder,
      this.pipelines.vorticity,
      this._param({ m0: [dt, time, fuel, flameReach] }),
      [this.velA, this.curl, this.stateA, this.velB],
      wx,
      wy
    );
    this._swapVelocity();

    this._project(encoder, quality);

    this._compute(
      encoder,
      this.pipelines.backtrace,
      this._param({ m0: [dt, time, fuel, flameReach] }),
      [this.velA, this.back],
      wx,
      wy
    );
    this._compute(
      encoder,
      this.pipelines.advectVelocity,
      this._param({}),
      [this.velA, this.back, this.velB],
      wx,
      wy
    );
    this._swapVelocity();
    this._compute(
      encoder,
      this.pipelines.advect,
      this._param({}),
      [this.stateA, this.back, this.stateB],
      wx,
      wy
    );
    this._swapState();

    const prevPhase = this._detailPhase;
    this._detailPhase += dt;
    let reset0 = 0;
    let offset0 = 0;
    if (this._detailPhase >= this._detailPeriod) {
      this._detailPhase -= this._detailPeriod;
      reset0 = 1;
      offset0 = this._rand() * this.luts.detailSize;
    }
    let reset1 = 0;
    let offset1 = 0;
    if (
      prevPhase < 0.5 * this._detailPeriod &&
      this._detailPhase >= 0.5 * this._detailPeriod
    ) {
      reset1 = 1;
      offset1 = this._rand() * this.luts.detailSize;
    }

    this._compute(
      encoder,
      this.pipelines.advectDetail,
      this._param({ m3: [reset0, offset0, 0, 0] }),
      [this.detailA, this.back, this.detailB],
      wx,
      wy
    );
    this._compute(
      encoder,
      this.pipelines.advectDetail,
      this._param({ m3: [reset1, offset1, N, 0] }),
      [this.detailA, this.back, this.detailB],
      wx,
      wy
    );
    this._swapDetail();

    this._project(encoder, quality);

    this._compute(
      encoder,
      this.pipelines.particleUpdate,
      this._param({
        m0: [dt, time, fuel, flameReach],
        m1: [0, this._gust, 0, 0],
        m4: [
          this._frameSeed,
          0.02 * fuel * (1 + this._gust),
          this.pointW,
          this.pointCount,
        ],
      }),
      [
        this.particleStateA,
        this.particleMetaA,
        this.velA,
        this.pointBuf,
        this.particleStateB,
        this.particleMetaB,
      ],
      Math.ceil(SPARK_POOL / 64),
      1
    );
    this._swapParticles();
    this._frameSeed += 1;

    this.device.queue.submit([encoder.finish()]);
  }

  step(dt, time, quality = 1) {
    if (!this.device || this._destroyed) return;
    this._time = time;
    let targetWind = Number(this.options.wind) || 0;
    if (this.options.autoWind) {
      targetWind += 0.25 * this.noise.noise2(0.05 * time, 1.3);
    }
    this._windSmooth +=
      (targetWind - this._windSmooth) * (1 - Math.exp(-2 * dt));
    this._gust = Math.max(0, this._gust - 0.8 * dt);

    this._accumTime += dt;
    if (this._warmupSteps > 0) {
      const extra = Math.min(this._warmupSteps, 2);
      this._warmupSteps -= extra;
      this._accumTime += extra / 60;
    }

    const maxSubsteps = quality < 0.7 ? 2 : MAX_SUBSTEPS;
    let substeps = 0;
    while (this._accumTime > 0 && substeps < maxSubsteps) {
      this._runSimulation(1 / 60, time, quality);
      this._accumTime -= 1 / 60;
      substeps += 1;
    }
    this._accumTime = Math.min(this._accumTime, 0);
  }

  _blend() {
    return 1 - Math.abs(1 - (this._detailPhase / this._detailPeriod) * 2);
  }

  render(ctx) {
    if (!this.device || this._destroyed || !this.velA) return;
    this._paramIndex = 0;
    const P = this.context.P;
    const H = this.context.H;
    const cw = this.gpuCanvas.width;
    const ch = this.gpuCanvas.height;
    const avg = clamp(Number(this.options.fuel) * 0.55, 0.15, 1);
    const opts = this.options;
    const encoder = this.device.createCommandEncoder();
    const bw = Math.ceil(this.bloomW / 8);
    const bh = Math.ceil(this.bloomH / 8);

    if (opts.bloom) {
      this._compute(
        encoder,
        this.pipelines.bloomDown,
        this._param({
          canvas: [cw, ch, this.context.O, this.bloomW],
          m5: [this.bloomH, 0, 0, 0],
          m6: [0, 0, this._blend(), avg],
        }),
        [this.stateA, this.detailA, this.auxBuf, this.lutBuf, this.bloomA],
        bw,
        bh
      );

    }

    const bg = this._background();
    const hasBackground =
      opts.background && opts.background !== "transparent" ? 1 : 0;
    const flicker = 0.72 + 0.28 * this.noise.noise2(1.9 * this._time, 4.2);
    const emberAlpha = clamp(
      flicker * Math.min(1.2, clampFuel(opts.fuel)) * 0.85,
      0,
      1
    );

    const compositeParam = this._param({
      canvas: [cw, ch, this.context.O, this.bloomW],
      m5: [this.bloomH, hasBackground, opts.smoke ? 1 : 0, opts.showTextBody ? 1 : 0],
      m6: [opts.bloom ? 1 : 0, emberAlpha, this._blend(), avg],
      bg: [bg[0] * bg[3], bg[1] * bg[3], bg[2] * bg[3], bg[3]],
    });
    const compositeEntries = [
      { binding: 0, resource: { buffer: compositeParam } },
      { binding: 1, resource: { buffer: this.stateA } },
      { binding: 2, resource: { buffer: this.detailA } },
      { binding: 3, resource: { buffer: this.auxBuf } },
      { binding: 4, resource: { buffer: this.lutBuf } },
      { binding: 5, resource: { buffer: this.bodyBuf } },
      { binding: 6, resource: { buffer: this.emberBuf } },
      { binding: 7, resource: { buffer: this.bloomA } },
    ];
    const compositeGroup = this.device.createBindGroup({
      layout: this.pipelines.composite.getBindGroupLayout(0),
      entries: compositeEntries,
    });

    const texture = this.gpuContext.getCurrentTexture();
    const view = texture.createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.pipelines.composite);
    pass.setBindGroup(0, compositeGroup);
    pass.draw(3);

    if (opts.sparks && this.pointCount > 0) {
      const particleParam = this._param({
        canvas: [cw, ch, this.context.O, this.bloomW],
      });
      const particleGroup = this.device.createBindGroup({
        layout: this.pipelines.particles.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: particleParam } },
          { binding: 1, resource: { buffer: this.particleStateA } },
          { binding: 2, resource: { buffer: this.particleMetaA } },
          { binding: 3, resource: { buffer: this.paletteBuf } },
        ],
      });
      pass.setPipeline(this.pipelines.particles);
      pass.setBindGroup(0, particleGroup);
      pass.draw(SPARK_POOL * 2);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(this.gpuCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    if (opts.overlayText && this.context.textOverlayCanvas) {
      ctx.save();
      ctx.globalCompositeOperation = opts.overlayBlendMode || "source-over";
      ctx.globalAlpha = clamp(Number(opts.overlayOpacity ?? 0.82), 0, 1);
      ctx.drawImage(
        this.context.textOverlayCanvas,
        0,
        0,
        ctx.canvas.width,
        ctx.canvas.height
      );
      ctx.restore();
    }
  }

  _background() {
    const css = this.options.background;
    if (this._bgCache.has(css)) return this._bgCache.get(css);
    const color = parseCssColor(css);
    this._bgCache.set(css, color);
    return color;
  }

  pointerSplat(simX, simY, impulseX, impulseY, radius = 8) {
    if (!this.device || this._destroyed || !this.velA) return;
    this._paramIndex = 0;
    const encoder = this.device.createCommandEncoder();
    const P = this.context.P;
    const H = this.context.H;
    this._compute(
      encoder,
      this.pipelines.pointer,
      this._param({ m5: [simX, simY, impulseX, impulseY], m3: [radius, 0, 0, 0] }),
      [this.velA, this.velB],
      Math.ceil(P / 8),
      Math.ceil(H / 8)
    );
    this._swapVelocity();
    this.device.queue.submit([encoder.finish()]);
  }

  destroy() {
    this._destroyed = true;
    this._destroyDynamic();
    for (const key of ["lutBuf", "auxBuf", "permBuf", "paletteBuf"]) {
      if (this[key]) this[key].destroy();
      this[key] = null;
    }
    if (this._paramPool) {
      for (const buffer of this._paramPool) buffer.destroy();
      this._paramPool = [];
    }
    if (this.device) this.device.destroy();
    this.device = null;
    this.gpuContext = null;
    this.gpuCanvas = null;
    this.context = null;
  }
}
