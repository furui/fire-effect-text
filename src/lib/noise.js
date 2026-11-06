export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

/**
 * Seeded 2D & 3D gradient noise generator (compatible replacement for canvas_gallery/runtime createNoise)
 * @param {number} [seed=77]
 */
export function createNoise(seed = 77) {
  let s = seed | 0 || 1;
  const rand = () => {
    s = (16807 * s) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const p = new Uint8Array(512);
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);

  const grad3 = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
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
    permutation: p,
    grad3,
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
    },
  };
}
