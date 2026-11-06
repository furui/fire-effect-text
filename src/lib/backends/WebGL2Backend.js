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
  VERT,
  INJECT_FS,
  STATE_FS,
  VELOCITY_FS,
  WIND_FS,
  CURL_FS,
  VORTICITY_FS,
  DIVERGENCE_FS,
  PRESSURE_FS,
  GRADIENT_FS,
  BACKTRACE_FS,
  ADVECT_FS,
  ADVECT_VELOCITY_FS,
  ADVECT_DETAIL_FS,
  POINTER_FS,
  PARTICLE_UPDATE_FS,
  PARTICLE_VERT,
  PARTICLE_FRAG,
  BLOOM_DOWN_FS,
  BLUR_FS,
  COMPOSITE_FS,
} from "./webgl2Shaders.js";

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL2 shader compile failed: ${log}`);
  }
  return shader;
}

class GLProgram {
  constructor(gl, fragmentSource, vertexSource = VERT) {
    this.gl = gl;
    this.program = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, vertexSource);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(this.program);
      gl.deleteProgram(this.program);
      throw new Error(`WebGL2 program link failed: ${log}`);
    }
    this.locations = new Map();
  }

  use() {
    this.gl.useProgram(this.program);
    return this;
  }

  loc(name) {
    if (!this.locations.has(name)) {
      this.locations.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.locations.get(name);
  }

  int(name, value) {
    this.gl.uniform1i(this.loc(name), value);
    return this;
  }

  float(name, value) {
    this.gl.uniform1f(this.loc(name), value);
    return this;
  }

  vec2(name, x, y) {
    this.gl.uniform2f(this.loc(name), x, y);
    return this;
  }

  ivec2(name, x, y) {
    this.gl.uniform2i(this.loc(name), x, y);
    return this;
  }

  vec4(name, x, y, z, w) {
    this.gl.uniform4f(this.loc(name), x, y, z, w);
    return this;
  }

  delete() {
    this.gl.deleteProgram(this.program);
  }
}

function parseCssColor(css) {
  if (!css || css === "transparent") return [0, 0, 0, 0];
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255];
}

function parsePalette(palette) {
  const data = new Uint8Array(64 * 4);
  for (let i = 0; i < 64; i += 1) {
    const match = /rgba?\(([^)]+)\)/.exec(palette[i] || "rgb(0, 0, 0)");
    const parts = match
      ? match[1].split(",").map((part) => Number(part.trim()))
      : [0, 0, 0];
    data[i * 4] = parts[0] || 0;
    data[i * 4 + 1] = parts[1] || 0;
    data[i * 4 + 2] = parts[2] || 0;
    data[i * 4 + 3] = 255;
  }
  return data;
}

export class WebGL2Backend {
  constructor() {
    this.name = "webgl2";
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
    this._lost = false;
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

    if (typeof document === "undefined") {
      throw new Error("WebGL2 is not available outside a browser.");
    }
    this.glCanvas = document.createElement("canvas");
    this.glCanvas.width = context.backingWidth;
    this.glCanvas.height = context.backingHeight;
    const gl = this.glCanvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) throw new Error("WebGL2 is not available.");
    this.gl = gl;
    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error("WebGL2 float render targets are not available.");
    }
    this._buildPrograms();
    this._createLUTTextures();
    this._bindContextLoss();
    this.resize(context);
  }

  _buildPrograms() {
    const gl = this.gl;
    this.programs = {
      inject: new GLProgram(gl, INJECT_FS),
      state: new GLProgram(gl, STATE_FS),
      velocity: new GLProgram(gl, VELOCITY_FS),
      wind: new GLProgram(gl, WIND_FS),
      curl: new GLProgram(gl, CURL_FS),
      vorticity: new GLProgram(gl, VORTICITY_FS),
      divergence: new GLProgram(gl, DIVERGENCE_FS),
      pressure: new GLProgram(gl, PRESSURE_FS),
      gradient: new GLProgram(gl, GRADIENT_FS),
      backtrace: new GLProgram(gl, BACKTRACE_FS),
      advect: new GLProgram(gl, ADVECT_FS),
      advectVelocity: new GLProgram(gl, ADVECT_VELOCITY_FS),
      advectDetail: new GLProgram(gl, ADVECT_DETAIL_FS),
      pointer: new GLProgram(gl, POINTER_FS),
      particleUpdate: new GLProgram(gl, PARTICLE_UPDATE_FS),
      particleDraw: new GLProgram(gl, PARTICLE_FRAG, PARTICLE_VERT),
      bloomDown: new GLProgram(gl, BLOOM_DOWN_FS),
      blur: new GLProgram(gl, BLUR_FS),
      composite: new GLProgram(gl, COMPOSITE_FS),
    };
    gl.bindVertexArray(gl.createVertexArray());
  }

  _bindContextLoss() {
    this._onLost = (event) => {
      event.preventDefault();
      this._lost = true;
      clearTimeout(this._lostTimer);
      this._lostTimer = setTimeout(() => {
        if (this.context && !this.context.fireText.isDestroyed) {
          this.context.onContextLost("context-lost");
        }
      }, 1200);
    };
    this._onRestored = () => {
      clearTimeout(this._lostTimer);
      try {
        this._buildPrograms();
        this._createLUTTextures();
        this._allocateFields();
        this._lost = false;
      } catch {
        this.context.onContextLost("context-lost");
      }
    };
    this.glCanvas.addEventListener("webglcontextlost", this._onLost);
    this.glCanvas.addEventListener("webglcontextrestored", this._onRestored);
  }

  _texture(w, h, internalFormat, format, type, filter, data = null) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      w,
      h,
      0,
      format,
      type,
      data
    );
    return { tex, w, h };
  }

  _floatTexture(w, h, data = null) {
    return this._texture(
      w,
      h,
      this.gl.RGBA32F,
      this.gl.RGBA,
      this.gl.FLOAT,
      this.gl.NEAREST,
      data
    );
  }

  _createLUTTextures() {
    const gl = this.gl;
    const luts = this.luts;
    const bb = new Float32Array(LUT_SIZE * 4);
    for (let i = 0; i < LUT_SIZE; i += 1) {
      bb[i * 4] = luts.lutR[i];
      bb[i * 4 + 1] = luts.lutG[i];
      bb[i * 4 + 2] = luts.lutB[i];
      bb[i * 4 + 3] = 1;
    }
    this.lutTex = this._floatTexture(LUT_SIZE, 1, bb);
    this.toneTex = this._texture(
      luts.toneSize,
      1,
      gl.R8,
      gl.RED,
      gl.UNSIGNED_BYTE,
      gl.LINEAR,
      new Uint8Array(luts.toneLUT)
    );
    const detail = new Uint8Array(luts.detailSize * luts.detailSize);
    for (let i = 0; i < detail.length; i += 1) {
      detail[i] = Math.max(
        0,
        Math.min(255, Math.round(luts.detailNoise[i] * 255))
      );
    }
    this.detailTex = this._texture(
      luts.detailSize,
      luts.detailSize,
      gl.R8,
      gl.RED,
      gl.UNSIGNED_BYTE,
      gl.NEAREST,
      detail
    );
    this.paletteTex = this._texture(
      64,
      1,
      gl.RGBA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      gl.NEAREST,
      parsePalette(luts.sparkPalette)
    );
    this.permTex = this._texture(
      512,
      1,
      gl.R8UI,
      gl.RED_INTEGER,
      gl.UNSIGNED_BYTE,
      gl.NEAREST,
      new Uint8Array(this.noise.permutation)
    );
  }

  _allocateFields() {
    const gl = this.gl;
    this._deleteFields();
    const P = this.context.P;
    const H = this.context.H;
    this.velA = this._floatTexture(P, H);
    this.velB = this._floatTexture(P, H);
    this.stateA = this._floatTexture(P, H);
    this.stateB = this._floatTexture(P, H);
    this.detail0A = this._floatTexture(P, H);
    this.detail0B = this._floatTexture(P, H);
    this.detail1A = this._floatTexture(P, H);
    this.detail1B = this._floatTexture(P, H);
    this.pressureA = this._floatTexture(P, H);
    this.pressureB = this._floatTexture(P, H);
    this.divergenceTex = this._floatTexture(P, H);
    this.curlTex = this._floatTexture(P, H);
    this.backTex = this._floatTexture(P, H);
    this.windTex = this._floatTexture(1, H);

    const detailData = new Float32Array(P * H * 4);
    for (let row = 0; row < H; row += 1) {
      for (let col = 0; col < P; col += 1) {
        const i = (row * P + col) * 4;
        detailData[i] = col;
        detailData[i + 1] = row;
      }
    }
    this._uploadField(this.detail0A, detailData);
    const detailData1 = new Float32Array(P * H * 4);
    for (let row = 0; row < H; row += 1) {
      for (let col = 0; col < P; col += 1) {
        const i = (row * P + col) * 4;
        detailData1[i] = col + 57;
        detailData1[i + 1] = row + 0.37 * 57;
      }
    }
    this._uploadField(this.detail1A, detailData1);

    this.particleStateA = this._floatTexture(SPARK_POOL, 1);
    this.particleStateB = this._floatTexture(SPARK_POOL, 1);
    this.particleMetaA = this._floatTexture(SPARK_POOL, 1);
    this.particleMetaB = this._floatTexture(SPARK_POOL, 1);

    this.fbo = gl.createFramebuffer();
    this.bloomW = Math.max(4, P >> 2) + 4;
    this.bloomH = Math.max(4, H >> 2) + 4;
    this.bloomA = this._texture(
      this.bloomW,
      this.bloomH,
      gl.RGBA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      gl.LINEAR
    );
    this.bloomB = this._texture(
      this.bloomW,
      this.bloomH,
      gl.RGBA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      gl.LINEAR
    );
    this.bloomC = this._texture(
      this.bloomW,
      this.bloomH,
      gl.RGBA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      gl.LINEAR
    );

    this._uploadTextAssets(this.context);
    this._detailPhase = 0.7;
    this._windSmooth = 0;
    this._gust = 0;
    this._accumTime = 0;
    this._frameSeed = 0;
    this._pressureCurrent = this.pressureA;
    this._warmupSteps = 6;
  }

  _deleteFields() {
    const gl = this.gl;
    if (!gl) return;
    const fields = [
      "velA",
      "velB",
      "stateA",
      "stateB",
      "detail0A",
      "detail0B",
      "detail1A",
      "detail1B",
      "pressureA",
      "pressureB",
      "divergenceTex",
      "curlTex",
      "backTex",
      "windTex",
      "particleStateA",
      "particleStateB",
      "particleMetaA",
      "particleMetaB",
      "bloomA",
      "bloomB",
      "bloomC",
      "emitterTex",
      "fuelEmitterTex",
      "pointTex",
      "bodyTex",
      "emberTex",
    ];
    for (const key of fields) {
      if (this[key] && this[key].tex) gl.deleteTexture(this[key].tex);
      this[key] = null;
    }
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.fbo = null;
    this.bodySource = null;
    this.emitterSource = null;
    this.fuelSource = null;
    this.pointSource = null;
  }

  _uploadField(field, data) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, field.tex);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      field.w,
      field.h,
      gl.RGBA,
      gl.FLOAT,
      data
    );
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
    const gl = this.gl;
    const P = context.P;
    const H = context.H;

    if (this.emitterTex) gl.deleteTexture(this.emitterTex.tex);
    const emitterData =
      context.emitterTextureData && context.emitterTextureData.length
        ? context.emitterTextureData
        : new Float32Array(Math.max(1, P * H * 4));
    this.emitterTex = this._floatTexture(
      Math.max(1, P),
      Math.max(1, H),
      emitterData
    );

    if (this.fuelEmitterTex) gl.deleteTexture(this.fuelEmitterTex.tex);
    const fuelData =
      context.emitterFuelData && context.emitterFuelData.length
        ? context.emitterFuelData
        : new Float32Array(Math.max(1, P * H * 4));
    this.fuelEmitterTex = this._floatTexture(
      Math.max(1, P),
      Math.max(1, H),
      fuelData
    );

    if (this.pointTex) gl.deleteTexture(this.pointTex.tex);
    const count = context.emitterPointData
      ? context.emitterPointData.length / 4
      : 0;
    const pointW = Math.max(1, Math.min(P, 2048));
    const pointH = Math.max(1, Math.ceil(count / pointW));
    const pointData = new Float32Array(pointW * pointH * 4);
    if (context.emitterPointData && context.emitterPointData.length) {
      pointData.set(context.emitterPointData);
    }
    this.pointTex = this._floatTexture(pointW, pointH, pointData);
    this.pointW = pointW;
    this.pointH = pointH;
    this.pointCount = count;

    if (this.bodyTex) gl.deleteTexture(this.bodyTex.tex);
    if (this.emberTex) gl.deleteTexture(this.emberTex.tex);
    this.bodyTex = this._canvasTexture(context.textBodyCanvas);
    this.emberTex = this._canvasTexture(context.textEmberCanvas);
    this.bodySource = context.textBodyCanvas;
    this.emitterSource = context.emitterTextureData;
    this.fuelSource = context.emitterFuelData;
    this.pointSource = context.emitterPointData;
  }

  _canvasTexture(canvas) {
    const gl = this.gl;
    const width = canvas ? canvas.width : 1;
    const height = canvas ? canvas.height : 1;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (canvas) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas
      );
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array(4)
      );
    }
    return { tex, w: width, h: height };
  }

  resize(context) {
    this.context = context;
    this.options = context.options;
    this.noise = context.noise;
    this.luts = context.luts;
    if (!this.gl || this._lost) return;

    const gridW = context.P;
    const gridH = context.H;
    const canvasW = context.backingWidth;
    const canvasH = context.backingHeight;
    if (this.glCanvas.width !== canvasW) this.glCanvas.width = canvasW;
    if (this.glCanvas.height !== canvasH) this.glCanvas.height = canvasH;

    const key = `${gridW}x${gridH}:${canvasW}x${canvasH}`;
    const changed = key !== this._resourceKey;
    this._resourceKey = key;

    if (changed || !this.fbo) {
      this._allocateFields();
    } else if (context.resetSimulation) {
      this._clearSimulation();
      this._uploadTextAssets(context);
    } else {
      this._uploadTextAssets(context);
    }
  }

  _clearSimulation() {
    const gl = this.gl;
    const fields = [
      this.velA,
      this.velB,
      this.stateA,
      this.stateB,
      this.pressureA,
      this.pressureB,
    ];
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT1,
      gl.TEXTURE_2D,
      null,
      0
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    for (const field of fields) {
      if (!field) continue;
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        field.tex,
        0
      );
      gl.viewport(0, 0, field.w, field.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    const P = this.context.P;
    const H = this.context.H;
    const detailData = new Float32Array(P * H * 4);
    for (let row = 0; row < H; row += 1) {
      for (let col = 0; col < P; col += 1) {
        const i = (row * P + col) * 4;
        detailData[i] = col;
        detailData[i + 1] = row;
      }
    }
    this._uploadField(this.detail0A, detailData);
    for (let i = 0; i < detailData.length; i += 4) {
      detailData[i] += 57;
      detailData[i + 1] += 0.37 * 57;
    }
    this._uploadField(this.detail1A, detailData);

    for (const field of [this.particleStateA, this.particleMetaA]) {
      if (!field) continue;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        field.tex,
        0
      );
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.viewport(0, 0, field.w, field.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this._detailPhase = 0.7;
    this._windSmooth = 0;
    this._gust = 0;
    this._accumTime = 0;
    this._frameSeed = 0;
    this._pressureCurrent = this.pressureA;
    this._warmupSteps = 4;
  }

  setOptions(options) {
    this.options = options;
  }

  resetTiming() {
    this._accumTime = 0;
  }

  _bindTexture(unit, texture, location) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture ? texture.tex || texture : null);
    gl.uniform1i(location, unit);
  }

  _target(field) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      field.tex,
      0
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT1,
      gl.TEXTURE_2D,
      null,
      0
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, field.w, field.h);
  }

  _targetMRT(a, b) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      a.tex,
      0
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT1,
      gl.TEXTURE_2D,
      b.tex,
      0
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, a.w, a.h);
  }

  _draw() {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  _runPass(program, target, setup) {
    this._target(target);
    program.use();
    program.ivec2("uSize", target.w, target.h);
    setup(program);
    this._draw();
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

  _swapDetail0() {
    const tmp = this.detail0A;
    this.detail0A = this.detail0B;
    this.detail0B = tmp;
  }

  _swapDetail1() {
    const tmp = this.detail1A;
    this.detail1A = this.detail1B;
    this.detail1B = tmp;
  }

  _swapParticles() {
    let tmp = this.particleStateA;
    this.particleStateA = this.particleStateB;
    this.particleStateB = tmp;
    tmp = this.particleMetaA;
    this.particleMetaA = this.particleMetaB;
    this.particleMetaB = tmp;
  }

  _project(quality) {
    const divergence = this.programs.divergence;
    this._runPass(divergence, this.divergenceTex, (p) => {
      this._bindTexture(0, this.velA, p.loc("uVel"));
    });

    const iters = Math.max(
      MIN_ITERATIONS,
      Math.round(ITERATIONS * Math.max(0.3, Math.min(1, quality)))
    );
    let src = this._pressureCurrent;
    let dst = src === this.pressureA ? this.pressureB : this.pressureA;
    const pressure = this.programs.pressure;
    for (let i = 0; i < iters; i += 1) {
      this._runPass(pressure, dst, (p) => {
        p.float("uParity", 0);
        this._bindTexture(0, src, p.loc("uPressure"));
        this._bindTexture(1, this.divergenceTex, p.loc("uDiv"));
      });
      this._runPass(pressure, src, (p) => {
        p.float("uParity", 1);
        this._bindTexture(0, dst, p.loc("uPressure"));
        this._bindTexture(1, this.divergenceTex, p.loc("uDiv"));
      });
    }
    this._pressureCurrent = src;

    const gradient = this.programs.gradient;
    this._runPass(gradient, this.velB, (p) => {
      this._bindTexture(0, this.velA, p.loc("uVel"));
      this._bindTexture(1, this._pressureCurrent, p.loc("uPressure"));
    });
    this._swapVelocity();
  }

  _runSimulation(dt, time, quality) {
    const opts = this.options;
    const P = this.context.P;
    const H = this.context.H;
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

    const inject = this.programs.inject;
    this._runPass(inject, this.stateB, (p) => {
      p.float("uTime", time);
      p.float("uDt", dt);
      p.float("uFuel", fuel);
      p.float("uDensity", densityNorm);
      p.float("uGust", this._gust);
      this._bindTexture(0, this.stateA, p.loc("uState"));
      this._bindTexture(1, this.emitterTex, p.loc("uEmitter"));
      this._bindTexture(2, this.permTex, p.loc("uPerm"));
      this._bindTexture(3, this.fuelEmitterTex, p.loc("uFuelEmitter"));
    });
    this._swapState();

    const wind = this.programs.wind;
    this._runPass(wind, this.windTex, (p) => {
      p.ivec2("uSize", P, H);
      this._bindTexture(0, this.velA, p.loc("uVel"));
    });

    const statePass = this.programs.state;
    this._runPass(statePass, this.stateB, (p) => {
      p.float("uDt", dt);
      p.float("uFlameReach", flameReach);
      p.float("uCooling", 1.5);
      p.float("uGust", this._gust);
      this._bindTexture(0, this.stateA, p.loc("uState"));
    });
    this._swapState();

    const velocityPass = this.programs.velocity;
    this._runPass(velocityPass, this.velB, (p) => {
      p.float("uTime", time);
      p.float("uDt", dt);
      p.float("uFlameReach", flameReach);
      p.float("uWindForce", windForce);
      p.float("uWindBlend", windBlend);
      p.float("uDamp", damp);
      p.float("uTurbulence", 150);
      this._bindTexture(0, this.velA, p.loc("uVel"));
      this._bindTexture(1, this.stateA, p.loc("uState"));
      this._bindTexture(2, this.windTex, p.loc("uWind"));
      this._bindTexture(3, this.permTex, p.loc("uPerm"));
    });
    this._swapVelocity();

    const curl = this.programs.curl;
    this._runPass(curl, this.curlTex, (p) => {
      this._bindTexture(0, this.velA, p.loc("uVel"));
    });

    const vorticity = this.programs.vorticity;
    this._runPass(vorticity, this.velB, (p) => {
      p.float("uDt", dt);
      this._bindTexture(0, this.velA, p.loc("uVel"));
      this._bindTexture(1, this.curlTex, p.loc("uCurl"));
      this._bindTexture(2, this.stateA, p.loc("uState"));
    });
    this._swapVelocity();

    this._project(quality);

    const backtrace = this.programs.backtrace;
    this._runPass(backtrace, this.backTex, (p) => {
      p.float("uDt", dt);
      this._bindTexture(0, this.velA, p.loc("uVel"));
    });

    const advectVelocity = this.programs.advectVelocity;
    this._runPass(advectVelocity, this.velB, (p) => {
      this._bindTexture(0, this.velA, p.loc("uSource"));
      this._bindTexture(1, this.backTex, p.loc("uBack"));
    });
    this._swapVelocity();

    const advect = this.programs.advect;
    this._runPass(advect, this.stateB, (p) => {
      this._bindTexture(0, this.stateA, p.loc("uSource"));
      this._bindTexture(1, this.backTex, p.loc("uBack"));
    });
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

    const advectDetail = this.programs.advectDetail;
    this._runPass(advectDetail, this.detail0B, (p) => {
      p.float("uReset", reset0);
      p.float("uOffset", offset0);
      this._bindTexture(0, this.detail0A, p.loc("uSource"));
      this._bindTexture(1, this.backTex, p.loc("uBack"));
    });
    this._swapDetail0();
    this._runPass(advectDetail, this.detail1B, (p) => {
      p.float("uReset", reset1);
      p.float("uOffset", offset1);
      this._bindTexture(0, this.detail1A, p.loc("uSource"));
      this._bindTexture(1, this.backTex, p.loc("uBack"));
    });
    this._swapDetail1();

    this._project(quality);
    this._updateParticles(dt);
  }

  _updateParticles(dt) {
    const gl = this.gl;
    const program = this.programs.particleUpdate;
    const P = this.context.P;
    const H = this.context.H;
    this._targetMRT(this.particleStateB, this.particleMetaB);
    program.use();
    program.ivec2("uSize", SPARK_POOL, 1);
    program.ivec2("uGridSize", P, H);
    program.int("uPointW", this.pointW);
    program.int("uCount", this.pointCount);
    program.float("uDt", dt);
    program.float("uSeed", this._frameSeed);
    program.float("uFlameReach", clampFlameHeight(this.options.flameHeight));
    program.float("uGust", this._gust);
    program.float(
      "uSpawnChance",
      0.02 * clampFuel(this.options.fuel) * (1 + this._gust)
    );
    this._bindTexture(0, this.particleStateA, program.loc("uParticleState"));
    this._bindTexture(1, this.particleMetaA, program.loc("uParticleMeta"));
    this._bindTexture(2, this.velA, program.loc("uVel"));
    this._bindTexture(3, this.pointTex, program.loc("uEmitterPoints"));
    this.gl.drawArrays(gl.TRIANGLES, 0, 3);
    this._swapParticles();
    this._frameSeed += 1;
  }

  step(dt, time, quality = 1) {
    if (!this.gl || this._lost) return;
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

  _bgColor(css) {
    if (!this._bgCache) this._bgCache = new Map();
    if (this._bgCache.has(css)) return this._bgCache.get(css);
    const value = parseCssColor(css);
    this._bgCache.set(css, value);
    return value;
  }

  _renderBloom() {
    const gl = this.gl;
    const P = this.context.P;
    const H = this.context.H;
    const canvasW = this.glCanvas.width;
    const canvasH = this.glCanvas.height;

    const down = this.programs.bloomDown;
    this._runPass(down, this.bloomA, (p) => {
      p.vec2("uCanvasSize", canvasW, canvasH);
      p.ivec2("uGridSize", P, H);
      p.float("uO", this.context.O);
      p.float("uBlend", this._blend());
      this._bindTexture(0, this.stateA, p.loc("uState"));
      this._bindTexture(1, this.detail0A, p.loc("uDetail0"));
      this._bindTexture(2, this.detail1A, p.loc("uDetail1"));
      this._bindTexture(3, this.detailTex, p.loc("uDetailNoise"));
      this._bindTexture(4, this.lutTex, p.loc("uLut"));
      this._bindTexture(5, this.toneTex, p.loc("uTone"));
    });

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _renderParticles() {
    if (!this.options.sparks || this.pointCount === 0) return;
    const gl = this.gl;
    const program = this.programs.particleDraw;
    program.use();
    program.vec2("uCanvasSize", this.glCanvas.width, this.glCanvas.height);
    program.float("uO", this.context.O);
    this._bindTexture(0, this.particleStateA, program.loc("uParticleState"));
    this._bindTexture(1, this.particleMetaA, program.loc("uParticleMeta"));
    this._bindTexture(2, this.paletteTex, program.loc("uPalette"));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.LINES, 0, SPARK_POOL * 2);
    gl.disable(gl.BLEND);
  }

  _renderComposite() {
    const gl = this.gl;
    const opts = this.options;
    const P = this.context.P;
    const H = this.context.H;
    const canvasW = this.glCanvas.width;
    const canvasH = this.glCanvas.height;
    const program = this.programs.composite;
    const bg = this._bgColor(opts.background);
    const flicker = 0.72 + 0.28 * this.noise.noise2(1.9 * this._time, 4.2);
    const emberAlpha = clamp(
      flicker * Math.min(1.2, clampFuel(opts.fuel)) * 0.85,
      0,
      1
    );
    const hasBackground = opts.background && opts.background !== "transparent";

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasW, canvasH);
    program.use();
    program.ivec2("uSize", canvasW, canvasH);
    program.ivec2("uGridSize", P, H);
    program.vec2("uCanvasSize", canvasW, canvasH);
    program.vec2("uBloomSize", this.bloomW, this.bloomH);
    program.float("uO", this.context.O);
    program.float("uBlend", this._blend());
    program.float("uAvg", this._avgBrightness);
    program.float("uEmberAlpha", emberAlpha);
    program.float("uHasBackground", hasBackground ? 1 : 0);
    program.float("uHasSmoke", opts.smoke ? 1 : 0);
    program.float("uHasBody", opts.showTextBody ? 1 : 0);
    program.float("uHasBloom", opts.bloom ? 1 : 0);
    program.vec4(
      "uBackground",
      bg[0] * bg[3],
      bg[1] * bg[3],
      bg[2] * bg[3],
      bg[3]
    );
    this._bindTexture(0, this.stateA, program.loc("uState"));
    this._bindTexture(1, this.detail0A, program.loc("uDetail0"));
    this._bindTexture(2, this.detail1A, program.loc("uDetail1"));
    this._bindTexture(3, this.detailTex, program.loc("uDetailNoise"));
    this._bindTexture(4, this.lutTex, program.loc("uLut"));
    this._bindTexture(5, this.toneTex, program.loc("uTone"));
    this._bindTexture(6, this.bodyTex, program.loc("uBody"));
    this._bindTexture(7, this.emberTex, program.loc("uEmber"));
    this._bindTexture(8, this.bloomA, program.loc("uBloom"));
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this._draw();
  }

  render(ctx) {
    if (!this.gl || this._lost || !this.fbo) return;
    this._avgBrightness = clamp(
      Number(this.options.fuel) * 0.55,
      0.15,
      1
    );
    if (this.options.bloom) this._renderBloom();
    this._renderComposite();
    this._renderParticles();

    const cw = this.context.canvas.width;
    const ch = this.context.canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(this.glCanvas, 0, 0, cw, ch);

    if (this.options.overlayText && this.context.textOverlayCanvas) {
      ctx.save();
      ctx.globalCompositeOperation =
        this.options.overlayBlendMode || "source-over";
      ctx.globalAlpha = clamp(
        Number(this.options.overlayOpacity ?? 0.82),
        0,
        1
      );
      ctx.drawImage(this.context.textOverlayCanvas, 0, 0, cw, ch);
      ctx.restore();
    }
  }

  pointerSplat(simX, simY, impulseX, impulseY, radius = 8) {
    if (!this.gl || this._lost || !this.velA) return;
    const program = this.programs.pointer;
    this._runPass(program, this.velB, (p) => {
      p.vec2("uPointer", simX, simY);
      p.vec2("uImpulse", impulseX, impulseY);
      p.float("uRadius", radius);
      this._bindTexture(0, this.velA, p.loc("uVel"));
    });
    this._swapVelocity();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  destroy() {
    const gl = this.gl;
    if (gl) {
      this._deleteFields();
      for (const key of [
        "lutTex",
        "toneTex",
        "detailTex",
        "paletteTex",
        "permTex",
      ]) {
        if (this[key] && this[key].tex) gl.deleteTexture(this[key].tex);
        this[key] = null;
      }
      if (this.programs) {
        for (const program of Object.values(this.programs)) {
          program.delete();
        }
        this.programs = null;
      }
      if (this.glCanvas) {
        this.glCanvas.removeEventListener("webglcontextlost", this._onLost);
        this.glCanvas.removeEventListener(
          "webglcontextrestored",
          this._onRestored
        );
      }
    }
    this.gl = null;
    this.glCanvas = null;
    this.context = null;
  }
}
