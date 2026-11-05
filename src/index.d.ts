import type { CSSProperties, ForwardRefExoticComponent, RefAttributes } from "react";

export type OverlayBlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "hard-light"
  | "soft-light"
  | "color-dodge"
  | "color-burn"
  | "darken"
  | "lighten"
  | "difference"
  | "exclusion"
  | "luminosity"
  | "lighter"
  | GlobalCompositeOperation;

export declare const OVERLAY_BLEND_MODES: readonly OverlayBlendMode[];

export interface FireTextOptions {
  /** Text string to render on fire (supports multi-line with \n) */
  text?: string;
  /** Any CSS font-family string (e.g. "'Cinzel Decorative', serif" or "Impact, sans-serif") */
  fontFamily?: string;
  /** Font size in CSS pixels */
  fontSize?: number;
  /** CSS font-weight (e.g. "700", "900", "bold") */
  fontWeight?: string | number;
  /** CSS font-style ("normal" | "italic") */
  fontStyle?: string;
  /** CSS letter-spacing (e.g. "0px", "2px") */
  letterSpacing?: string;
  /** Flame fuel intensity (0.3 - 2.2, default 1.15) */
  fuel?: number;
  /** Horizontal wind (-1.0 to 1.0, default 0) */
  wind?: number;
  /** Subtle natural wind breeze modulation */
  autoWind?: boolean;
  /** How high the flame reaches / upward buoyancy push multiplier (0.2 - 2.5, default 1.0) */
  flameHeight?: number;
  /** Alias for upward buoyancy multiplier */
  buoyancy?: number;
  /** Pause / freeze the simulation and rendering */
  paused?: boolean;
  /** Render soot/smoke plume behind flames */
  smoke?: boolean;
  /** Render advected flying ember sparks */
  sparks?: boolean;
  /** Render soft thermal bloom glow */
  bloom?: boolean;
  /** Render charred & glowing ember text body inside the fire */
  showTextBody?: boolean;
  /** Render crisp text overlay ON TOP of the fire effect so text isn't obscured */
  overlayText?: boolean;
  /** Canvas blend mode (globalCompositeOperation) for the foreground text overlay */
  overlayBlendMode?: OverlayBlendMode;
  /** Fill style for the overlay text: "ember", "molten", or any CSS color (e.g. "#180b04", "#ffffff") */
  overlayColor?: "ember" | "molten" | string;
  /** Opacity (0.0 - 1.0) of the foreground text overlay */
  overlayOpacity?: number;
  /** Optional stroke color around the foreground overlay text */
  overlayStrokeColor?: string;
  /** Stroke width in CSS pixels for the foreground overlay text (0 to disable) */
  overlayStrokeWidth?: number;
  /** Allow mouse/pointer movement to blow the flames */
  interactive?: boolean;
  /** Canvas background color or "transparent" */
  background?: string;
  /** Simulation cell size in CSS pixels (lower = higher resolution) */
  simScale?: number;
  /** Extra vertical space above text as a multiplier of fontSize */
  flameHeadroom?: number;
  /** Horizontal padding on each side as a multiplier of fontSize */
  paddingX?: number;
  /** Bottom padding below baseline as a multiplier of fontSize */
  paddingBottom?: number;
  /** Explicit canvas CSS width (auto-measured from text if null) */
  width?: number | null;
  /** Explicit canvas CSS height (auto-measured from text if null) */
  height?: number | null;
}

export declare class FireText {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  opts: Required<FireTextOptions>;
  isPaused: boolean;

  constructor(
    target: HTMLCanvasElement | HTMLElement | string,
    options?: FireTextOptions
  );

  setOptions(newOptions: FireTextOptions): this;
  setText(text: string): this;
  setFont(
    fontFamily?: string,
    fontSize?: number,
    fontWeight?: string | number
  ): this;
  resize(): void;
  pause(): this;
  resume(): this;
  togglePause(): boolean;
  start(): this;
  stop(): this;
  destroy(): void;
}

export declare function createFireText(
  target: HTMLCanvasElement | HTMLElement | string,
  options?: FireTextOptions
): FireText;

export interface FireTextReactProps extends FireTextOptions {
  className?: string;
  style?: CSSProperties;
}

export declare const FireTextReact: ForwardRefExoticComponent<
  FireTextReactProps & RefAttributes<FireText>
>;

export declare function createFireTextComponent(
  ReactInstance?: any
): typeof FireTextReact;

export declare function blackbody(kelvinTemp: number): {
  r: number;
  g: number;
  b: number;
  Y: number;
};

export declare function createNoise(seed?: number): {
  noise2(x: number, y: number): number;
  noise3(x: number, y: number, z: number): number;
};

export declare function clamp(v: number, min: number, max: number): number;

export default FireText;
