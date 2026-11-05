export const LUT_SIZE = 1024;
export const T_MAX = 1.5;
export const kelvin = (t) => 500 + 1100 * t;

const lobe = (t, e, o, a) => {
  const l = (t - e) / (t < e ? o : a);
  return Math.exp(-0.5 * l * l);
};

/**
 * Planckian blackbody spectrum integrated over CIE 1931 piecewise Gaussian lobes (380nm - 780nm)
 * @param {number} t Temperature in Kelvin
 */
export const blackbody = (t) => {
  let e = 0,
    o = 0,
    a = 0;
  for (let l = 380; l <= 780; l += 4) {
    const r = 1e-9 * l;
    const n = 1 / (Math.pow(1e6 * r, 5) * (Math.exp(0.014388 / (r * t)) - 1));
    e +=
      n *
      (1.056 * lobe(l, 599.8, 37.9, 31) +
        0.362 * lobe(l, 442, 16, 26.7) -
        0.065 * lobe(l, 501.1, 20.4, 26.2));
    o += n * (0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1));
    a += n * (1.217 * lobe(l, 437, 11.8, 36) + 0.681 * lobe(l, 459, 26, 13.8));
  }
  const l = Math.max(0, 3.2406 * e - 1.5372 * o - 0.4986 * a);
  const r = Math.max(0, -0.9689 * e + 1.8758 * o + 0.0415 * a);
  const n = Math.max(0, 0.0557 * e - 0.204 * o + 1.057 * a);
  const i = Math.max(1e-30, 0.2126 * l + 0.7152 * r + 0.0722 * n);
  return { r: l / i, g: r / i, b: n / i, Y: o };
};

let sharedLUTs = null;

/**
 * Lazily computes and caches the blackbody color LUTs, tone-mapping LUT,
 * spark palette, and 128x128 tileable multi-octave detail texture.
 */
export function getSharedLUTs() {
  if (sharedLUTs) return sharedLUTs;

  const r = 128;
  const detailNoise = new Float32Array(r * r);
  const lutR = new Float32Array(LUT_SIZE);
  const lutG = new Float32Array(LUT_SIZE);
  const lutB = new Float32Array(LUT_SIZE);
  const sparkPalette = [];
  const refY = blackbody(1600).Y;

  for (let t = 0; t < LUT_SIZE; t += 1) {
    const e = blackbody(kelvin((t / (LUT_SIZE - 1)) * T_MAX));
    const o = Math.pow(e.Y / refY, 0.42);
    lutR[t] = e.r * o;
    lutG[t] = e.g * o;
    lutB[t] = e.b * o;
  }

  const toneSize = 2048;
  const toneMax = 8;
  const toneLUT = new Uint8ClampedArray(toneSize);
  for (let t = 0; t < toneSize; t += 1) {
    const e = (t / (toneSize - 1)) * toneMax;
    toneLUT[t] = 255 * Math.pow(1 - Math.exp(-e), 0.625);
  }

  {
    let t = 4242;
    const e = () => ((t = (16807 * t) % 2147483647), t / 2147483647);
    const o = (v) => v * v * (3 - 2 * v);
    for (const [freq, amp] of [
      [8, 0.5],
      [16, 0.3],
      [32, 0.2],
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
    refY,
  };
  return sharedLUTs;
}
