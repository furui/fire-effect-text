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

export const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const NOISE = `
precision highp usampler2D;
uniform usampler2D uPerm;
uint permAt(int i) { return texelFetch(uPerm, ivec2(i, 0), 0).r; }
const vec3 GRAD3[12] = vec3[12](
  vec3(1.0, 1.0, 0.0), vec3(-1.0, 1.0, 0.0), vec3(1.0, -1.0, 0.0), vec3(-1.0, -1.0, 0.0),
  vec3(1.0, 0.0, 1.0), vec3(-1.0, 0.0, 1.0), vec3(1.0, 0.0, -1.0), vec3(-1.0, 0.0, -1.0),
  vec3(0.0, 1.0, 1.0), vec3(0.0, -1.0, 1.0), vec3(0.0, 1.0, -1.0), vec3(0.0, -1.0, -1.0)
);
float fade3(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float mix1(float a, float b, float t) { return a + t * (b - a); }
float gradDot(uint gi, vec3 p) { return dot(GRAD3[int(gi % 12u)], p); }
float noise3(vec3 p) {
  vec3 pf = floor(p);
  ivec3 pi = ivec3(pf);
  int X = pi.x & 255;
  int Y = pi.y & 255;
  int Z = pi.z & 255;
  vec3 f = p - pf;
  float u = fade3(f.x);
  float v = fade3(f.y);
  float w = fade3(f.z);
  uint A = permAt(X) + uint(Y);
  uint AA = permAt(int(A)) + uint(Z);
  uint AB = permAt(int(A) + 1) + uint(Z);
  uint B = permAt(X + 1) + uint(Y);
  uint BA = permAt(int(B)) + uint(Z);
  uint BB = permAt(int(B) + 1) + uint(Z);
  float x1 = mix1(gradDot(permAt(int(AA)), vec3(f.x, f.y, f.z)), gradDot(permAt(int(BA)), vec3(f.x - 1.0, f.y, f.z)), u);
  float x2 = mix1(gradDot(permAt(int(AB)), vec3(f.x, f.y - 1.0, f.z)), gradDot(permAt(int(BB)), vec3(f.x - 1.0, f.y - 1.0, f.z)), u);
  float y1 = mix1(gradDot(permAt(int(AA) + 1), vec3(f.x, f.y, f.z - 1.0)), gradDot(permAt(int(BA) + 1), vec3(f.x - 1.0, f.y, f.z - 1.0)), u);
  float y2 = mix1(gradDot(permAt(int(AB) + 1), vec3(f.x, f.y - 1.0, f.z - 1.0)), gradDot(permAt(int(BB) + 1), vec3(f.x - 1.0, f.y - 1.0, f.z - 1.0)), u);
  return mix1(mix1(x1, x2, v), mix1(y1, y2, v), w);
}`;

export const HEADER = `#version 300 es
precision highp float;
precision highp int;
uniform ivec2 uSize;
ivec2 cellCoord() { return ivec2(gl_FragCoord.xy); }
vec4 sampleField(sampler2D tex, vec2 p) {
  vec2 c = clamp(p, vec2(0.0), vec2(uSize) - 1.001);
  ivec2 i = ivec2(floor(c));
  vec2 f = c - vec2(i);
  vec4 a = mix(texelFetch(tex, i, 0), texelFetch(tex, i + ivec2(1, 0), 0), f.x);
  vec4 b = mix(texelFetch(tex, i + ivec2(0, 1), 0), texelFetch(tex, i + ivec2(1, 1), 0), f.x);
  return mix(a, b, f.y);
}`;

export function fs(body, header = HEADER) {
  return `${header}\n${body}`;
}

export const INJECT_FS = fs(`
uniform sampler2D uState;
uniform sampler2D uEmitter;
uniform sampler2D uFuelEmitter;
uniform float uTime;
uniform float uDt;
uniform float uFuel;
uniform float uDensity;
uniform float uGust;
out vec4 outColor;
${NOISE}
void main() {
  ivec2 p = cellCoord();
  vec4 s = texelFetch(uState, p, 0);
  vec4 em = texelFetch(uEmitter, p, 0);
  vec4 fem = texelFetch(uFuelEmitter, p, 0);
  if (fem.r > 0.0) {
    float nFuel = 0.42 + 0.58 * max(0.0, 1.4 * noise3(vec3(0.18 * float(p.x), 0.18 * float(p.y), 1.85 * uTime + fem.g)) + 0.5);
    float u = fem.r * nFuel * uFuel * (1.0 + 0.8 * uGust) * uDt * uDensity;
    if (u > 0.0) s.g += 5.2 * u;
  }
  if (em.r > 0.0) {
    float nTemp = 0.42 + 0.58 * max(0.0, 1.4 * noise3(vec3(0.18 * float(p.x), 0.18 * float(p.y), 1.85 * uTime + em.b)) + 0.5);
    s.r = max(s.r, 0.64 * min(1.25, uFuel) * nTemp);
  }
  outColor = s;
}`);

export const STATE_FS = fs(`
uniform sampler2D uState;
uniform float uDt;
uniform float uFlameReach;
uniform float uCooling;
uniform float uGust;
out vec4 outColor;
void main() {
  ivec2 p = cellCoord();
  vec4 s = texelFetch(uState, p, 0);
  float temp = s.r;
  float fuel = s.g;
  float soot = s.b;
  float coolingRate = uCooling * max(0.35, 1.35 - 0.35 * uFlameReach);
  if (fuel > 1e-4 && temp > 0.28) {
    float burned = 6.5 * fuel * uDt * (1.0 + 0.6 * uGust);
    if (burned > fuel) burned = fuel;
    fuel -= burned;
    temp += burned * 2.4;
    soot += burned * 0.9;
  }
  temp -= uDt * (coolingRate * temp + 1.2 * temp * temp * temp * temp);
  temp = clamp(temp, 0.0, 1.5);
  fuel *= (1.0 - 0.5 * uDt);
  soot = min(3.0, soot * (1.0 - 0.05 * uDt));
  outColor = vec4(temp, fuel, soot, 0.0);
}`);

export const VELOCITY_FS = fs(`
uniform sampler2D uVel;
uniform sampler2D uState;
uniform sampler2D uWind;
uniform float uTime;
uniform float uDt;
uniform float uFlameReach;
uniform float uWindForce;
uniform float uWindBlend;
uniform float uDamp;
uniform float uTurbulence;
out vec4 outColor;
${NOISE}
float coarseTurb(float x, float y, float t, float offset) {
  float ox = x * 0.25;
  float oy = y * 0.25;
  float cx = floor(ox);
  float cy = floor(oy);
  float fx = ox - cx;
  float fy = oy - cy;
  float n00 = noise3(vec3(1.3 * cx + offset, 1.3 * cy + 3.5 * t, 1.4 * t));
  float n10 = noise3(vec3(1.3 * (cx + 1.0) + offset, 1.3 * cy + 3.5 * t, 1.4 * t));
  float n01 = noise3(vec3(1.3 * cx + offset, 1.3 * (cy + 1.0) + 3.5 * t, 1.4 * t));
  float n11 = noise3(vec3(1.3 * (cx + 1.0) + offset, 1.3 * (cy + 1.0) + 3.5 * t, 1.4 * t));
  return mix(mix(n00, n10, fx), mix(n01, n11, fx), fy);
}
void main() {
  ivec2 p = cellCoord();
  vec2 vel = texelFetch(uVel, p, 0).xy;
  vec4 s = texelFetch(uState, p, 0);
  float temp = s.r;
  vel.y -= uDt * 210.0 * uFlameReach * temp;
  if (temp < 0.25) {
    vel.y *= uDamp * (1.0 - 4.0 * temp) + 4.0 * temp;
  }
  float avgVx = texelFetch(uWind, ivec2(0, p.y), 0).r;
  float H = float(uSize.y);
  float delta = (uWindForce * (1.0 - float(p.y) / H + 0.3) - avgVx) * uWindBlend;
  vel.x += delta;
  float k = min(1.0, max(0.15, float(uSize.y - 1 - p.y) / (0.18 * H)));
  float n1 = coarseTurb(float(p.x), float(p.y), uTime, 0.0);
  float n2 = coarseTurb(float(p.x), float(p.y), uTime, 31.7);
  float b = uTurbulence * uDt * min(1.0, 1.5 * temp) * k;
  vel.x += n1 * b;
  vel.y += n2 * b * 0.6;
  outColor = vec4(vel, 0.0, 0.0);
}`);

export const WIND_FS = fs(`
uniform sampler2D uVel;
out vec4 outColor;
void main() {
  int row = int(gl_FragCoord.y);
  float sum = 0.0;
  for (int col = 0; col < uSize.x; col += 1) {
    sum += texelFetch(uVel, ivec2(col, row), 0).x;
  }
  outColor = vec4(sum / float(uSize.x), 0.0, 0.0, 0.0);
}`);

export const CURL_FS = fs(`
uniform sampler2D uVel;
out vec4 outColor;
void main() {
  ivec2 p = cellCoord();
  vec2 l = texelFetch(uVel, ivec2(p.x - 1, p.y), 0).xy;
  vec2 r = texelFetch(uVel, ivec2(p.x + 1, p.y), 0).xy;
  vec2 d = texelFetch(uVel, ivec2(p.x, p.y - 1), 0).xy;
  vec2 u = texelFetch(uVel, ivec2(p.x, p.y + 1), 0).xy;
  float curl = 0.5 * (r.y - l.y - (u.x - d.x));
  if (p.x < 1 || p.y < 1 || p.x >= uSize.x - 1 || p.y >= uSize.y - 1) curl = 0.0;
  outColor = vec4(curl, 0.0, 0.0, 0.0);
}`);

export const VORTICITY_FS = fs(`
uniform sampler2D uVel;
uniform sampler2D uCurl;
uniform sampler2D uState;
uniform float uDt;
out vec4 outColor;
void main() {
  ivec2 p = cellCoord();
  vec2 vel = texelFetch(uVel, p, 0).xy;
  if (p.x >= 2 && p.y >= 2 && p.x < uSize.x - 2 && p.y < uSize.y - 2) {
    float c = texelFetch(uCurl, p, 0).r;
    float l = 0.5 * (abs(texelFetch(uCurl, ivec2(p.x + 1, p.y), 0).r) - abs(texelFetch(uCurl, ivec2(p.x - 1, p.y), 0).r));
    float r = 0.5 * (abs(texelFetch(uCurl, ivec2(p.x, p.y + 1), 0).r) - abs(texelFetch(uCurl, ivec2(p.x, p.y - 1), 0).r));
    float n = sqrt(l * l + r * r) + 1e-5;
    float temp = texelFetch(uState, p, 0).r;
    float i = c * 14.0 * uDt * (0.4 + min(1.0, 2.0 * temp));
    vel.x += (r / n) * i;
    vel.y -= (l / n) * i;
  }
  outColor = vec4(vel, 0.0, 0.0);
}`);

export const DIVERGENCE_FS = fs(`
uniform sampler2D uVel;
out vec4 outColor;
void main() {
  ivec2 p = cellCoord();
  float a = (p.x < uSize.x - 1) ? texelFetch(uVel, ivec2(p.x + 1, p.y), 0).x : texelFetch(uVel, p, 0).x;
  float l = (p.x > 0) ? texelFetch(uVel, ivec2(p.x - 1, p.y), 0).x : texelFetch(uVel, p, 0).x;
  float r = (p.y < uSize.y - 1) ? texelFetch(uVel, ivec2(p.x, p.y + 1), 0).y : -texelFetch(uVel, p, 0).y;
  float n = (p.y > 0) ? texelFetch(uVel, ivec2(p.x, p.y - 1), 0).y : texelFetch(uVel, p, 0).y;
  outColor = vec4(-0.5 * (a - l + r - n), 0.0, 0.0, 0.0);
}`);

export const PRESSURE_FS = fs(`
uniform sampler2D uPressure;
uniform sampler2D uDiv;
uniform float uParity;
out vec4 outColor;
void main() {
  ivec2 p = cellCoord();
  float c = texelFetch(uPressure, p, 0).r;
  if (float((p.x + p.y) & 1) != uParity) {
    outColor = vec4(c, 0.0, 0.0, 0.0);
    return;
  }
  float l = (p.x > 0) ? texelFetch(uPressure, ivec2(p.x - 1, p.y), 0).r : 0.0;
  float r = (p.x < uSize.x - 1) ? texelFetch(uPressure, ivec2(p.x + 1, p.y), 0).r : 0.0;
  float n = (p.y > 0) ? texelFetch(uPressure, ivec2(p.x, p.y - 1), 0).r : 0.0;
  bool bottom = p.y == uSize.y - 1;
  float s = bottom ? 0.0 : texelFetch(uPressure, ivec2(p.x, p.y + 1), 0).r;
  float value = (texelFetch(uDiv, p, 0).r + l + r + n + s) / (bottom ? 3.0 : 4.0);
  outColor = vec4(c + 1.82 * (value - c), 0.0, 0.0, 0.0);
}`);

export const GRADIENT_FS = fs(`
uniform sampler2D uVel;
uniform sampler2D uPressure;
out vec4 outColor;
void main() {
  ivec2 p = cellCoord();
  vec2 vel = texelFetch(uVel, p, 0).xy;
  float a = (p.x < uSize.x - 1) ? texelFetch(uPressure, ivec2(p.x + 1, p.y), 0).r : 0.0;
  float l = (p.x > 0) ? texelFetch(uPressure, ivec2(p.x - 1, p.y), 0).r : 0.0;
  float r = (p.y < uSize.y - 1) ? texelFetch(uPressure, ivec2(p.x, p.y + 1), 0).r : texelFetch(uPressure, p, 0).r;
  float n = (p.y > 0) ? texelFetch(uPressure, ivec2(p.x, p.y - 1), 0).r : 0.0;
  vel.x -= 0.5 * (a - l);
  vel.y -= 0.5 * (r - n);
  outColor = vec4(vel, 0.0, 0.0);
}`);

export const BACKTRACE_FS = fs(`
uniform sampler2D uVel;
uniform float uDt;
out vec4 outColor;
void main() {
  ivec2 p = cellCoord();
  vec2 vel = texelFetch(uVel, p, 0).xy;
  vec2 pos = vec2(float(p.x), float(p.y)) - uDt * vel;
  vec2 maxPos = vec2(uSize) - vec2(1.001);
  outColor = vec4(clamp(pos, vec2(0.0), maxPos), 0.0, 0.0);
}`);

export const ADVECT_FS = fs(`
uniform sampler2D uSource;
uniform sampler2D uBack;
out vec4 outColor;
void main() {
  ivec2 p = cellCoord();
  vec2 back = texelFetch(uBack, p, 0).xy;
  outColor = sampleField(uSource, back);
}`);

export const ADVECT_VELOCITY_FS = fs(`
uniform sampler2D uSource;
uniform sampler2D uBack;
out vec4 outColor;
void main() {
  ivec2 p = cellCoord();
  vec2 back = texelFetch(uBack, p, 0).xy;
  vec4 v = sampleField(uSource, back);
  if (p.y == uSize.y - 1 && v.y > 0.0) v.y = 0.0;
  outColor = vec4(v.xy, 0.0, 0.0);
}`);

export const ADVECT_DETAIL_FS = fs(`
uniform sampler2D uSource;
uniform sampler2D uBack;
uniform float uReset;
uniform float uOffset;
out vec4 outColor;
void main() {
  ivec2 p = cellCoord();
  vec2 back = texelFetch(uBack, p, 0).xy;
  vec4 v = sampleField(uSource, back);
  if (uReset > 0.5) {
    v = vec4(float(p.x) + uOffset, float(p.y) + 0.37 * uOffset, 0.0, 0.0);
  }
  outColor = v;
}`);

export const POINTER_FS = fs(`
uniform sampler2D uVel;
uniform vec2 uPointer;
uniform vec2 uImpulse;
uniform float uRadius;
out vec4 outColor;
void main() {
  ivec2 p = cellCoord();
  vec2 vel = texelFetch(uVel, p, 0).xy;
  vec2 d = vec2(float(p.x), float(p.y)) - uPointer;
  float w = exp(-dot(d, d) / (uRadius * uRadius));
  vel += uImpulse * w * 0.14;
  outColor = vec4(vel, 0.0, 0.0);
}`);

export const PARTICLE_UPDATE_FS = fs(`
layout(location = 0) out vec4 outState;
layout(location = 1) out vec4 outMeta;
uniform sampler2D uParticleState;
uniform sampler2D uParticleMeta;
uniform sampler2D uVel;
uniform sampler2D uEmitterPoints;
uniform int uPointW;
uniform int uCount;
uniform ivec2 uGridSize;
uniform float uDt;
uniform float uSeed;
uniform float uFlameReach;
uniform float uGust;
uniform float uSpawnChance;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2 sampleGrid(vec2 pos) {
  vec2 c = clamp(pos, vec2(0.0), vec2(uGridSize) - 1.001);
  ivec2 i = ivec2(floor(c));
  vec2 f = c - vec2(i);
  vec2 a = mix(texelFetch(uVel, i, 0).xy, texelFetch(uVel, i + ivec2(1, 0), 0).xy, f.x);
  vec2 b = mix(texelFetch(uVel, i + ivec2(0, 1), 0).xy, texelFetch(uVel, i + ivec2(1, 1), 0).xy, f.x);
  return mix(a, b, f.y);
}
void main() {
  ivec2 p = cellCoord();
  vec4 st = texelFetch(uParticleState, p, 0);
  vec4 mt = texelFetch(uParticleMeta, p, 0);
  float x = st.x;
  float y = st.y;
  float vx = st.z;
  float vy = st.w;
  float px = mt.x;
  float py = mt.y;
  float heat = mt.z;
  float age = mt.w;

  if (heat > 0.0) {
    px = x;
    py = y;
    vec2 fieldVel = sampleGrid(vec2(x, y));
    float blend = 1.0 - exp(-3.2 * uDt);
    vx += (fieldVel.x - vx) * blend + 40.0 * sin(9.0 * age + hash2(vec2(float(p.x), 3.1)) * 10.0) * uDt;
    vy += (fieldVel.y - vy) * blend + 12.0 * uDt;
    x += vx * uDt;
    y += vy * uDt;
    heat -= uDt * (0.22 + 0.25 * age);
    age += uDt;
    if (heat <= 0.0 || age > 3.0 || y < -10.0 || x < -20.0 || x > float(uGridSize.x) + 20.0 || y > float(uGridSize.y) + 10.0) {
      heat = 0.0;
    }
  } else if (uCount > 0) {
    float r = hash2(vec2(float(p.x), uSeed));
    int idx = int(r * float(uCount)) % uCount;
    vec4 point = texelFetch(uEmitterPoints, ivec2(idx % uPointW, idx / uPointW), 0);
    float r2 = hash2(vec2(float(p.x) + 17.3, uSeed + 1.0));
    if (point.z > 0.05 && point.w > 0.5 && r2 < uSpawnChance) {
      x = point.x;
      y = point.y - 0.8;
      px = x;
      py = y;
      float r3 = hash2(vec2(float(p.x) + 51.7, uSeed + 2.0));
      float r4 = hash2(vec2(float(p.x) + 91.1, uSeed + 3.0));
      vx = 30.0 * (r3 - 0.5) * (1.0 + uGust);
      vy = -(30.0 + 60.0 * r4) * (1.0 + uGust) * sqrt(uFlameReach);
      heat = 0.75 + 0.25 * r3;
      age = 0.0;
    }
  }
  outState = vec4(x, y, vx, vy);
  outMeta = vec4(px, py, heat, age);
}`);

export const PARTICLE_VERT = `#version 300 es
precision highp float;
uniform sampler2D uParticleState;
uniform sampler2D uParticleMeta;
uniform sampler2D uPalette;
uniform vec2 uCanvasSize;
uniform float uO;
out vec4 vColor;
void main() {
  int index = gl_VertexID >> 1;
  vec4 st = texelFetch(uParticleState, ivec2(index, 0), 0);
  vec4 mt = texelFetch(uParticleMeta, ivec2(index, 0), 0);
  float heat = mt.z;
  if (heat <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec4(0.0);
    return;
  }
  bool previous = (gl_VertexID & 1) == 0;
  float gx = previous ? mt.x : st.x;
  float gy = previous ? mt.y : st.y;
  float px = gx * uO;
  float py = gy * uO;
  gl_Position = vec4(px / (uCanvasSize.x * 0.5) - 1.0, 1.0 - py / (uCanvasSize.y * 0.5), 0.0, 1.0);
  int idx = clamp(int(63.0 * heat), 0, 63);
  vec4 color = texelFetch(uPalette, ivec2(idx, 0), 0);
  float alpha = clamp(1.4 * heat, 0.0, 1.0);
  vColor = vec4(color.rgb * alpha, alpha);
}`;

export const PARTICLE_FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
void main() {
  outColor = vColor;
}`;

export const RENDER_HEADER = `#version 300 es
precision highp float;
precision highp int;
uniform ivec2 uSize;
uniform ivec2 uGridSize;
ivec2 cellCoord() { return ivec2(gl_FragCoord.xy); }
vec4 sampleGrid(sampler2D tex, vec2 p) {
  vec2 c = clamp(p, vec2(0.0), vec2(uGridSize) - 1.001);
  ivec2 i = ivec2(floor(c));
  vec2 f = c - vec2(i);
  vec4 a = mix(texelFetch(tex, i, 0), texelFetch(tex, i + ivec2(1, 0), 0), f.x);
  vec4 b = mix(texelFetch(tex, i + ivec2(0, 1), 0), texelFetch(tex, i + ivec2(1, 1), 0), f.x);
  return mix(a, b, f.y);
}
float edgeTaper(float x) {
  float e = min(x, float(uGridSize.x) - x) / (float(uGridSize.x) * 0.08);
  return e >= 1.0 ? 1.0 : e * e * (3.0 - 2.0 * e);
}`;

export const FLAME_FN = `
uniform sampler2D uState;
uniform sampler2D uDetail0;
uniform sampler2D uDetail1;
uniform sampler2D uDetailNoise;
uniform sampler2D uLut;
uniform sampler2D uTone;
uniform float uBlend;
float detailAt(vec2 coord) {
  ivec2 i = ivec2(coord * 3.0);
  i = ivec2(i.x & 127, i.y & 127);
  return texelFetch(uDetailNoise, i, 0).r;
}
vec4 flameAt(vec2 grid) {
  float temp = sampleGrid(uState, grid).r;
  float v = temp * edgeTaper(grid.x);
  if (v > 0.15) {
    vec2 d0 = sampleGrid(uDetail0, grid).xy;
    vec2 d1 = sampleGrid(uDetail1, grid).xy;
    float l0 = detailAt(d0);
    float l1 = detailAt(d1);
    v *= 1.0 + 0.9 * (l0 * uBlend + l1 * (1.0 - uBlend) - 0.5);
    v = min(v, 1.5);
  }
  if (v < 0.2) return vec4(0.0);
  int idx = int(v * (1023.0 / 1.5));
  vec3 bb = texelFetch(uLut, ivec2(idx, 0), 0).rgb * 3.1;
  float toneScale = 2047.0 / 8.0;
  int lr = int(bb.r * toneScale);
  int lg = int(bb.g * toneScale);
  int lb = int(bb.b * toneScale);
  vec3 tone = vec3(
    texelFetch(uTone, ivec2(clamp(lr, 0, 2047), 0), 0).r,
    texelFetch(uTone, ivec2(clamp(lg, 0, 2047), 0), 0).r,
    texelFetch(uTone, ivec2(clamp(lb, 0, 2047), 0), 0).r
  );
  float alpha = min(1.0, max(max(tone.r, max(tone.g, tone.b)), (v - 0.2) * 640.0 / 255.0));
  return vec4(tone * alpha, alpha);
}`;

export const BLOOM_DOWN_FS = fs(`
uniform vec2 uCanvasSize;
uniform float uO;
out vec4 outColor;
${FLAME_FN}
void main() {
  ivec2 p = cellCoord();
  float bx = (float(p.x) - 2.0) / max(1.0, float(uSize.x - 4));
  float by = (float(p.y) - 2.0) / max(1.0, float(uSize.y - 4));
  if (bx < 0.0 || by < 0.0 || bx > 1.0 || by > 1.0) {
    outColor = vec4(0.0);
    return;
  }
  vec2 canvasPos = vec2(bx, by) * uCanvasSize;
  vec2 footprint = uCanvasSize / vec2(float(uSize.x - 4), float(uSize.y - 4));
  vec4 bloom = vec4(0.0);
  for (int dy = 0; dy < 4; dy += 1) {
    for (int dx = 0; dx < 4; dx += 1) {
      vec2 offset = (vec2(float(dx), float(dy)) + 0.5) / 4.0 - 0.5;
      bloom += flameAt((canvasPos + offset * footprint) / uO);
    }
  }
  outColor = bloom / 16.0;
}`, RENDER_HEADER);

export const BLUR_FS = fs(`
uniform sampler2D uSource;
uniform vec2 uDir;
out vec4 outColor;
void main() {
  ivec2 p = cellCoord();
  float weights[9] = float[9](0.05, 0.09, 0.12, 0.15, 0.18, 0.15, 0.12, 0.09, 0.05);
  vec4 sum = vec4(0.0);
  for (int i = -4; i <= 4; i += 1) {
    ivec2 q = clamp(ivec2(p.x + int(uDir.x * float(i)), p.y + int(uDir.y * float(i))), ivec2(0), uSize - 1);
    sum += texelFetch(uSource, q, 0) * weights[i + 4];
  }
  outColor = sum;
}`);

export const COMPOSITE_FS = fs(`
uniform sampler2D uBody;
uniform sampler2D uEmber;
uniform sampler2D uBloom;
uniform vec2 uCanvasSize;
uniform vec2 uBloomSize;
uniform float uO;
uniform float uAvg;
uniform float uEmberAlpha;
uniform float uHasBackground;
uniform float uHasSmoke;
uniform float uHasBody;
uniform float uHasBloom;
uniform vec4 uBackground;
out vec4 outColor;
${FLAME_FN}
vec4 sampleBloom(vec2 p) {
  vec2 c = clamp(p, vec2(0.0), uBloomSize - 1.001);
  ivec2 i = ivec2(floor(c));
  vec2 f = c - vec2(i);
  vec4 a = mix(texelFetch(uBloom, i, 0), texelFetch(uBloom, i + ivec2(1, 0), 0), f.x);
  vec4 b = mix(texelFetch(uBloom, i + ivec2(0, 1), 0), texelFetch(uBloom, i + ivec2(1, 1), 0), f.x);
  return mix(a, b, f.y);
}
void main() {
  ivec2 p = ivec2(int(gl_FragCoord.x), uSize.y - 1 - int(gl_FragCoord.y));
  vec2 uv = (vec2(p) + 0.5) / uCanvasSize;
  vec2 grid = (vec2(p) + 0.5) / uO;
  vec4 dst = vec4(0.0);
  if (uHasBackground > 0.5) {
    dst = uBackground;
    float dist = length(vec2(float(p.x) - uCanvasSize.x * 0.5, float(p.y) - uCanvasSize.y * 0.65));
    float amb = max(0.0, 1.0 - dist / (max(uCanvasSize.x, uCanvasSize.y) * 0.58));
    dst.rgb += vec3(1.0, 0.45, 0.14) * (0.14 * uAvg * amb);
  }
  if (uHasSmoke > 0.5) {
    vec4 s = sampleGrid(uState, grid);
    float o = min(grid.x, float(uGridSize.x) - grid.x) / (0.12 * float(uGridSize.x));
    float a = grid.y / (0.22 * float(uGridSize.y));
    float vig = min(1.0, o * o) * min(1.0, a);
    float alpha = (1.0 - exp(-1.5 * s.b)) * vig;
    float n = min(1.0, 1.6 * s.r + 0.5 * uAvg * pow(grid.y / float(uGridSize.y), 2.0));
    vec3 color = vec3(52.0 + 150.0 * n, 50.0 + 70.0 * n, 58.0 + 20.0 * n) / 255.0;
    vec4 smoke = vec4(color * (205.0 * alpha / 255.0), 205.0 * alpha / 255.0);
    dst = smoke + dst * (1.0 - smoke.a);
  }
  if (uHasBody > 0.5) {
    vec4 body = texture(uBody, uv);
    body.rgb *= body.a;
    dst = body + dst * (1.0 - body.a);
    vec4 ember = texture(uEmber, uv);
    ember.rgb *= ember.a * uEmberAlpha;
    ember.a *= uEmberAlpha;
    dst += ember;
  }
  dst += flameAt(grid);
  if (uHasBloom > 0.5) {
    vec2 bp = uv * uBloomSize - 0.5;
    dst += sampleBloom(bp) * 0.06;
    vec2 wide = 0.5 + (uv - 0.5) / 2.5;
    dst += sampleBloom(wide * uBloomSize - 0.5) * 0.03;
  }
  outColor = dst;
}`, RENDER_HEADER);

// __MORE_SHADERS__

