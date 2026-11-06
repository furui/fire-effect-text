export const RENDERER_CHAIN = Object.freeze(["webgpu", "webgl2", "canvas2d"]);

export const RENDERERS = RENDERER_CHAIN;

export function isRendererName(value) {
  return RENDERER_CHAIN.includes(value);
}

/**
 * Ordered list of backends to try for a requested renderer.
 * `auto` always walks the full chain. An explicit renderer walks the
 * remaining chain only when fallback is enabled.
 */
export function selectBackends(requested = "auto", fallback = true) {
  if (requested !== "auto" && !isRendererName(requested)) {
    return [...RENDERER_CHAIN];
  }
  if (requested === "auto") {
    return [...RENDERER_CHAIN];
  }
  const start = RENDERER_CHAIN.indexOf(requested);
  const chain = RENDERER_CHAIN.slice(start);
  return fallback ? [...chain] : [requested];
}
