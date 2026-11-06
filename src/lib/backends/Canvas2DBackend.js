import { clamp } from "../noise.js";
import { T_MAX, LUT_SIZE } from "../blackbody.js";
import {
  IGNITION,
  BURN,
  HEAT,
  SOOT,
  BUOYANCY,
  VORTICITY,
  ITERATIONS,
  MIN_ITERATIONS,
  COOLING,
  TURBULENCE,
  DETAIL,
  DETAIL_SCALE,
  MAX_CELLS,
  MIN_GRID_WIDTH,
  MIN_GRID_HEIGHT,
  MAX_SPARKS,
  MAX_SUBSTEPS,
  EXPOSURE,
  clampFuel,
  clampFlameHeight,
  clampSimScale,
} from "../physics.js";

/**
 * Canvas2D reference backend.
 *
 * Grid field names:
 *   velX / velY        velocity in grid cells per second
 *   temp               temperature (0 .. T_MAX)
 *   fuel               unburnt fuel
 *   soot               soot density
 *   detail0X/Y         advected detail coordinates for the first noise layer
 *   detail1X/Y         advected detail coordinates for the second noise layer
 *   coarseTurbX/Y      low-resolution turbulence noise fields
 *
 * The 2x supersampled flame buffer is `flameCanvas`; `smokeCanvas` is 1x and
 * `bloomCanvas` is quarter resolution.
 */
export class Canvas2DBackend {
  constructor() {
    this.name = "canvas2d";
    this.options = null;
    this.context = null;
    this._time = 0;
    this._seed = 20261;
    this._rand = () => {
      this._seed = (16807 * this._seed) % 2147483647;
      return this._seed / 2147483647;
    };
  }

  async init(context) {
    this.context = context;
    this.options = context.options;
    this.noise = context.noise;
    this.luts = context.luts;
    this._applyContext(context);
    this._allocate();
    this._resetSimulation(true);
  }

  setOptions(options) {
    this.options = options;
  }

  resetTiming() {
    this.accumTime = 0;
  }

  resize(context) {
    this.context = context;
    this.options = context.options;
    this.noise = context.noise;
    this.luts = context.luts;

    const prev = this._gridKey;
    this._applyContext(context);
    const gridChanged = prev !== this._gridKey;

    if (gridChanged) {
      this._allocate();
      this._resetSimulation(true);
    } else if (context.resetSimulation) {
      this._resetSimulation(false);
    }
  }

  _applyContext(context) {
    this.gridW = context.P;
    this.gridH = context.H;
    this.O = context.O;
    this.dpr = context.dpr;
    this.canvas = context.canvas;
    this.flameHeadroom = context.textLayout ? context.textLayout.headroom : 0;
    this.emitterPoints = context.emitterPoints || [];
    this.backingWidth = context.backingWidth;
    this.backingHeight = context.backingHeight;
    this._gridKey = `${this.gridW}x${this.gridH}:${this.backingWidth}x${this.backingHeight}`;
  }

  _allocate() {
    const gridW = this.gridW;
    const gridH = this.gridH;
    const total = gridW * gridH;

    this.velX = new Float32Array(total);
    this.velY = new Float32Array(total);
    this.temp = new Float32Array(total);
    this.fuel = new Float32Array(total);
    this.soot = new Float32Array(total);

    this.scratchVelX = new Float32Array(total);
    this.scratchVelY = new Float32Array(total);
    this.scratchTemp = new Float32Array(total);
    this.scratchFuel = new Float32Array(total);
    this.scratchSoot = new Float32Array(total);

    this.backX = new Float32Array(total);
    this.backY = new Float32Array(total);
    this.pressure = new Float32Array(total);
    this.divergence = new Float32Array(total);
    this.curl = new Float32Array(total);
    this.vignette = new Float32Array(total);

    for (let row = 0; row < gridH; row += 1) {
      for (let col = 0; col < gridW; col += 1) {
        const edge = Math.min(col, gridW - 1 - col) / (0.12 * gridW);
        const rise = row / (0.22 * gridH);
        this.vignette[row * gridW + col] =
          Math.min(1, edge * edge) * Math.min(1, rise);
      }
    }

    this.detail0X = new Float32Array(total);
    this.detail0Y = new Float32Array(total);
    this.detail1X = new Float32Array(total);
    this.detail1Y = new Float32Array(total);
    this.scratchDetail = new Float32Array(total);

    this.detailPhase = 0;
    this.detailPeriod = 0.7;
    this.detailHalfPeriod = 0.5 * this.detailPeriod;

    this.coarseScale = 4;
    this.coarseW = Math.ceil(gridW / this.coarseScale) + 2;
    this.coarseH = Math.ceil(gridH / this.coarseScale) + 2;
    this.coarseTurbX = new Float32Array(this.coarseW * this.coarseH);
    this.coarseTurbY = new Float32Array(this.coarseW * this.coarseH);

    this.rowFalloff = new Float32Array(gridH);
    for (let row = 0; row < gridH; row += 1) {
      this.rowFalloff[row] = Math.min(
        1,
        Math.max(0.15, (gridH - 1 - row) / (0.18 * gridH))
      );
    }

    this.edgeTaper = new Float32Array(2 * gridW);
    for (let col = 0; col < 2 * gridW; col += 1) {
      const e = Math.min(col, 2 * gridW - 1 - col) / (2 * gridW * 0.08);
      this.edgeTaper[col] = e >= 1 ? 1 : e * e * (3 - 2 * e);
    }

    this.flameCanvas = document.createElement("canvas");
    this.flameCanvas.width = 2 * gridW;
    this.flameCanvas.height = 2 * gridH;
    this.flameCtx = this.flameCanvas.getContext("2d");
    this.flameImage = this.flameCtx.createImageData(2 * gridW, 2 * gridH);

    this.smokeCanvas = document.createElement("canvas");
    this.smokeCanvas.width = gridW;
    this.smokeCanvas.height = gridH;
    this.smokeCtx = this.smokeCanvas.getContext("2d");
    this.smokeImage = this.smokeCtx.createImageData(gridW, gridH);

    this.bloomCanvas = document.createElement("canvas");
    this.bloomCanvas.width = Math.max(4, gridW >> 2) + 4;
    this.bloomCanvas.height = Math.max(4, gridH >> 2) + 4;
    this.bloomCtx = this.bloomCanvas.getContext("2d");

    this.sparksList = [];
    this.avgBrightness = 0.6;
    this.accumTime = 0;
    this.warmupSteps = 18;
    this.windSmooth = 0;
    this.gust = 0;
  }

  _resetSimulation(initial) {
    this.velX.fill(0);
    this.velY.fill(0);
    this.temp.fill(0);
    this.fuel.fill(0);
    this.soot.fill(0);
    this.scratchVelX.fill(0);
    this.scratchVelY.fill(0);
    this.scratchTemp.fill(0);
    this.scratchFuel.fill(0);
    this.scratchSoot.fill(0);
    this.backX.fill(0);
    this.backY.fill(0);
    this.pressure.fill(0);
    this.divergence.fill(0);
    this.curl.fill(0);
    this.detail0X.fill(0);
    this.detail0Y.fill(0);
    this.detail1X.fill(0);
    this.detail1Y.fill(0);

    this._resetDetailCoords(this.detail0X, this.detail0Y, 0);
    this._resetDetailCoords(this.detail1X, this.detail1Y, 57);
    this.detailPhase = 0.7;
    this.windSmooth = 0;
    this.gust = 0;
    this.accumTime = 0;
    this.sparksList.length = 0;
    this.avgBrightness = 0.6;

    const steps = initial ? 6 : 2;
    for (let i = 0; i < steps; i += 1) {
      this._stepSimulation(1 / 60, i / 60, 1);
      this._stepSparks(1 / 60);
    }
    this.warmupSteps = initial ? 18 : 4;
  }

  _resetDetailCoords(tx, ty, offset) {
    const gridW = this.gridW;
    const gridH = this.gridH;
    for (let row = 0; row < gridH; row += 1) {
      for (let col = 0; col < gridW; col += 1) {
        tx[row * gridW + col] = col + offset;
        ty[row * gridW + col] = row + 0.37 * offset;
      }
    }
  }

  step(dt, time, quality = 1) {
    this._time = time;
    let targetWind = Number(this.options.wind) || 0;
    if (this.options.autoWind) {
      targetWind += 0.25 * this.noise.noise2(0.05 * time, 1.3);
    }
    this.windSmooth +=
      (targetWind - this.windSmooth) * (1 - Math.exp(-2 * dt));
    this.gust = Math.max(0, this.gust - 0.8 * dt);

    this.accumTime += dt;
    if (this.warmupSteps > 0) {
      const extra = Math.min(this.warmupSteps, 2);
      this.warmupSteps -= extra;
      this.accumTime += extra / 60;
    }

    const maxSubsteps = quality < 0.7 ? 2 : MAX_SUBSTEPS;
    let substeps = 0;
    while (this.accumTime > 0 && substeps < maxSubsteps) {
      this._stepSimulation(1 / 60, time, quality);
      this._stepSparks(1 / 60);
      this.accumTime -= 1 / 60;
      substeps += 1;
    }
    this.accumTime = Math.min(this.accumTime, 0);
  }

  render(ctx) {
    this._renderFlameBuffer();
    this._renderSmokeBuffer();
    this._composite(ctx);
  }

  _splatFuel(field, x, y, amount) {
    const gridW = this.gridW;
    const gridH = this.gridH;
    const l = x - 0.5;
    const r = y - 0.5;
    const n = Math.floor(l);
    const i = Math.floor(r);
    if (n < 0 || i < 0 || n >= gridW - 1 || i >= gridH - 1) return;
    const s = l - n;
    const c = r - i;
    const h = i * gridW + n;
    field[h] += amount * (1 - s) * (1 - c);
    field[h + 1] += amount * s * (1 - c);
    field[h + gridW] += amount * (1 - s) * c;
    field[h + gridW + 1] += amount * s * c;
  }

  _splatTempMax(x, y, value) {
    const gridW = this.gridW;
    const gridH = this.gridH;
    const a = Math.floor(x);
    const l = Math.floor(y);
    if (a < 0 || l < 0 || a >= gridW || l >= gridH) return;
    const r = l * gridW + a;
    if (this.temp[r] < value) this.temp[r] = value;
  }

  _sampleBilinear(field, x, y) {
    const gridW = this.gridW;
    const gridH = this.gridH;
    const a = clamp(x - 0.5, 0, gridW - 1.001);
    const l = clamp(y - 0.5, 0, gridH - 1.001);
    const r = 0 | a;
    const n = 0 | l;
    const i = a - r;
    const s = l - n;
    const c = n * gridW + r;
    const h = field[c] + (field[c + 1] - field[c]) * i;
    return h + (field[c + gridW] + (field[c + gridW + 1] - field[c + gridW]) * i - h) * s;
  }

  _spawnSpark(x, y, boost = 1) {
    if (!this.options.sparks || this.sparksList.length > MAX_SPARKS) return;
    const a = this._rand;
    const flameReach = clampFlameHeight(this.options.flameHeight);
    const sparkVyScale = Math.sqrt(flameReach);
    this.sparksList.push({
      x,
      y,
      px: x,
      py: y,
      vx: 30 * (a() - 0.5) * boost,
      vy: -(30 + 60 * a()) * boost * sparkVyScale,
      heat: 0.75 + 0.25 * a(),
      life: 1.0 + 2.0 * a(),
      age: 0,
      flutter: 10 * a(),
    });
  }

  _injectTextFuel(dt, time) {
    const fuelSetting = clampFuel(this.options.fuel);
    const strength = fuelSetting * (1 + 0.8 * this.gust);
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
      const nVal =
        0.42 +
        0.58 *
          Math.max(
            0,
            1.4 *
              this.noise.noise3(
                0.18 * pt.x,
                0.18 * pt.y,
                1.85 * time + pt.phase
              ) +
              0.5
          );
      const u = pt.weight * nVal * strength * dt * densityNorm;
      if (u > 0) {
        this._splatFuel(this.fuel, pt.x, pt.y - 0.4, 5.2 * u);
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

  _stepSimulation(dt, time, quality = 1) {
    const gridW = this.gridW;
    const gridH = this.gridH;
    const total = gridW * gridH;
    const {
      velX,
      velY,
      temp,
      fuel,
      soot,
      coarseTurbX,
      coarseTurbY,
      rowFalloff,
      curl,
    } = this;

    this._injectTextFuel(dt, time);

    let windForce = 28 * this.windSmooth;
    if (this.options.autoWind) {
      windForce += 4 * this.noise.noise2(0.4 * time, 9.7);
    }
    const damp = Math.exp(-2 * dt);
    const gust = this.gust;

    const flameReach = clampFlameHeight(this.options.flameHeight);
    const coolingRate = COOLING * Math.max(0.35, 1.35 - 0.35 * flameReach);

    for (let e = 0; e < total; e += 1) {
      let temperature = temp[e];
      let fuelValue = fuel[e];
      if (fuelValue > 1e-4 && temperature > IGNITION) {
        let burned = BURN * fuelValue * dt * (1 + 0.6 * gust);
        if (burned > fuelValue) burned = fuelValue;
        fuelValue -= burned;
        temperature += burned * HEAT;
        soot[e] += burned * SOOT;
      }
      temperature -=
        dt *
        (coolingRate * temperature +
          1.2 * temperature * temperature * temperature * temperature);
      temp[e] =
        temperature < 0 ? 0 : temperature > T_MAX ? T_MAX : temperature;
      fuel[e] = fuelValue * (1 - 0.5 * dt);
      const sootValue = soot[e] * (1 - 0.05 * dt);
      soot[e] = sootValue > 3 ? 3 : sootValue;
      velY[e] -= dt * BUOYANCY * flameReach * temp[e];
      if (temp[e] < 0.25) {
        velY[e] *= damp * (1 - 4 * temp[e]) + 4 * temp[e];
      }
    }

    const windBlend = 1 - Math.exp(-2.5 * dt);
    for (let row = 0; row < gridH; row += 1) {
      const rowOffset = row * gridW;
      let avgVx = 0;
      for (let col = 0; col < gridW; col += 1) avgVx += velX[rowOffset + col];
      avgVx /= gridW;
      const deltaVx =
        (windForce * (1 - row / gridH + 0.3) - avgVx) * windBlend;
      for (let col = 0; col < gridW; col += 1) velX[rowOffset + col] += deltaVx;
    }

    const coarseW = this.coarseW;
    const coarseH = this.coarseH;
    const scale = this.coarseScale;
    for (let row = 0; row < coarseH; row += 1) {
      for (let col = 0; col < coarseW; col += 1) {
        coarseTurbX[row * coarseW + col] = this.noise.noise3(
          1.3 * col,
          1.3 * row + 3.5 * time,
          1.4 * time
        );
        coarseTurbY[row * coarseW + col] = this.noise.noise3(
          1.3 * col + 31.7,
          1.3 * row + 3.5 * time,
          1.4 * time
        );
      }
    }

    for (let row = 0; row < gridH; row += 1) {
      const oy = row / scale;
      const ay = Math.min(coarseH - 2, 0 | oy);
      const ly = oy - ay;
      for (let col = 0; col < gridW; col += 1) {
        const idx = row * gridW + col;
        const temperature = temp[idx];
        if (temperature < 0.05) continue;
        const ox = col / scale;
        const sx = Math.min(coarseW - 2, 0 | ox);
        const hx = ox - sx;
        const f = ay * coarseW + sx;
        const d =
          (coarseTurbX[f] * (1 - hx) + coarseTurbX[f + 1] * hx) * (1 - ly) +
          (coarseTurbX[f + coarseW] * (1 - hx) +
            coarseTurbX[f + coarseW + 1] * hx) *
            ly;
        const p =
          (coarseTurbY[f] * (1 - hx) + coarseTurbY[f + 1] * hx) * (1 - ly) +
          (coarseTurbY[f + coarseW] * (1 - hx) +
            coarseTurbY[f + coarseW + 1] * hx) *
            ly;
        const b =
          TURBULENCE *
          dt *
          Math.min(1, 1.5 * temperature) *
          rowFalloff[row];
        velX[idx] += d * b;
        velY[idx] += p * b * 0.6;
      }
    }

    for (let row = 1; row < gridH - 1; row += 1) {
      for (let col = 1; col < gridW - 1; col += 1) {
        const idx = row * gridW + col;
        curl[idx] =
          0.5 *
          (velY[idx + 1] -
            velY[idx - 1] -
            (velX[idx + gridW] - velX[idx - gridW]));
      }
    }
    for (let row = 2; row < gridH - 2; row += 1) {
      for (let col = 2; col < gridW - 2; col += 1) {
        const idx = row * gridW + col;
        const l = 0.5 * (Math.abs(curl[idx + 1]) - Math.abs(curl[idx - 1]));
        const r =
          0.5 * (Math.abs(curl[idx + gridW]) - Math.abs(curl[idx - gridW]));
        const n = Math.sqrt(l * l + r * r) + 1e-5;
        const i =
          curl[idx] * VORTICITY * dt * (0.4 + Math.min(1, 2 * temp[idx]));
        velX[idx] += (r / n) * i;
        velY[idx] -= (l / n) * i;
      }
    }

    this._projectPressure(quality);

    const maxCol = gridW - 1.001;
    const maxRow = gridH - 1.001;
    const { backX, backY } = this;
    for (let row = 0; row < gridH; row += 1) {
      for (let col = 0; col < gridW; col += 1) {
        const idx = row * gridW + col;
        const bx = col - dt * velX[idx];
        const by = row - dt * velY[idx];
        backX[idx] = bx < 0 ? 0 : bx > maxCol ? maxCol : bx;
        backY[idx] = by < 0 ? 0 : by > maxRow ? maxRow : by;
      }
    }

    this._advectField(this.velX, this.scratchVelX);
    this._advectField(this.velY, this.scratchVelY);
    this._advectField(this.temp, this.scratchTemp);
    this._advectField(this.fuel, this.scratchFuel);
    this._advectField(this.soot, this.scratchSoot);

    for (const coordField of [
      this.detail0X,
      this.detail0Y,
      this.detail1X,
      this.detail1Y,
    ]) {
      this._advectField(coordField, this.scratchDetail);
      coordField.set(this.scratchDetail);
    }

    const prevPhase = this.detailPhase;
    this.detailPhase += dt;
    if (this.detailPhase >= this.detailPeriod) {
      this.detailPhase -= this.detailPeriod;
      this._resetDetailCoords(
        this.detail0X,
        this.detail0Y,
        this._rand() * this.luts.detailSize
      );
    }
    if (
      prevPhase < this.detailHalfPeriod &&
      this.detailPhase >= this.detailHalfPeriod
    ) {
      this._resetDetailCoords(
        this.detail1X,
        this.detail1Y,
        this._rand() * this.luts.detailSize
      );
    }

    [this.velX, this.scratchVelX] = [this.scratchVelX, this.velX];
    [this.velY, this.scratchVelY] = [this.scratchVelY, this.velY];
    [this.temp, this.scratchTemp] = [this.scratchTemp, this.temp];
    [this.fuel, this.scratchFuel] = [this.scratchFuel, this.fuel];
    [this.soot, this.scratchSoot] = [this.scratchSoot, this.soot];

    for (let col = 0; col < gridW; col += 1) {
      const idx = (gridH - 1) * gridW + col;
      if (this.velY[idx] > 0) this.velY[idx] = 0;
    }

    this._projectPressure(quality);
  }

  _advectField(src, dst) {
    const gridW = this.gridW;
    const total = gridW * this.gridH;
    const { backX, backY } = this;
    for (let idx = 0; idx < total; idx += 1) {
      const ox = backX[idx];
      const oy = backY[idx];
      const rx = 0 | ox;
      const ry = 0 | oy;
      const ix = ox - rx;
      const sy = oy - ry;
      const c = ry * gridW + rx;
      const h = src[c] + (src[c + 1] - src[c]) * ix;
      const f = src[c + gridW] + (src[c + gridW + 1] - src[c + gridW]) * ix;
      dst[idx] = h + (f - h) * sy;
    }
  }

  _projectPressure(quality = 1) {
    const gridW = this.gridW;
    const gridH = this.gridH;
    const { velX, velY, pressure, divergence } = this;

    for (let row = 0; row < gridH; row += 1) {
      for (let col = 0; col < gridW; col += 1) {
        const idx = row * gridW + col;
        const a = col < gridW - 1 ? velX[idx + 1] : velX[idx];
        const l = col > 0 ? velX[idx - 1] : velX[idx];
        const r = row < gridH - 1 ? velY[idx + gridW] : -velY[idx];
        const n = row > 0 ? velY[idx - gridW] : velY[idx];
        divergence[idx] = -0.5 * (a - l + r - n);
      }
    }

    const omega = 1.82;
    const target = Math.max(
      MIN_ITERATIONS,
      Math.round(ITERATIONS * Math.max(0.3, Math.min(1, quality)))
    );
    for (let step = 0; step < 2 * target; step += 1) {
      const parity = 1 & step;
      for (let row = 0; row < gridH; row += 1) {
        const isBottom = row === gridH - 1;
        for (let col = (row + parity) & 1; col < gridW; col += 2) {
          const idx = row * gridW + col;
          const neighbors =
            (col > 0 ? pressure[idx - 1] : 0) +
            (col < gridW - 1 ? pressure[idx + 1] : 0) +
            (row > 0 ? pressure[idx - gridW] : 0) +
            (isBottom ? 0 : pressure[idx + gridW]);
          const value = (divergence[idx] + neighbors) / (isBottom ? 3 : 4);
          pressure[idx] += omega * (value - pressure[idx]);
        }
      }
    }

    for (let row = 0; row < gridH; row += 1) {
      for (let col = 0; col < gridW; col += 1) {
        const idx = row * gridW + col;
        const a = col < gridW - 1 ? pressure[idx + 1] : 0;
        const l = col > 0 ? pressure[idx - 1] : 0;
        const r = row < gridH - 1 ? pressure[idx + gridW] : pressure[idx];
        const n = row > 0 ? pressure[idx - gridW] : 0;
        velX[idx] -= 0.5 * (a - l);
        velY[idx] -= 0.5 * (r - n);
      }
    }
  }

  _renderFlameBuffer() {
    const gridW = this.gridW;
    const gridH = this.gridH;
    const {
      temp,
      detail0X,
      detail0Y,
      detail1X,
      detail1Y,
      edgeTaper,
      flameImage,
      flameCtx,
    } = this;
    const {
      detailSize,
      detailNoise,
      lutR,
      lutG,
      lutB,
      toneSize,
      toneMax,
      toneLUT,
    } = this.luts;

    const data = flameImage.data;
    const w2 = 2 * gridW;
    const h2 = 2 * gridH;
    const lutScale = (LUT_SIZE - 1) / T_MAX;
    const toneScale = (toneSize - 1) / toneMax;
    const blend =
      1 - Math.abs(1 - (this.detailPhase / this.detailPeriod) * 2);

    let lumSum = 0;

    for (let py = 0; py < h2; py += 1) {
      const oy = clamp(0.5 * (py + 0.5) - 0.5, 0, gridH - 1.001);
      const my = 0 | oy;
      const xy = oy - my;

      for (let px = 0; px < w2; px += 1) {
        const ux = clamp(0.5 * (px + 0.5) - 0.5, 0, gridW - 1.001);
        const wx = 0 | ux;
        const sx = ux - wx;
        const c = my * gridW + wx;
        const t = temp[c] + (temp[c + 1] - temp[c]) * sx;
        let v =
          (t +
            (temp[c + gridW] +
              (temp[c + gridW + 1] - temp[c + gridW]) * sx -
              t) *
              xy) *
          edgeTaper[px];
        const a = 4 * (py * w2 + px);

        if (v > 0.15) {
          const tx0 =
            detail0X[c] +
            (detail0X[c + 1] - detail0X[c]) * sx +
            (detail0X[c + gridW] -
              detail0X[c] +
              (detail0X[c + gridW + 1] -
                detail0X[c + gridW] -
                (detail0X[c + 1] - detail0X[c])) *
                sx) *
              xy;
          const ty0 =
            detail0Y[c] +
            (detail0Y[c + 1] - detail0Y[c]) * sx +
            (detail0Y[c + gridW] -
              detail0Y[c] +
              (detail0Y[c + gridW + 1] -
                detail0Y[c + gridW] -
                (detail0Y[c + 1] - detail0Y[c])) *
                sx) *
              xy;
          const tx1 =
            detail1X[c] +
            (detail1X[c + 1] - detail1X[c]) * sx +
            (detail1X[c + gridW] -
              detail1X[c] +
              (detail1X[c + gridW + 1] -
                detail1X[c + gridW] -
                (detail1X[c + 1] - detail1X[c])) *
                sx) *
              xy;
          const ty1 =
            detail1Y[c] +
            (detail1Y[c + 1] - detail1Y[c]) * sx +
            (detail1Y[c + gridW] -
              detail1Y[c] +
              (detail1Y[c + gridW + 1] -
                detail1Y[c + gridW] -
                (detail1Y[c + 1] - detail1Y[c])) *
                sx) *
              xy;

          const l0 =
            detailNoise[
              (((ty0 * DETAIL_SCALE) | 0) & (detailSize - 1)) * detailSize +
                (((tx0 * DETAIL_SCALE) | 0) & (detailSize - 1))
            ];
          const l1 =
            detailNoise[
              (((ty1 * DETAIL_SCALE) | 0) & (detailSize - 1)) * detailSize +
                (((tx1 * DETAIL_SCALE) | 0) & (detailSize - 1))
            ];
          v *= 1 + DETAIL * (l0 * blend + l1 * (1 - blend) - 0.5);
          if (v > T_MAX) v = T_MAX;
        }

        if (v < 0.2) {
          data[a] = 0;
          data[a + 1] = 0;
          data[a + 2] = 0;
          data[a + 3] = 0;
          continue;
        }

        const lutIndex = (v * lutScale) | 0;
        const e = lutR[lutIndex] * EXPOSURE;
        lumSum += e;
        const lIdx = (e * toneScale) | 0;
        const rIdx = (lutG[lutIndex] * EXPOSURE * toneScale) | 0;
        const bIdx = (lutB[lutIndex] * EXPOSURE * toneScale) | 0;

        const rOut = toneLUT[lIdx < toneSize ? lIdx : toneSize - 1];
        const gOut = toneLUT[rIdx < toneSize ? rIdx : toneSize - 1];
        const bOut = toneLUT[bIdx < toneSize ? bIdx : toneSize - 1];
        data[a] = rOut;
        data[a + 1] = gOut;
        data[a + 2] = bOut;
        data[a + 3] = Math.min(
          255,
          Math.max(rOut, gOut, bOut, ((v - 0.2) * 640) | 0)
        );
      }
    }

    flameCtx.putImageData(flameImage, 0, 0);
    const m = clamp((lumSum / (w2 * h2)) * 14, 0.15, 1);
    this.avgBrightness += 0.25 * (m - this.avgBrightness);
  }

  _renderSmokeBuffer() {
    if (!this.options.smoke) return;
    const gridW = this.gridW;
    const gridH = this.gridH;
    const total = gridW * gridH;
    const { soot, temp, vignette, smokeImage, smokeCtx, avgBrightness } = this;
    const data = smokeImage.data;

    for (let idx = 0; idx < total; idx += 1) {
      const sootValue = soot[idx];
      const a = 4 * idx;
      const l = (1 - Math.exp(-1.5 * sootValue)) * vignette[idx];
      const row = (idx / gridW) | 0;
      const n = Math.min(
        1,
        1.6 * temp[idx] + 0.5 * avgBrightness * (row / gridH) * (row / gridH)
      );
      data[a] = 52 + 150 * n;
      data[a + 1] = 50 + 70 * n;
      data[a + 2] = 58 + 20 * n;
      data[a + 3] = 205 * l;
    }
    smokeCtx.putImageData(smokeImage, 0, 0);
  }

  _stepSparks(dt) {
    const gridW = this.gridW;
    const gridH = this.gridH;
    const list = this.sparksList;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const sp = list[i];
      sp.age += dt;
      sp.px = sp.x;
      sp.py = sp.y;
      const vxField = this._sampleBilinear(this.velX, sp.x, sp.y);
      const vyField = this._sampleBilinear(this.velY, sp.x, sp.y);
      const blend = 1 - Math.exp(-3.2 * dt);
      sp.vx +=
        (vxField - sp.vx) * blend +
        40 * Math.sin(9 * sp.age + sp.flutter) * dt;
      sp.vy += (vyField - sp.vy) * blend + 12 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.heat -= dt * (0.22 + (0.5 * sp.age) / sp.life);
      if (
        sp.age > sp.life ||
        sp.heat <= 0 ||
        sp.y < -10 ||
        sp.x < -20 ||
        sp.x > gridW + 20 ||
        sp.y > gridH + 10
      ) {
        list.splice(i, 1);
      }
    }
  }

  _composite(ctx) {
    const opts = this.options;
    const canvas = this.canvas;
    const cw = canvas.width;
    const ch = canvas.height;
    const O = this.O;
    const time = this._time;

    ctx.clearRect(0, 0, cw, ch);

    if (opts.background && opts.background !== "transparent") {
      ctx.fillStyle = opts.background;
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
      amb.addColorStop(0, `rgba(255, 115, 35, ${0.14 * this.avgBrightness})`);
      amb.addColorStop(1, "rgba(255, 115, 35, 0)");
      ctx.fillStyle = amb;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }

    if (opts.smoke) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.smokeCanvas, 0, 0, cw, ch);
      ctx.restore();
    }

    if (opts.showTextBody && this.context.textBodyCanvas) {
      ctx.drawImage(this.context.textBodyCanvas, 0, 0, cw, ch);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const flicker = 0.72 + 0.28 * this.noise.noise2(1.9 * time, 4.2);
      ctx.globalAlpha = clamp(
        flicker * Math.min(1.2, clampFuel(opts.fuel)) * 0.85,
        0,
        1
      );
      ctx.drawImage(this.context.textEmberCanvas, 0, 0, cw, ch);
      ctx.restore();
    }

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(this.flameCanvas, 0, 0, cw, ch);

    if (opts.bloom) {
      const f = this.bloomCanvas.width;
      const d = this.bloomCanvas.height;
      this.bloomCtx.clearRect(0, 0, f, d);
      this.bloomCtx.drawImage(this.flameCanvas, 2, 2, f - 4, d - 4);
      const px = (2 / (f - 4)) * cw;
      const py = (2 / (d - 4)) * ch;
      ctx.globalAlpha = 0.34;
      ctx.drawImage(this.bloomCanvas, -px, -py, cw + 2 * px, ch + 2 * py);
      ctx.globalAlpha = 0.18;
      ctx.drawImage(
        this.bloomCanvas,
        -px * 2.5,
        -py * 2.5,
        cw + 5 * px,
        ch + 5 * py
      );
    }
    ctx.restore();

    if (opts.overlayText && this.context.textOverlayCanvas) {
      ctx.save();
      ctx.globalCompositeOperation = opts.overlayBlendMode || "source-over";
      ctx.globalAlpha = clamp(Number(opts.overlayOpacity ?? 0.82), 0, 1);
      ctx.drawImage(this.context.textOverlayCanvas, 0, 0, cw, ch);
      ctx.restore();
    }

    if (opts.sparks && this.sparksList.length > 0) {
      const palette = this.luts.sparkPalette;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const sp of this.sparksList) {
        const cIdx = clamp((63 * sp.heat) | 0, 0, 63);
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
  }

  pointerSplat(simX, simY, impulseX, impulseY, radius = 8) {
    const gridW = this.gridW;
    const gridH = this.gridH;
    const x0 = Math.max(0, Math.floor(simX - 2 * radius));
    const x1 = Math.min(gridW - 1, Math.ceil(simX + 2 * radius));
    const y0 = Math.max(0, Math.floor(simY - 2 * radius));
    const y1 = Math.min(gridH - 1, Math.ceil(simY + 2 * radius));

    for (let row = y0; row <= y1; row += 1) {
      for (let col = x0; col <= x1; col += 1) {
        const ox = col - simX;
        const oy = row - simY;
        const weight = Math.exp(-(ox * ox + oy * oy) / (radius * radius));
        this.velX[row * gridW + col] += impulseX * weight * 0.14;
        this.velY[row * gridW + col] += impulseY * weight * 0.14;
      }
    }
  }

  destroy() {
    this.flameCanvas = null;
    this.smokeCanvas = null;
    this.bloomCanvas = null;
    this.sparksList = [];
    this.context = null;
  }
}
