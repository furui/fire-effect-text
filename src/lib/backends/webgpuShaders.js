export const COMMON = `
struct Params {
  size: vec4<f32>,
  m0: vec4<f32>,
  m1: vec4<f32>,
  m2: vec4<f32>,
  m3: vec4<f32>,
  m4: vec4<f32>,
  canvas: vec4<f32>,
  m5: vec4<f32>,
  m6: vec4<f32>,
  bg: vec4<f32>,
};
@group(0) @binding(0) var<uniform> params: Params;

fn gridSize() -> vec2<i32> {
  return vec2<i32>(i32(params.size.x), i32(params.size.y));
}
fn cellIndex(x: i32, y: i32) -> u32 {
  return u32(y) * u32(params.size.x) + u32(x);
}
fn sampleFieldOffset(
  field: ptr<storage, array<vec4<f32>>, read>,
  pos: vec2<f32>,
  base: u32
) -> vec4<f32> {
  let s = gridSize();
  let c = clamp(pos, vec2<f32>(0.0), vec2<f32>(s) - 1.001);
  let fl = floor(c);
  let i = vec2<i32>(fl);
  let f = c - fl;
  let w = u32(params.size.x);
  let i00 = base + u32(i.y) * w + u32(i.x);
  let a = mix((*field)[i00], (*field)[i00 + 1u], f.x);
  let b = mix((*field)[i00 + w], (*field)[i00 + w + 1u], f.x);
  return mix(a, b, f.y);
}
fn sampleField(field: ptr<storage, array<vec4<f32>>, read>, pos: vec2<f32>) -> vec4<f32> {
  return sampleFieldOffset(field, pos, 0u);
}
fn packColor(c: vec4<f32>) -> u32 {
  let r = u32(clamp(c.r, 0.0, 1.0) * 255.0 + 0.5);
  let g = u32(clamp(c.g, 0.0, 1.0) * 255.0 + 0.5);
  let b = u32(clamp(c.b, 0.0, 1.0) * 255.0 + 0.5);
  let a = u32(clamp(c.a, 0.0, 1.0) * 255.0 + 0.5);
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}
fn unpackColor(v: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(v & 255u) / 255.0,
    f32((v >> 8u) & 255u) / 255.0,
    f32((v >> 16u) & 255u) / 255.0,
    f32((v >> 24u) & 255u) / 255.0
  );
}
`;

export const NOISE = `
@group(0) @binding(9) var<storage, read> perm: array<u32>;
const GRAD3: array<vec3<f32>, 12> = array<vec3<f32>, 12>(
  vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(-1.0, 1.0, 0.0), vec3<f32>(1.0, -1.0, 0.0), vec3<f32>(-1.0, -1.0, 0.0),
  vec3<f32>(1.0, 0.0, 1.0), vec3<f32>(-1.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, -1.0), vec3<f32>(-1.0, 0.0, -1.0),
  vec3<f32>(0.0, 1.0, 1.0), vec3<f32>(0.0, -1.0, 1.0), vec3<f32>(0.0, 1.0, -1.0), vec3<f32>(0.0, -1.0, -1.0)
);
fn fade3(t: f32) -> f32 { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
fn gradDot(gi: u32, p: vec3<f32>) -> f32 { return dot(GRAD3[gi % 12u], p); }
fn noise3(p: vec3<f32>) -> f32 {
  let pf = floor(p);
  let pi = vec3<i32>(pf);
  let X = pi.x & 255;
  let Y = pi.y & 255;
  let Z = pi.z & 255;
  let f = p - pf;
  let u = fade3(f.x);
  let v = fade3(f.y);
  let w = fade3(f.z);
  let A = perm[u32(X)] + u32(Y);
  let AA = perm[A] + u32(Z);
  let AB = perm[A + 1u] + u32(Z);
  let B = perm[u32(X + 1)] + u32(Y);
  let BA = perm[B] + u32(Z);
  let BB = perm[B + 1u] + u32(Z);
  let x1 = mix(gradDot(perm[AA], vec3<f32>(f.x, f.y, f.z)), gradDot(perm[BA], vec3<f32>(f.x - 1.0, f.y, f.z)), u);
  let x2 = mix(gradDot(perm[AB], vec3<f32>(f.x, f.y - 1.0, f.z)), gradDot(perm[BB], vec3<f32>(f.x - 1.0, f.y - 1.0, f.z)), u);
  let y1 = mix(gradDot(perm[AA + 1u], vec3<f32>(f.x, f.y, f.z - 1.0)), gradDot(perm[BA + 1u], vec3<f32>(f.x - 1.0, f.y, f.z - 1.0)), u);
  let y2 = mix(gradDot(perm[AB + 1u], vec3<f32>(f.x, f.y - 1.0, f.z - 1.0)), gradDot(perm[BB + 1u], vec3<f32>(f.x - 1.0, f.y - 1.0, f.z - 1.0)), u);
  return mix(mix(x1, x2, v), mix(y1, y2, v), w);
}
`;

export const WG_INJECT = `${COMMON}
${NOISE}
@group(0) @binding(1) var<storage, read> stateIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> emitter: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> stateOut: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> fuelEmitter: array<vec4<f32>>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  let i = cellIndex(x, y);
  var state = stateIn[i];
  let em = emitter[i];
  let fem = fuelEmitter[i];
  if (fem.r > 0.0) {
    let nFuel = 0.42 + 0.58 * max(0.0, 1.4 * noise3(vec3<f32>(0.18 * f32(x), 0.18 * f32(y), 1.85 * params.m0.y + fem.g)) + 0.5);
    let u = fem.r * nFuel * params.m0.z * (1.0 + 0.8 * params.m1.y) * params.m0.x * params.m2.z;
    if (u > 0.0) { state.g += 5.2 * u; }
  }
  if (em.r > 0.0) {
    let nTemp = 0.42 + 0.58 * max(0.0, 1.4 * noise3(vec3<f32>(0.18 * f32(x), 0.18 * f32(y), 1.85 * params.m0.y + em.b)) + 0.5);
    state.r = max(state.r, 0.64 * min(1.25, params.m0.z) * nTemp);
  }
  stateOut[i] = state;
}`;

export const WG_STATE = `${COMMON}
@group(0) @binding(1) var<storage, read> stateIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> stateOut: array<vec4<f32>>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  let i = cellIndex(x, y);
  let st = stateIn[i];
  var temp = st.r;
  var fuel = st.g;
  var soot = st.b;
  let dt = params.m0.x;
  let coolingRate = params.m1.x * max(0.35, 1.35 - 0.35 * params.m0.w);
  if (fuel > 1e-4 && temp > 0.28) {
    var burned = 6.5 * fuel * dt * (1.0 + 0.6 * params.m1.y);
    burned = min(burned, fuel);
    fuel -= burned;
    temp += burned * 2.4;
    soot += burned * 0.9;
  }
  temp -= dt * (coolingRate * temp + 1.2 * temp * temp * temp * temp);
  temp = clamp(temp, 0.0, 1.5);
  fuel *= (1.0 - 0.5 * dt);
  soot = min(3.0, soot * (1.0 - 0.05 * dt));
  stateOut[i] = vec4<f32>(temp, fuel, soot, 0.0);
}`;

export const WG_VELOCITY = `${COMMON}
${NOISE}
@group(0) @binding(1) var<storage, read> velIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> stateIn: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> wind: array<f32>;
@group(0) @binding(4) var<storage, read_write> velOut: array<vec4<f32>>;
fn coarseTurb(x: f32, y: f32, t: f32, offset: f32) -> f32 {
  let ox = x * 0.25;
  let oy = y * 0.25;
  let cx = floor(ox);
  let cy = floor(oy);
  let fx = ox - cx;
  let fy = oy - cy;
  let n00 = noise3(vec3<f32>(1.3 * cx + offset, 1.3 * cy + 3.5 * t, 1.4 * t));
  let n10 = noise3(vec3<f32>(1.3 * (cx + 1.0) + offset, 1.3 * cy + 3.5 * t, 1.4 * t));
  let n01 = noise3(vec3<f32>(1.3 * cx + offset, 1.3 * (cy + 1.0) + 3.5 * t, 1.4 * t));
  let n11 = noise3(vec3<f32>(1.3 * (cx + 1.0) + offset, 1.3 * (cy + 1.0) + 3.5 * t, 1.4 * t));
  return mix(mix(n00, n10, fx), mix(n01, n11, fx), fy);
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  let i = cellIndex(x, y);
  var vel = velIn[i].xy;
  let temp = stateIn[i].r;
  let dt = params.m0.x;
  vel.y -= dt * 210.0 * params.m0.w * temp;
  if (temp < 0.25) {
    vel.y *= params.m2.x * (1.0 - 4.0 * temp) + 4.0 * temp;
  }
  let H = params.size.y;
  let delta = (params.m1.z * (1.0 - f32(y) / H + 0.3) - wind[u32(y)]) * params.m1.w;
  vel.x += delta;
  let k = min(1.0, max(0.15, f32(s.y - 1 - y) / (0.18 * H)));
  let n1 = coarseTurb(f32(x), f32(y), params.m0.y, 0.0);
  let n2 = coarseTurb(f32(x), f32(y), params.m0.y, 31.7);
  let b = params.m2.y * dt * min(1.0, 1.5 * temp) * k;
  vel.x += n1 * b;
  vel.y += n2 * b * 0.6;
  velOut[i] = vec4<f32>(vel, 0.0, 0.0);
}`;

export const WG_WIND = `${COMMON}
@group(0) @binding(1) var<storage, read> velIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> windOut: array<f32>;
@compute @workgroup_size(1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = i32(gid.x);
  let s = gridSize();
  if (row >= s.y) { return; }
  var sum = 0.0;
  for (var col = 0; col < s.x; col = col + 1) {
    sum += velIn[cellIndex(col, row)].x;
  }
  windOut[u32(row)] = sum / params.size.x;
}`;

export const WG_CURL = `${COMMON}
@group(0) @binding(1) var<storage, read> velIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> curlOut: array<f32>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  var curl = 0.0;
  if (x >= 1 && y >= 1 && x < s.x - 1 && y < s.y - 1) {
    let l = velIn[cellIndex(x - 1, y)].xy;
    let r = velIn[cellIndex(x + 1, y)].xy;
    let d = velIn[cellIndex(x, y - 1)].xy;
    let u = velIn[cellIndex(x, y + 1)].xy;
    curl = 0.5 * (r.y - l.y - (u.x - d.x));
  }
  curlOut[cellIndex(x, y)] = curl;
}`;

export const WG_VORTICITY = `${COMMON}
@group(0) @binding(1) var<storage, read> velIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> curlIn: array<f32>;
@group(0) @binding(3) var<storage, read> stateIn: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> velOut: array<vec4<f32>>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  let i = cellIndex(x, y);
  var vel = velIn[i].xy;
  if (x >= 2 && y >= 2 && x < s.x - 2 && y < s.y - 2) {
    let c = curlIn[i];
    let l = 0.5 * (abs(curlIn[cellIndex(x + 1, y)]) - abs(curlIn[cellIndex(x - 1, y)]));
    let r = 0.5 * (abs(curlIn[cellIndex(x, y + 1)]) - abs(curlIn[cellIndex(x, y - 1)]));
    let n = sqrt(l * l + r * r) + 1e-5;
    let temp = stateIn[i].r;
    let imp = c * 14.0 * params.m0.x * (0.4 + min(1.0, 2.0 * temp));
    vel.x += (r / n) * imp;
    vel.y -= (l / n) * imp;
  }
  velOut[i] = vec4<f32>(vel, 0.0, 0.0);
}`;

export const WG_DIVERGENCE = `${COMMON}
@group(0) @binding(1) var<storage, read> velIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> divOut: array<f32>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  let i = cellIndex(x, y);
  let v = velIn[i].xy;
  let a = select(v.x, velIn[cellIndex(x + 1, y)].x, x < s.x - 1);
  let l = select(v.x, velIn[cellIndex(x - 1, y)].x, x > 0);
  let r = select(-v.y, velIn[cellIndex(x, y + 1)].y, y < s.y - 1);
  let n = select(v.y, velIn[cellIndex(x, y - 1)].y, y > 0);
  divOut[i] = -0.5 * (a - l + r - n);
}`;

export const WG_PRESSURE = `${COMMON}
@group(0) @binding(1) var<storage, read> pressureIn: array<f32>;
@group(0) @binding(2) var<storage, read> divIn: array<f32>;
@group(0) @binding(3) var<storage, read_write> pressureOut: array<f32>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  let i = cellIndex(x, y);
  let c = pressureIn[i];
  let parity = f32((x + y) & 1);
  if (parity != params.m3.x) {
    pressureOut[i] = c;
    return;
  }
  let l = select(0.0, pressureIn[cellIndex(x - 1, y)], x > 0);
  let r = select(0.0, pressureIn[cellIndex(x + 1, y)], x < s.x - 1);
  let n = select(0.0, pressureIn[cellIndex(x, y - 1)], y > 0);
  let bottom = y == s.y - 1;
  let sr = select(pressureIn[cellIndex(x, y + 1)], 0.0, bottom);
  let value = (divIn[i] + l + r + n + sr) / select(4.0, 3.0, bottom);
  pressureOut[i] = c + 1.82 * (value - c);
}`;

export const WG_GRADIENT = `${COMMON}
@group(0) @binding(1) var<storage, read> velIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> pressureIn: array<f32>;
@group(0) @binding(3) var<storage, read_write> velOut: array<vec4<f32>>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  let i = cellIndex(x, y);
  var vel = velIn[i].xy;
  let a = select(0.0, pressureIn[cellIndex(x + 1, y)], x < s.x - 1);
  let l = select(0.0, pressureIn[cellIndex(x - 1, y)], x > 0);
  let r = select(pressureIn[i], pressureIn[cellIndex(x, y + 1)], y < s.y - 1);
  let n = select(0.0, pressureIn[cellIndex(x, y - 1)], y > 0);
  vel.x -= 0.5 * (a - l);
  vel.y -= 0.5 * (r - n);
  velOut[i] = vec4<f32>(vel, 0.0, 0.0);
}`;

export const WG_BACKTRACE = `${COMMON}
@group(0) @binding(1) var<storage, read> velIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> backOut: array<vec4<f32>>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  let i = cellIndex(x, y);
  let pos = vec2<f32>(f32(x), f32(y)) - params.m0.x * velIn[i].xy;
  backOut[i] = vec4<f32>(clamp(pos, vec2<f32>(0.0), vec2<f32>(s) - vec2<f32>(1.001)), 0.0, 0.0);
}`;

export const WG_ADVECT = `${COMMON}
@group(0) @binding(1) var<storage, read> source: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> back: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> destField: array<vec4<f32>>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  let i = cellIndex(x, y);
  destField[i] = sampleField(&source, back[i].xy);
}`;

export const WG_ADVECT_VELOCITY = `${COMMON}
@group(0) @binding(1) var<storage, read> source: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> back: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> destField: array<vec4<f32>>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  let i = cellIndex(x, y);
  var v = sampleField(&source, back[i].xy);
  if (y == s.y - 1 && v.y > 0.0) { v.y = 0.0; }
  destField[i] = vec4<f32>(v.xy, 0.0, 0.0);
}`;

export const WG_ADVECT_DETAIL = `${COMMON}
@group(0) @binding(1) var<storage, read> source: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> back: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> destField: array<vec4<f32>>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  let i = cellIndex(x, y);
  let reset = params.m3.x;
  let off = params.m3.y;
  let base = u32(params.m3.z);
  if (reset > 0.5) {
    destField[base + i] = vec4<f32>(f32(x) + off, f32(y) + 0.37 * off, 0.0, 0.0);
  } else {
    destField[base + i] = sampleFieldOffset(&source, back[i].xy, base);
  }
}`;

export const WG_POINTER = `${COMMON}
@group(0) @binding(1) var<storage, read> velIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velOut: array<vec4<f32>>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let s = gridSize();
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= s.x || y >= s.y) { return; }
  let i = cellIndex(x, y);
  var vel = velIn[i].xy;
  let d = vec2<f32>(f32(x), f32(y)) - params.m5.xy;
  let w = exp(-dot(d, d) / (params.m3.x * params.m3.x));
  vel += params.m5.zw * w * 0.14;
  velOut[i] = vec4<f32>(vel, 0.0, 0.0);
}`;

export const WG_PARTICLE_UPDATE = `${COMMON}
@group(0) @binding(1) var<storage, read> particleStateIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> particleMetaIn: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> vel: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> points: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> particleStateOut: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> particleMetaOut: array<vec4<f32>>;

fn hash2(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}
fn sampleVel(pos: vec2<f32>) -> vec2<f32> {
  let s = gridSize();
  let c = clamp(pos, vec2<f32>(0.0), vec2<f32>(s) - 1.001);
  let fl = floor(c);
  let i = vec2<i32>(fl);
  let f = c - fl;
  let w = u32(params.size.x);
  let i00 = u32(i.y) * w + u32(i.x);
  let a = mix(vel[i00].xy, vel[i00 + 1u].xy, f.x);
  let b = mix(vel[i00 + w].xy, vel[i00 + w + 1u].xy, f.x);
  return mix(a, b, f.y);
}

@compute @workgroup_size(64, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= u32(512)) { return; }
  let st = particleStateIn[index];
  let mt = particleMetaIn[index];
  var x = st.x;
  var y = st.y;
  var vx = st.z;
  var vy = st.w;
  var px = mt.x;
  var py = mt.y;
  var heat = mt.z;
  var age = mt.w;
  let dt = params.m0.x;
  let seed = params.m4.x;
  let spawnChance = params.m4.y;
  let pointW = i32(params.m4.z);
  let count = i32(params.m4.w);

  if (heat > 0.0) {
    px = x;
    py = y;
    let fieldVel = sampleVel(vec2<f32>(x, y));
    let blend = 1.0 - exp(-3.2 * dt);
    vx += (fieldVel.x - vx) * blend + 40.0 * sin(9.0 * age + hash2(vec2<f32>(f32(index), 3.1)) * 10.0) * dt;
    vy += (fieldVel.y - vy) * blend + 12.0 * dt;
    x += vx * dt;
    y += vy * dt;
    heat -= dt * (0.22 + 0.25 * age);
    age += dt;
    if (heat <= 0.0 || age > 3.0 || y < -10.0 || x < -20.0 || x > params.size.x + 20.0 || y > params.size.y + 10.0) {
      heat = 0.0;
    }
  } else if (count > 0) {
    let r = hash2(vec2<f32>(f32(index), seed));
    let idx = i32(r * f32(count)) % count;
    let point = points[u32(idx)];
    let r2 = hash2(vec2<f32>(f32(index) + 17.3, seed + 1.0));
    if (point.z > 0.05 && point.w > 0.5 && r2 < spawnChance) {
      x = point.x;
      y = point.y - 0.8;
      px = x;
      py = y;
      let r3 = hash2(vec2<f32>(f32(index) + 51.7, seed + 2.0));
      let r4 = hash2(vec2<f32>(f32(index) + 91.1, seed + 3.0));
      vx = 30.0 * (r3 - 0.5) * (1.0 + params.m1.y);
      vy = -(30.0 + 60.0 * r4) * (1.0 + params.m1.y) * sqrt(params.m0.w);
      heat = 0.75 + 0.25 * r3;
      age = 0.0;
    }
  }
  particleStateOut[index] = vec4<f32>(x, y, vx, vy);
  particleMetaOut[index] = vec4<f32>(px, py, heat, age);
}`;

export const WG_PARTICLE_VERT = `${COMMON}
@group(0) @binding(1) var<storage, read> particleState: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> particleMeta: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> palette: array<vec4<f32>>;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var out: VSOut;
  let index = vi >> 1u;
  let st = particleState[index];
  let mt = particleMeta[index];
  let heat = mt.z;
  if (heat <= 0.0) {
    out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    out.color = vec4<f32>(0.0);
    return out;
  }
  let previous = (vi & 1u) == 0u;
  let gx = select(st.x, mt.x, previous);
  let gy = select(st.y, mt.y, previous);
  let px = gx * params.canvas.z;
  let py = gy * params.canvas.z;
  out.position = vec4<f32>(
    px / params.canvas.x * 2.0 - 1.0,
    1.0 - py / params.canvas.y * 2.0,
    0.0,
    1.0
  );
  let color = palette[u32(clamp(i32(63.0 * heat), 0, 63))];
  let alpha = clamp(1.4 * heat, 0.0, 1.0);
  out.color = vec4<f32>(color.rgb * alpha, alpha);
  return out;
}`;

export const WG_PARTICLE_FRAG = `
@fragment
fn fs(@location(0) color: vec4<f32>) -> @location(0) vec4<f32> {
  return color;
}`;

export const WG_FLAME_FN = `
fn detailAt(coord: vec2<f32>) -> f32 {
  let ci = vec2<i32>(vec2<i32>(coord * 3.0));
  let x = ci.x & 127;
  let y = ci.y & 127;
  return aux[u32(2048 + y * 128 + x)];
}
fn flameAt(grid: vec2<f32>) -> vec4<f32> {
  let temp = sampleField(&state, grid).r;
  let e = min(grid.x, params.size.x - grid.x) / (params.size.x * 0.08);
  let taper = select(e * e * (3.0 - 2.0 * e), 1.0, e >= 1.0);
  var v = temp * taper;
  if (v > 0.15) {
    let d0 = sampleFieldOffset(&detail, grid, 0u).xy;
    let d1 = sampleFieldOffset(&detail, grid, u32(params.size.x * params.size.y)).xy;
    let l0 = detailAt(d0);
    let l1 = detailAt(d1);
    let blend = params.m6.z;
    v *= 1.0 + 0.9 * (l0 * blend + l1 * (1.0 - blend) - 0.5);
    v = min(v, 1.5);
  }
  if (v < 0.2) { return vec4<f32>(0.0); }
  let idx = u32(v * (1023.0 / 1.5));
  let bb = lut[idx].rgb * 3.1;
  let toneScale = 2047.0 / 8.0;
  let tone = vec3<f32>(
    aux[u32(clamp(i32(bb.r * toneScale), 0, 2047))],
    aux[u32(clamp(i32(bb.g * toneScale), 0, 2047))],
    aux[u32(clamp(i32(bb.b * toneScale), 0, 2047))]
  );
  let alpha = min(1.0, max(max(tone.r, tone.g), max(tone.b, (v - 0.2) * 640.0 / 255.0)));
  return vec4<f32>(tone * alpha, alpha);
}`;

export const WG_BLOOM_DOWN = `${COMMON}
@group(0) @binding(1) var<storage, read> state: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> detail: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> aux: array<f32>;
@group(0) @binding(4) var<storage, read> lut: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> bloomOut: array<u32>;
${WG_FLAME_FN}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let bw = i32(params.canvas.w);
  let bh = i32(params.m5.x);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= bw || y >= bh) { return; }
  let bx = (f32(x) - 2.0) / max(1.0, f32(bw - 4));
  let by = (f32(y) - 2.0) / max(1.0, f32(bh - 4));
  if (bx < 0.0 || by < 0.0 || bx > 1.0 || by > 1.0) {
    bloomOut[u32(y) * u32(bw) + u32(x)] = 0u;
    return;
  }
  let canvasPos = vec2<f32>(bx, by) * params.canvas.xy;
  let footprint = params.canvas.xy / vec2<f32>(f32(bw - 4), f32(bh - 4));
  var bloom = vec4<f32>(0.0);
  for (var dy = 0; dy < 4; dy = dy + 1) {
    for (var dx = 0; dx < 4; dx = dx + 1) {
      let offset = (vec2<f32>(f32(dx), f32(dy)) + 0.5) / 4.0 - 0.5;
      let grid = (canvasPos + offset * footprint) / params.canvas.z;
      bloom += flameAt(grid);
    }
  }
  bloomOut[u32(y) * u32(bw) + u32(x)] = packColor(bloom / 16.0);
}`;

export const WG_BLUR = `${COMMON}
@group(0) @binding(1) var<storage, read> bloomIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> bloomOut: array<u32>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let bw = i32(params.canvas.w);
  let bh = i32(params.m5.x);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= bw || y >= bh) { return; }
  var weights = array<f32, 9>(0.05, 0.09, 0.12, 0.15, 0.18, 0.15, 0.12, 0.09, 0.05);
  var sum = vec4<f32>(0.0);
  let dir = vec2<i32>(i32(params.m3.x), i32(params.m3.y));
  for (var i = -4; i <= 4; i = i + 1) {
    let cx = clamp(x + dir.x * i, 0, bw - 1);
    let cy = clamp(y + dir.y * i, 0, bh - 1);
    sum += unpackColor(bloomIn[u32(cy) * u32(bw) + u32(cx)]) * weights[i + 4];
  }
  bloomOut[u32(y) * u32(bw) + u32(x)] = packColor(sum);
}`;

export const WG_COMPOSITE = `${COMMON}
@group(0) @binding(1) var<storage, read> state: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> detail: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> aux: array<f32>;
@group(0) @binding(4) var<storage, read> lut: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read> body: array<u32>;
@group(0) @binding(6) var<storage, read> ember: array<u32>;
@group(0) @binding(7) var<storage, read> bloom: array<u32>;
${WG_FLAME_FN}
fn sampleBloom(pos: vec2<f32>) -> vec4<f32> {
  let bw = i32(params.canvas.w);
  let bh = i32(params.m5.x);
  let c = clamp(pos, vec2<f32>(0.0), vec2<f32>(f32(bw), f32(bh)) - 1.001);
  let fl = floor(c);
  let i = vec2<i32>(fl);
  let f = c - fl;
  let i00 = u32(i.y) * u32(bw) + u32(i.x);
  let a = mix(unpackColor(bloom[i00]), unpackColor(bloom[i00 + 1u]), f.x);
  let b = mix(unpackColor(bloom[i00 + u32(bw)]), unpackColor(bloom[i00 + u32(bw) + 1u]), f.x);
  return mix(a, b, f.y);
}
@fragment
fn fs(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(frag.xy);
  let cw = i32(params.canvas.x);
  let ch = i32(params.canvas.y);
  let uv = (vec2<f32>(pixel) + 0.5) / params.canvas.xy;
  let grid = (vec2<f32>(pixel) + 0.5) / params.canvas.z;
  var dst = vec4<f32>(0.0);
  if (params.m5.y > 0.5) {
    dst = params.bg;
    let dist = length(vec2<f32>(f32(pixel.x) - params.canvas.x * 0.5, f32(pixel.y) - params.canvas.y * 0.65));
    let amb = max(0.0, 1.0 - dist / (max(params.canvas.x, params.canvas.y) * 0.58));
    dst += vec4<f32>(vec3<f32>(1.0, 0.45, 0.14) * (0.14 * params.m6.w * amb), 0.0);
  }
  if (params.m5.z > 0.5) {
    let s = sampleField(&state, grid);
    let o = min(grid.x, params.size.x - grid.x) / (0.12 * params.size.x);
    let a = grid.y / (0.22 * params.size.y);
    let vig = min(1.0, o * o) * min(1.0, a);
    let alpha = (1.0 - exp(-1.5 * s.b)) * vig;
    let n = min(1.0, 1.6 * s.r + 0.5 * params.m6.w * pow(grid.y / params.size.y, 2.0));
    let color = vec3<f32>(52.0 + 150.0 * n, 50.0 + 70.0 * n, 58.0 + 20.0 * n) / 255.0;
    let smoke = vec4<f32>(color * (205.0 * alpha / 255.0), 205.0 * alpha / 255.0);
    dst = smoke + dst * (1.0 - smoke.a);
  }
  if (params.m5.w > 0.5) {
    let idx = u32(pixel.y) * u32(cw) + u32(pixel.x);
    let bodyColor = unpackColor(body[idx]);
    dst = vec4<f32>(bodyColor.rgb * bodyColor.a, bodyColor.a) + dst * (1.0 - bodyColor.a);
    let emberColor = unpackColor(ember[idx]);
    let emberAlpha = emberColor.a * params.m6.y;
    dst += vec4<f32>(emberColor.rgb * emberAlpha, emberAlpha);
  }
  dst += flameAt(grid);
  if (params.m6.x > 0.5) {
    let bp = uv * vec2<f32>(params.canvas.w, params.m5.x) - 0.5;
    dst += sampleBloom(bp) * 0.06;
    let wide = vec2<f32>(0.5) + (uv - vec2<f32>(0.5)) / 2.5;
    dst += sampleBloom(wide * vec2<f32>(params.canvas.w, params.m5.x) - 0.5) * 0.03;
  }
  return dst;
}`;

export const WG_FULLSCREEN_VERT = `
struct VSOut {
  @builtin(position) position: vec4<f32>,
};
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var out: VSOut;
  out.position = vec4<f32>(positions[vi], 0.0, 1.0);
  return out;
}`;

