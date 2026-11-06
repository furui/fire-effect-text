import { clamp } from "./noise.js";

export const IGNITION = 0.28;
export const BURN = 6.5;
export const HEAT = 2.4;
export const SOOT = 0.9;
export const BUOYANCY = 210;
export const VORTICITY = 14;
export const ITERATIONS = 35;
export const MIN_ITERATIONS = 12;
export const COOLING = 1.5;
export const TURBULENCE = 150;
export const DETAIL = 0.9;
export const DETAIL_SCALE = 3;
export const MAX_CELLS = 28000;
export const MIN_GRID_WIDTH = 48;
export const MIN_GRID_HEIGHT = 40;
export const MAX_SPARKS = 420;
export const SPARK_POOL = 512;
export const MAX_SUBSTEPS = 4;
export const EXPOSURE = 3.1;

export const FUEL_RANGE = [0.2, 2.5];
export const FLAME_HEIGHT_RANGE = [0.15, 3.0];
export const SIM_SCALE_RANGE = [1.8, 6.0];

export const clampFuel = (value) => {
  const numeric = Number(value);
  return clamp(
    Number.isFinite(numeric) ? numeric : 1.15,
    FUEL_RANGE[0],
    FUEL_RANGE[1]
  );
};

export const clampFlameHeight = (value) => {
  const numeric = Number(value);
  return clamp(
    Number.isFinite(numeric) ? numeric : 1.0,
    FLAME_HEIGHT_RANGE[0],
    FLAME_HEIGHT_RANGE[1]
  );
};

export const clampSimScale = (value, fallback = 3.0) =>
  clamp(Number(value) || fallback, SIM_SCALE_RANGE[0], SIM_SCALE_RANGE[1]);

export const OVERLAY_BLEND_MODES = Object.freeze([
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
  "lighter",
]);

export const DEFAULT_OPTIONS = {
  text: "FIRE",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontSize: 96,
  fontWeight: "900",
  fontStyle: "normal",
  letterSpacing: "0px",
  fuel: 1.15,
  wind: 0,
  autoWind: true,
  smoke: true,
  sparks: true,
  bloom: true,
  showTextBody: true,
  overlayText: false,
  overlayBlendMode: "source-over",
  overlayColor: "ember",
  overlayOpacity: 0.82,
  overlayStrokeColor: "rgba(255, 165, 70, 0.75)",
  overlayStrokeWidth: 1.5,
  interactive: true,
  pointerStrength: 1.0,
  paused: false,
  flameHeight: 1.0,
  background: "#07090f",
  simScale: 3.0,
  flameHeadroom: 1.35,
  paddingX: 0.55,
  paddingBottom: 0.35,
  width: null,
  height: null,
  renderer: "auto",
  fallback: true,
};

export const LAYOUT_KEYS = Object.freeze([
  "text",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "simScale",
  "flameHeadroom",
  "flameHeight",
  "paddingX",
  "paddingBottom",
  "width",
  "height",
]);

export const OVERLAY_STYLE_KEYS = Object.freeze([
  "overlayColor",
  "overlayStrokeColor",
  "overlayStrokeWidth",
]);

export const FONT_KEYS = Object.freeze([
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
]);
