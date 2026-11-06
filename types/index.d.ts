export type RendererName = "canvas2d" | "webgl2" | "webgpu";
export type RequestedRenderer = "auto" | RendererName;

export interface RendererChangeInfo {
  requested: RequestedRenderer;
  renderer: RendererName;
  reason?:
    | "requested"
    | "auto"
    | "manual"
    | "unavailable"
    | "init-failed"
    | "context-lost";
}

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
  /** Text to render (supports multi-line with \n). */
  text?: string;
  /** Any CSS font-family string. */
  fontFamily?: string;
  /** Font size in CSS pixels. */
  fontSize?: number;
  /** CSS font-weight. */
  fontWeight?: string | number;
  /** CSS font-style. */
  fontStyle?: string;
  /** CSS letter-spacing. */
  letterSpacing?: string;
  /** Flame fuel intensity (0.2 - 2.5). */
  fuel?: number;
  /** Horizontal wind (-1.0 to 1.0). */
  wind?: number;
  /** Subtle procedural wind modulation. */
  autoWind?: boolean;
  /** Flame reach and upward buoyancy multiplier (0.15 - 3.0). */
  flameHeight?: number;
  /** Pause the simulation and rendering. */
  paused?: boolean;
  /** Render the smoke/soot plume. */
  smoke?: boolean;
  /** Render advected ember sparks. */
  sparks?: boolean;
  /** Render soft thermal bloom. */
  bloom?: boolean;
  /** Render the charred ember text body. */
  showTextBody?: boolean;
  /** Render crisp overlay text on top of the fire. */
  overlayText?: boolean;
  /** Canvas blend mode for the overlay text. */
  overlayBlendMode?: OverlayBlendMode;
  /** "ember", "molten", or any CSS color. */
  overlayColor?: "ember" | "molten" | string;
  /** Overlay opacity (0.0 - 1.0). */
  overlayOpacity?: number;
  /** Optional stroke color around overlay text. */
  overlayStrokeColor?: string;
  /** Overlay stroke width in CSS pixels (0 disables it). */
  overlayStrokeWidth?: number;
  /** Allow pointer click/drag to blow the flames. */
  interactive?: boolean;
  /** Pointer impulse multiplier (0 disables, default 1). */
  pointerStrength?: number;
  /** Canvas background color or "transparent". */
  background?: string;
  /** Simulation cell size in CSS pixels (1.8 - 6.0). */
  simScale?: number;
  /** Extra vertical space above text as a multiplier of fontSize. */
  flameHeadroom?: number;
  /** Horizontal padding on each side as a multiplier of fontSize. */
  paddingX?: number;
  /** Bottom padding below baseline as a multiplier of fontSize. */
  paddingBottom?: number;
  /** Explicit canvas CSS width. */
  width?: number | null;
  /** Explicit canvas CSS height. */
  height?: number | null;
  /** Renderer preference. Defaults to "auto". */
  renderer?: RequestedRenderer;
  /** Fall back down the renderer chain when initialization fails. Defaults to true. */
  fallback?: boolean;
  /** Called after initialization and after each successful renderer switch. */
  onRendererChange?: (info: RendererChangeInfo) => void;
  /** Called for renderer initialization or context-loss errors. */
  onError?: (error: Error) => void;
}

export declare const DEFAULT_OPTIONS: Readonly<
  Required<
    Omit<FireTextOptions, "width" | "height" | "onRendererChange" | "onError">
  > & {
    width: number | null;
    height: number | null;
  }
>;

export declare class FireText {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly opts: Required<FireTextOptions>;
  readonly isPaused: boolean;
  readonly ready: Promise<FireText>;
  readonly renderer: RendererName | null;
  readonly requestedRenderer: RequestedRenderer;

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
  setRenderer(renderer: RequestedRenderer): Promise<FireText>;
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

export default FireText;
