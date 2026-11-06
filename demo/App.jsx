import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { FireText, OVERLAY_BLEND_MODES } from "../src/index.js";
import { FireTextReact } from "../src/react.js";

const FONT_PRESETS = [
  { label: "Cinzel Decorative (Serif)", value: "'Cinzel Decorative', Georgia, serif" },
  { label: "Impact / Heavy Sans", value: "Impact, 'Arial Black', sans-serif" },
  { label: "Orbitron (Sci-Fi)", value: "'Orbitron', sans-serif" },
  { label: "Playfair Display (Editorial)", value: "'Playfair Display', Georgia, serif" },
  { label: "Rubik Mono One (Block)", value: "'Rubik Mono One', monospace" },
  { label: "Creepster (Display)", value: "'Creepster', cursive" },
  { label: "System UI Sans", value: "system-ui, -apple-system, sans-serif" },
  { label: "Georgia (Classic Serif)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Courier New (Monospace)", value: "'Courier New', monospace" },
  { label: "Custom Font Family...", value: "__custom__" },
];

const OVERLAY_COLOR_PRESETS = [
  { label: "Ember Gradient (Dark Char + Glow)", value: "ember" },
  { label: "Molten Gradient (Gold to Crimson)", value: "molten" },
  { label: "Deep Charcoal (#140904)", value: "#140904" },
  { label: "Warm Gold (#ffd27d)", value: "#ffd27d" },
  { label: "Crisp White (#ffffff)", value: "#ffffff" },
  { label: "Crimson Core (#6e1409)", value: "#6e1409" },
];

const WINDOW_PRESETS = [
  { label: "Auto", width: null, height: null },
  { label: "1000 × 380", width: 1000, height: 380 },
  { label: "800 × 320", width: 800, height: 320 },
  { label: "620 × 260", width: 620, height: 260 },
  { label: "420 × 200", width: 420, height: 200 },
];

const RENDERER_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "WebGPU", value: "webgpu" },
  { label: "WebGL2", value: "webgl2" },
  { label: "Canvas2D", value: "canvas2d" },
];

const RENDERER_LABELS = {
  auto: "Auto",
  webgpu: "WebGPU",
  webgl2: "WebGL2",
  canvas2d: "Canvas2D",
};

export default function App() {
  const [mode, setMode] = useState("react");
  const [text, setText] = useState("INFERNO");
  const [fontPreset, setFontPreset] = useState(FONT_PRESETS[0].value);
  const [customFont, setCustomFont] = useState("Papyrus, fantasy");
  const [fontSize, setFontSize] = useState(104);
  const [fontWeight, setFontWeight] = useState("900");
  const [fontStyle, setFontStyle] = useState("normal");
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [fuel, setFuel] = useState(1.2);
  const [wind, setWind] = useState(0);
  const [flameHeight, setFlameHeight] = useState(1.0);
  const [simScale, setSimScale] = useState(3.0);
  const [showTextBody, setShowTextBody] = useState(true);
  const [overlayText, setOverlayText] = useState(true);
  const [overlayBlendMode, setOverlayBlendMode] = useState("source-over");
  const [overlayColor, setOverlayColor] = useState("ember");
  const [overlayOpacity, setOverlayOpacity] = useState(0.82);
  const [overlayStrokeWidth, setOverlayStrokeWidth] = useState(1.5);
  const [smoke, setSmoke] = useState(true);
  const [sparks, setSparks] = useState(true);
  const [bloom, setBloom] = useState(true);
  const [copied, setCopied] = useState(false);
  const [renderer, setRenderer] = useState("auto");
  const [rendererInfo, setRendererInfo] = useState(null);
  const [isManualPaused, setIsManualPaused] = useState(false);
  const [interactive, setInteractive] = useState(true);
  const [pointerStrength, setPointerStrength] = useState(1);

  const [stageWidth, setStageWidth] = useState(980);
  const [stageHeight, setStageHeight] = useState(360);
  const [isAutoWindow, setIsAutoWindow] = useState(false);
  const [fitCanvasToWindow, setFitCanvasToWindow] = useState(true);
  const [isDraggingResize, setIsDraggingResize] = useState(false);

  const stageCardRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const copyTimerRef = useRef(null);

  const activeFontFamily =
    fontPreset === "__custom__" ? customFont || "sans-serif" : fontPreset;

  const deferredText = useDeferredValue(text);
  const deferredFontSize = useDeferredValue(fontSize);
  const deferredLetterSpacing = useDeferredValue(letterSpacing);
  const deferredFlameHeight = useDeferredValue(flameHeight);
  const deferredSimScale = useDeferredValue(simScale);
  const deferredStageWidth = useDeferredValue(stageWidth);
  const deferredStageHeight = useDeferredValue(stageHeight);

  const effectiveCanvasWidth =
    !isAutoWindow && fitCanvasToWindow && typeof deferredStageWidth === "number"
      ? deferredStageWidth
      : null;
  const effectiveCanvasHeight =
    !isAutoWindow &&
    fitCanvasToWindow &&
    typeof deferredStageHeight === "number"
      ? deferredStageHeight
      : null;

  const handleRendererChange = useCallback((info) => {
    setRendererInfo(info);
  }, []);

  const fireOptions = {
    text: deferredText || " ",
    fontFamily: activeFontFamily,
    fontSize: deferredFontSize,
    fontWeight,
    fontStyle,
    letterSpacing: `${deferredLetterSpacing}px`,
    fuel,
    wind,
    flameHeight: deferredFlameHeight,
    paused: isManualPaused,
    interactive,
    pointerStrength,
    simScale: deferredSimScale,
    showTextBody,
    overlayText,
    overlayBlendMode,
    overlayColor,
    overlayOpacity,
    overlayStrokeColor: "rgba(255, 165, 70, 0.75)",
    overlayStrokeWidth,
    smoke,
    sparks,
    bloom,
    background: "#07090f",
    width: effectiveCanvasWidth,
    height: effectiveCanvasHeight,
    renderer,
    fallback: true,
    onRendererChange: handleRendererChange,
  };

  const vanillaContainerRef = useRef(null);
  const vanillaInstanceRef = useRef(null);

  useEffect(() => {
    if (mode !== "vanilla" || !vanillaContainerRef.current) return undefined;
    const instance = new FireText(vanillaContainerRef.current, fireOptions);
    vanillaInstanceRef.current = instance;
    return () => {
      instance.destroy();
      vanillaInstanceRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (mode === "vanilla" && vanillaInstanceRef.current) {
      vanillaInstanceRef.current.setOptions(fireOptions);
    }
  }, [
    mode,
    deferredText,
    activeFontFamily,
    deferredFontSize,
    fontWeight,
    fontStyle,
    deferredLetterSpacing,
    fuel,
    wind,
    deferredFlameHeight,
    isManualPaused,
    interactive,
    pointerStrength,
    deferredSimScale,
    showTextBody,
    overlayText,
    overlayBlendMode,
    overlayColor,
    overlayOpacity,
    overlayStrokeWidth,
    smoke,
    sparks,
    bloom,
    effectiveCanvasWidth,
    effectiveCanvasHeight,
    renderer,
  ]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (
        event.code === "Space" &&
        event.target.tagName !== "INPUT" &&
        event.target.tagName !== "TEXTAREA" &&
        event.target.tagName !== "SELECT"
      ) {
        event.preventDefault();
        setIsManualPaused((previous) => !previous);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    []
  );

  const handleResizePointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = stageCardRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      w: rect.width,
      h: rect.height,
    };
    setIsAutoWindow(false);
    setIsDraggingResize(true);

    const onPointerMove = (moveEvent) => {
      const dx = moveEvent.clientX - dragStartRef.current.x;
      const dy = moveEvent.clientY - dragStartRef.current.y;
      setStageWidth(
        Math.max(260, Math.min(1400, Math.round(dragStartRef.current.w + dx)))
      );
      setStageHeight(
        Math.max(160, Math.min(850, Math.round(dragStartRef.current.h + dy)))
      );
    };

    const onPointerUp = () => {
      setIsDraggingResize(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const applyPreset = (preset) => {
    if (preset.width === null) {
      setIsAutoWindow(true);
    } else {
      setIsAutoWindow(false);
      setStageWidth(preset.width);
      setStageHeight(preset.height);
    }
  };

  const widthPropCode =
    effectiveCanvasWidth ? `\n      width={${effectiveCanvasWidth}}` : "";
  const heightPropCode =
    effectiveCanvasHeight ? `\n      height={${effectiveCanvasHeight}}` : "";
  const pausedPropCode = isManualPaused ? `\n      paused={true}` : "";
  const flameHeightPropCode =
    flameHeight !== 1.0 ? `\n      flameHeight={${flameHeight}}` : "";
  const rendererPropCode =
    renderer !== "auto" ? `\n      renderer=${JSON.stringify(renderer)}` : "";

  const codeSnippet =
    mode === "react"
      ? `import { FireText } from "fire-effect-text/react";

export function BurningHeading() {
  return (
    <FireText
      text=${JSON.stringify(text)}
      fontFamily=${JSON.stringify(activeFontFamily)}
      fontSize={${fontSize}}
      fontWeight=${JSON.stringify(fontWeight)}
      fontStyle=${JSON.stringify(fontStyle)}
      letterSpacing="${letterSpacing}px"
      fuel={${fuel}}
      wind={${wind}}
      interactive={${interactive}}
      pointerStrength={${pointerStrength}}${flameHeightPropCode}${pausedPropCode}${rendererPropCode}
      overlayText={${overlayText}}
      overlayBlendMode=${JSON.stringify(overlayBlendMode)}
      overlayColor=${JSON.stringify(overlayColor)}
      overlayOpacity={${overlayOpacity}}
      overlayStrokeWidth={${overlayStrokeWidth}}${widthPropCode}${heightPropCode}
      smoke={${smoke}}
      sparks={${sparks}}
      bloom={${bloom}}
      showTextBody={${showTextBody}}
    />
  );
}`
      : `import { FireText } from "fire-effect-text/vanilla";

const fire = new FireText("#fire-container", {
  text: ${JSON.stringify(text)},
  fontFamily: ${JSON.stringify(activeFontFamily)},
  fontSize: ${fontSize},
  fontWeight: ${JSON.stringify(fontWeight)},
  fontStyle: ${JSON.stringify(fontStyle)},
  letterSpacing: "${letterSpacing}px",
  fuel: ${fuel},
  wind: ${wind},
  interactive: ${interactive},
  pointerStrength: ${pointerStrength},${flameHeight !== 1.0 ? `\n  flameHeight: ${flameHeight},` : ""}${isManualPaused ? `\n  paused: true,` : ""}${renderer !== "auto" ? `\n  renderer: ${JSON.stringify(renderer)},` : ""}
  overlayText: ${overlayText},
  overlayBlendMode: ${JSON.stringify(overlayBlendMode)},
  overlayColor: ${JSON.stringify(overlayColor)},
  overlayOpacity: ${overlayOpacity},
  overlayStrokeWidth: ${overlayStrokeWidth},${
    effectiveCanvasWidth ? `\n  width: ${effectiveCanvasWidth},` : ""
  }${effectiveCanvasHeight ? `\n  height: ${effectiveCanvasHeight},` : ""}
  smoke: ${smoke},
  sparks: ${sparks},
  bloom: ${bloom},
  showTextBody: ${showTextBody},
});

// fire.pause();
// fire.resume();
// fire.togglePause();`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(codeSnippet).catch(() => {});
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1800);
  };

  const requestedLabel = RENDERER_LABELS[renderer] || renderer;
  const actualLabel = rendererInfo?.renderer
    ? RENDERER_LABELS[rendererInfo.renderer]
    : null;
  const rendererStatus = actualLabel
    ? requestedLabel !== "Auto" &&
      rendererInfo.requested !== rendererInfo.renderer
      ? `${requestedLabel} unavailable - ${actualLabel}`
      : `Renderer: ${actualLabel}`
    : "Renderer: starting...";

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <h1>fire-effect-text</h1>
          <p>Burning text for React and JavaScript.</p>
        </div>
        <div className="mode-tabs" role="tablist">
          <button
            type="button"
            className={`mode-tab ${mode === "react" ? "active" : ""}`}
            onClick={() => setMode("react")}
          >
            React
          </button>
          <button
            type="button"
            className={`mode-tab ${mode === "vanilla" ? "active" : ""}`}
            onClick={() => setMode("vanilla")}
          >
            JavaScript
          </button>
        </div>
      </header>

      <section className="stage-section">
        <div className="stage-toolbar">
          <div className="stage-left-controls">
            <button
              type="button"
              className={`play-pause-btn ${isManualPaused ? "paused" : "playing"}`}
              onClick={() => setIsManualPaused((previous) => !previous)}
              title="Pause or resume (Space)"
            >
              {isManualPaused ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Resume
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                  Pause
                </>
              )}
            </button>

            <div className="stage-presets">
              <span className="toolbar-label">Size:</span>
              {WINDOW_PRESETS.map((preset) => {
                const isActive =
                  (preset.width === null && isAutoWindow) ||
                  (!isAutoWindow &&
                    stageWidth === preset.width &&
                    stageHeight === preset.height);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    className={`preset-btn ${isActive ? "active" : ""}`}
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="stage-right-controls">
            <label className="field renderer-field">
              <span className="toolbar-label">Renderer</span>
              <select
                value={renderer}
                onChange={(event) => setRenderer(event.target.value)}
              >
                {RENDERER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="toggle-pill" title="Make the canvas fill the preview">
              <input
                type="checkbox"
                checked={fitCanvasToWindow && !isAutoWindow}
                disabled={isAutoWindow}
                onChange={(event) => setFitCanvasToWindow(event.target.checked)}
              />
              Fit to Preview
            </label>
          </div>
        </div>

        <div
          className="stage-window-container"
          style={{
            width: isAutoWindow ? "auto" : stageWidth,
            height: isAutoWindow ? "auto" : stageHeight,
          }}
        >
          <div
            ref={stageCardRef}
            className={`stage-card ${isDraggingResize ? "resizing" : ""}`}
            style={{ width: "100%", height: isAutoWindow ? "auto" : "100%" }}
          >
            <div className="stage-badges">
              <span className="stage-badge">
                {mode === "react" ? "React" : "JavaScript"}
              </span>
              <span className="stage-badge renderer-badge">{rendererStatus}</span>
            </div>

            <span className="dimension-badge">
              {isAutoWindow
                ? "Auto"
                : `${typeof stageWidth === "number" ? `${stageWidth}px` : stageWidth} × ${stageHeight}px`}
            </span>

            {mode === "react" ? (
              <FireTextReact {...fireOptions} />
            ) : (
              <div ref={vanillaContainerRef} />
            )}

            <span className="stage-hint">
              {interactive
                ? "Click or drag over the text to blow the flames. Drag the corner to resize."
                : "Pointer interaction is off. Drag the corner to resize."}
            </span>

            <div
              className="stage-resize-handle"
              onPointerDown={handleResizePointerDown}
              title="Drag to resize"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M10 2L2 10" stroke="#ffbe85" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10 6L6 10" stroke="#ffbe85" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10 10L9.5 10" stroke="#ffbe85" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      <div className="grid-layout">
        <section className="panel">
          <h2>Settings</h2>
          <div className="controls-grid">
            <div className="field full">
              <label htmlFor="inp-text">Text</label>
              <input
                id="inp-text"
                type="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Type any word or phrase..."
              />
            </div>

            <div className="field">
              <label htmlFor="sel-font">Font</label>
              <select
                id="sel-font"
                value={fontPreset}
                onChange={(event) => setFontPreset(event.target.value)}
              >
                {FONT_PRESETS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>

            {fontPreset === "__custom__" && (
              <div className="field">
                <label htmlFor="inp-custom-font">Custom Font</label>
                <input
                  id="inp-custom-font"
                  type="text"
                  value={customFont}
                  onChange={(event) => setCustomFont(event.target.value)}
                  placeholder="e.g. 'Futura', cursive"
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="rng-size">
                Font Size <span>{fontSize}px</span>
              </label>
              <input
                id="rng-size"
                type="range"
                min={24}
                max={180}
                step={2}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-flame-height">
                Flame Height <span>{Math.round(flameHeight * 100)}%</span>
              </label>
              <input
                id="rng-flame-height"
                type="range"
                min={0.2}
                max={2.5}
                step={0.05}
                value={flameHeight}
                onChange={(event) => setFlameHeight(Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="sel-weight">Weight &amp; Style</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <select
                  id="sel-weight"
                  style={{ flex: 1 }}
                  value={fontWeight}
                  onChange={(event) => setFontWeight(event.target.value)}
                >
                  <option value="400">400 Normal</option>
                  <option value="600">600 SemiBold</option>
                  <option value="700">700 Bold</option>
                  <option value="900">900 Black</option>
                </select>
                <select
                  value={fontStyle}
                  onChange={(event) => setFontStyle(event.target.value)}
                >
                  <option value="normal">Normal</option>
                  <option value="italic">Italic</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="rng-spacing">
                Letter Spacing <span>{letterSpacing}px</span>
              </label>
              <input
                id="rng-spacing"
                type="range"
                min={-4}
                max={24}
                step={1}
                value={letterSpacing}
                onChange={(event) => setLetterSpacing(Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="sel-blend">Blend Mode</label>
              <select
                id="sel-blend"
                value={overlayBlendMode}
                disabled={!overlayText}
                onChange={(event) => setOverlayBlendMode(event.target.value)}
              >
                {OVERLAY_BLEND_MODES.map((blendMode) => (
                  <option key={blendMode} value={blendMode}>
                    {blendMode}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="sel-overlay-color">Overlay Color</label>
              <select
                id="sel-overlay-color"
                value={overlayColor}
                disabled={!overlayText}
                onChange={(event) => setOverlayColor(event.target.value)}
              >
                {OVERLAY_COLOR_PRESETS.map((color) => (
                  <option key={color.value} value={color.value}>
                    {color.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="rng-overlay-opacity">
                Overlay Opacity <span>{Math.round(overlayOpacity * 100)}%</span>
              </label>
              <input
                id="rng-overlay-opacity"
                type="range"
                min={0.05}
                max={1.0}
                step={0.05}
                disabled={!overlayText}
                value={overlayOpacity}
                onChange={(event) => setOverlayOpacity(Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-overlay-stroke">
                Outline Width <span>{overlayStrokeWidth.toFixed(1)}px</span>
              </label>
              <input
                id="rng-overlay-stroke"
                type="range"
                min={0}
                max={5}
                step={0.5}
                disabled={!overlayText}
                value={overlayStrokeWidth}
                onChange={(event) =>
                  setOverlayStrokeWidth(Number(event.target.value))
                }
              />
            </div>

            <div className="field">
              <label htmlFor="rng-fuel">
                Fuel <span>{Math.round(fuel * 100)}%</span>
              </label>
              <input
                id="rng-fuel"
                type="range"
                min={0.35}
                max={2.1}
                step={0.05}
                value={fuel}
                onChange={(event) => setFuel(Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-wind">
                Wind{" "}
                <span>
                  {Math.abs(wind) < 0.04
                    ? "Calm"
                    : wind > 0
                      ? `+${wind.toFixed(2)} →`
                      : `← ${wind.toFixed(2)}`}
                </span>
              </label>
              <input
                id="rng-wind"
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={wind}
                onChange={(event) => setWind(Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-stage-w">
                Preview Width{" "}
                <span>{isAutoWindow ? "Auto" : `${stageWidth}px`}</span>
              </label>
              <input
                id="rng-stage-w"
                type="range"
                min={260}
                max={1200}
                step={20}
                disabled={isAutoWindow}
                value={typeof stageWidth === "number" ? stageWidth : 980}
                onChange={(event) => {
                  setIsAutoWindow(false);
                  setStageWidth(Number(event.target.value));
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-stage-h">
                Preview Height{" "}
                <span>{isAutoWindow ? "Auto" : `${stageHeight}px`}</span>
              </label>
              <input
                id="rng-stage-h"
                type="range"
                min={160}
                max={700}
                step={10}
                disabled={isAutoWindow}
                value={stageHeight}
                onChange={(event) => {
                  setIsAutoWindow(false);
                  setStageHeight(Number(event.target.value));
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-res">
                Simulation Cell Size <span>{simScale.toFixed(1)}px</span>
                <small>smaller is sharper</small>
              </label>
              <input
                id="rng-res"
                type="range"
                min={2.0}
                max={5.0}
                step={0.2}
                value={simScale}
                onChange={(event) => setSimScale(Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-pointer">
                Pointer Strength <span>{pointerStrength.toFixed(1)}×</span>
                <small>0 disables the effect</small>
              </label>
              <input
                id="rng-pointer"
                type="range"
                min={0}
                max={3}
                step={0.1}
                disabled={!interactive}
                value={pointerStrength}
                onChange={(event) =>
                  setPointerStrength(Number(event.target.value))
                }
              />
            </div>

            <div className="field full">
              <label>Layers</label>
              <div className="toggles-row">
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={isManualPaused}
                    onChange={(event) => setIsManualPaused(event.target.checked)}
                  />
                  Pause
                </label>
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={overlayText}
                    onChange={(event) => setOverlayText(event.target.checked)}
                  />
                  Text Overlay
                </label>
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={showTextBody}
                    onChange={(event) => setShowTextBody(event.target.checked)}
                  />
                  Ember Body
                </label>
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={smoke}
                    onChange={(event) => setSmoke(event.target.checked)}
                  />
                  Smoke
                </label>
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={sparks}
                    onChange={(event) => setSparks(event.target.checked)}
                  />
                  Sparks
                </label>
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={bloom}
                    onChange={(event) => setBloom(event.target.checked)}
                  />
                  Glow
                </label>
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={interactive}
                    onChange={(event) => setInteractive(event.target.checked)}
                  />
                  Pointer
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="code-header">
            <h2>{mode === "react" ? "React Usage" : "JavaScript Usage"}</h2>
            <button type="button" className="copy-btn" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="code-box">
            <code>{codeSnippet}</code>
          </pre>
        </section>
      </div>
    </div>
  );
}
