import React, { useState, useEffect, useRef, useCallback } from "react";
import { FireText, FireTextReact, OVERLAY_BLEND_MODES } from "../src/index.js";

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
  { label: "Auto (Text Size)", width: null, height: null },
  { label: "Full Width", width: "100%", height: 360 },
  { label: "1000 × 380", width: 1000, height: 380 },
  { label: "800 × 320", width: 800, height: 320 },
  { label: "620 × 260", width: 620, height: 260 },
  { label: "420 × 200", width: 420, height: 200 },
];

export default function App() {
  const [mode, setMode] = useState("react"); // "react" | "vanilla"
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

  // Pause / Resume & Debounced Auto-pause state
  const [isManualPaused, setIsManualPaused] = useState(false);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const [autoPauseEnabled, setAutoPauseEnabled] = useState(true);

  // Resizable test window state
  const [stageWidth, setStageWidth] = useState(980);
  const [stageHeight, setStageHeight] = useState(360);
  const [isAutoWindow, setIsAutoWindow] = useState(false);
  const [fitCanvasToWindow, setFitCanvasToWindow] = useState(true);
  const [isDraggingResize, setIsDraggingResize] = useState(false);

  const stageCardRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const resumeTimerRef = useRef(null);
  const isInitialMountRef = useRef(true);

  const activeFontFamily =
    fontPreset === "__custom__" ? customFont || "sans-serif" : fontPreset;

  const isEffectPaused = isManualPaused || isAutoPaused;

  const effectiveCanvasWidth =
    !isAutoWindow && fitCanvasToWindow && typeof stageWidth === "number"
      ? stageWidth
      : null;
  const effectiveCanvasHeight =
    !isAutoWindow && fitCanvasToWindow && typeof stageHeight === "number"
      ? stageHeight
      : null;

  const fireOptions = {
    text: text || " ",
    fontFamily: activeFontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    letterSpacing: `${letterSpacing}px`,
    fuel,
    wind,
    flameHeight,
    paused: isEffectPaused,
    simScale,
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
  };

  // Plain JS container mount when mode === "vanilla"
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
    text,
    activeFontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    letterSpacing,
    fuel,
    wind,
    flameHeight,
    isEffectPaused,
    simScale,
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
  ]);

  // Debounced auto-pause trigger (pauses immediately, resumes after 1000ms of inactivity)
  const triggerAutoPause = useCallback(() => {
    if (!autoPauseEnabled || isManualPaused) return;

    setIsAutoPaused(true);
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
    }
    resumeTimerRef.current = setTimeout(() => {
      setIsAutoPaused(false);
    }, 1000);
  }, [autoPauseEnabled, isManualPaused]);

  // Trigger debounced auto-pause on window scroll
  useEffect(() => {
    const handleScroll = () => {
      triggerAutoPause();
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [triggerAutoPause]);

  // Trigger debounced auto-pause on any setting change (after initial mount)
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    triggerAutoPause();
  }, [
    text,
    fontPreset,
    customFont,
    fontSize,
    fontWeight,
    fontStyle,
    letterSpacing,
    fuel,
    wind,
    flameHeight,
    overlayText,
    overlayBlendMode,
    overlayColor,
    overlayOpacity,
    overlayStrokeWidth,
    smoke,
    sparks,
    bloom,
    simScale,
    stageWidth,
    stageHeight,
    fitCanvasToWindow,
    triggerAutoPause,
  ]);

  // Cleanup auto-pause timer on unmount
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
      }
    };
  }, []);

  // Keyboard shortcut: Spacebar toggles play/pause (unless user is typing in text input)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        setIsManualPaused((prev) => !prev);
        setIsAutoPaused(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle drag to resize test window
  const handleResizePointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = stageCardRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: rect.width,
      h: rect.height,
    };
    setIsAutoWindow(false);
    setIsDraggingResize(true);

    const onPointerMove = (moveEvent) => {
      const dx = moveEvent.clientX - dragStartRef.current.x;
      const dy = moveEvent.clientY - dragStartRef.current.y;
      const newW = Math.max(260, Math.min(1400, Math.round(dragStartRef.current.w + dx)));
      const newH = Math.max(160, Math.min(850, Math.round(dragStartRef.current.h + dy)));
      setStageWidth(newW);
      setStageHeight(newH);
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
    } else if (preset.width === "100%") {
      setIsAutoWindow(false);
      setStageWidth("100%");
      setStageHeight(preset.height);
    } else {
      setIsAutoWindow(false);
      setStageWidth(preset.width);
      setStageHeight(preset.height);
    }
  };

  const toggleManualPause = () => {
    if (isAutoPaused) {
      setIsAutoPaused(false);
    }
    setIsManualPaused((prev) => !prev);
  };

  const widthPropCode =
    effectiveCanvasWidth ? `\n      width={${effectiveCanvasWidth}}` : "";
  const heightPropCode =
    effectiveCanvasHeight ? `\n      height={${effectiveCanvasHeight}}` : "";
  const pausedPropCode =
    isManualPaused ? `\n      paused={true}` : "";
  const flameHeightPropCode =
    flameHeight !== 1.0 ? `\n      flameHeight={${flameHeight}}` : "";

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
      wind={${wind}}${flameHeightPropCode}${pausedPropCode}
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
      : `import { FireText } from "fire-effect-text";

const fire = new FireText("#fire-container", {
  text: ${JSON.stringify(text)},
  fontFamily: ${JSON.stringify(activeFontFamily)},
  fontSize: ${fontSize},
  fontWeight: ${JSON.stringify(fontWeight)},
  fontStyle: ${JSON.stringify(fontStyle)},
  letterSpacing: "${letterSpacing}px",
  fuel: ${fuel},
  wind: ${wind},${flameHeight !== 1.0 ? `\n  flameHeight: ${flameHeight},` : ""}${isManualPaused ? `\n  paused: true,` : ""}
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

// Control playback anytime:
// fire.pause();
// fire.resume();
// fire.togglePause();`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <h1>fire-effect-text — Demo Harness</h1>
          <p>
            Navier–Stokes Fluid + Planckian Blackbody Radiation Text Component
          </p>
        </div>
        <div className="mode-tabs" role="tablist">
          <button
            type="button"
            className={`mode-tab ${mode === "react" ? "active" : ""}`}
            onClick={() => setMode("react")}
          >
            React Component (&lt;FireText /&gt;)
          </button>
          <button
            type="button"
            className={`mode-tab ${mode === "vanilla" ? "active" : ""}`}
            onClick={() => setMode("vanilla")}
          >
            Plain JS (new FireText())
          </button>
        </div>
      </header>

      {/* Resizable Test Window Container */}
      <section className="stage-section">
        <div className="stage-toolbar">
          <div className="stage-left-controls">
            {/* Play / Pause Toggle Button */}
            <button
              type="button"
              className={`play-pause-btn ${isEffectPaused ? "paused" : "playing"}`}
              onClick={toggleManualPause}
              title="Pause or resume the fire simulation (Shortcut: Space)"
            >
              {isEffectPaused ? (
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

            {/* Presets */}
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
            <label className="toggle-pill" title="Make fire canvas fit exact test window dimensions">
              <input
                type="checkbox"
                checked={fitCanvasToWindow && !isAutoWindow}
                disabled={isAutoWindow}
                onChange={(e) => setFitCanvasToWindow(e.target.checked)}
              />
              Fit Canvas to Window
            </label>

            <label className="toggle-pill auto-pause-toggle" title="Auto-pause effect for 1s on edit or scroll">
              <input
                type="checkbox"
                checked={autoPauseEnabled}
                onChange={(e) => {
                  setAutoPauseEnabled(e.target.checked);
                  if (!e.target.checked) setIsAutoPaused(false);
                }}
              />
              Auto-Pause (1s debounce)
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
            style={{
              width: "100%",
              height: isAutoWindow ? "auto" : "100%",
            }}
          >
            <div className="stage-badges">
              <span className="stage-badge">
                {mode === "react"
                  ? "React <FireTextReact />"
                  : "Vanilla JS new FireText()"}
              </span>

              {/* Status Badge */}
              {isAutoPaused ? (
                <span className="status-badge auto-paused">
                  ⏸ Auto-Paused (1s debounce)
                </span>
              ) : isManualPaused ? (
                <span className="status-badge paused">
                  ⏸ Paused
                </span>
              ) : (
                <span className="status-badge live">
                  ● Live Simulation
                </span>
              )}
            </div>

            <span className="dimension-badge">
              {isAutoWindow
                ? "Auto (Content)"
                : `${typeof stageWidth === "number" ? `${stageWidth}px` : stageWidth} × ${stageHeight}px`}
            </span>

            {mode === "react" ? (
              <FireTextReact {...fireOptions} />
            ) : (
              <div ref={vanillaContainerRef} />
            )}

            <span className="stage-hint">
              Drag letters to blow fire • Drag bottom-right corner ↘ to resize test window
            </span>

            {/* Corner Resize Handle */}
            <div
              className="stage-resize-handle"
              onPointerDown={handleResizePointerDown}
              title="Drag to resize test window"
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
          <h2>Typography, Flame Reach &amp; Physics Controls</h2>
          <div className="controls-grid">
            <div className="field full">
              <label htmlFor="inp-text">Text Content</label>
              <input
                id="inp-text"
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type any word or phrase..."
              />
            </div>

            <div className="field">
              <label htmlFor="sel-font">Font Family</label>
              <select
                id="sel-font"
                value={fontPreset}
                onChange={(e) => setFontPreset(e.target.value)}
              >
                {FONT_PRESETS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {fontPreset === "__custom__" && (
              <div className="field">
                <label htmlFor="inp-custom-font">Custom CSS Font Name</label>
                <input
                  id="inp-custom-font"
                  type="text"
                  value={customFont}
                  onChange={(e) => setCustomFont(e.target.value)}
                  placeholder="e.g. 'Futura', 'Brush Script MT', cursive"
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
                onChange={(e) => setFontSize(Number(e.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-flame-reach">
                Flame Reach (Height) <span>{Math.round(flameHeight * 100)}%</span>
              </label>
              <input
                id="rng-flame-reach"
                type="range"
                min={0.2}
                max={2.5}
                step={0.05}
                value={flameHeight}
                onChange={(e) => setFlameHeight(Number(e.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="sel-weight">Font Weight &amp; Style</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <select
                  id="sel-weight"
                  style={{ flex: 1 }}
                  value={fontWeight}
                  onChange={(e) => setFontWeight(e.target.value)}
                >
                  <option value="400">400 Normal</option>
                  <option value="600">600 SemiBold</option>
                  <option value="700">700 Bold</option>
                  <option value="900">900 Black</option>
                </select>
                <select
                  value={fontStyle}
                  onChange={(e) => setFontStyle(e.target.value)}
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
                onChange={(e) => setLetterSpacing(Number(e.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="sel-blend">Overlay Blend Mode</label>
              <select
                id="sel-blend"
                value={overlayBlendMode}
                disabled={!overlayText}
                onChange={(e) => setOverlayBlendMode(e.target.value)}
              >
                {OVERLAY_BLEND_MODES.map((bm) => (
                  <option key={bm} value={bm}>
                    {bm}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="sel-overlay-color">Overlay Fill Style</label>
              <select
                id="sel-overlay-color"
                value={overlayColor}
                disabled={!overlayText}
                onChange={(e) => setOverlayColor(e.target.value)}
              >
                {OVERLAY_COLOR_PRESETS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
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
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-overlay-stroke">
                Overlay Rim Stroke <span>{overlayStrokeWidth.toFixed(1)}px</span>
              </label>
              <input
                id="rng-overlay-stroke"
                type="range"
                min={0}
                max={5}
                step={0.5}
                disabled={!overlayText}
                value={overlayStrokeWidth}
                onChange={(e) => setOverlayStrokeWidth(Number(e.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-fuel">
                Flame Fuel <span>{Math.round(fuel * 100)}%</span>
              </label>
              <input
                id="rng-fuel"
                type="range"
                min={0.35}
                max={2.1}
                step={0.05}
                value={fuel}
                onChange={(e) => setFuel(Number(e.target.value))}
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
                onChange={(e) => setWind(Number(e.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-stage-w">
                Window Width{" "}
                <span>
                  {isAutoWindow
                    ? "Auto"
                    : typeof stageWidth === "number"
                    ? `${stageWidth}px`
                    : stageWidth}
                </span>
              </label>
              <input
                id="rng-stage-w"
                type="range"
                min={260}
                max={1200}
                step={20}
                disabled={isAutoWindow || stageWidth === "100%"}
                value={typeof stageWidth === "number" ? stageWidth : 980}
                onChange={(e) => {
                  setIsAutoWindow(false);
                  setStageWidth(Number(e.target.value));
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-stage-h">
                Window Height{" "}
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
                onChange={(e) => {
                  setIsAutoWindow(false);
                  setStageHeight(Number(e.target.value));
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="rng-res">
                Sim Cell Scale <span>{simScale.toFixed(1)}px</span>
              </label>
              <input
                id="rng-res"
                type="range"
                min={2.0}
                max={5.0}
                step={0.2}
                value={simScale}
                onChange={(e) => setSimScale(Number(e.target.value))}
              />
            </div>

            <div className="field full">
              <label>Render Layers &amp; Controls</label>
              <div className="toggles-row">
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={isManualPaused}
                    onChange={(e) => setIsManualPaused(e.target.checked)}
                  />
                  Pause Animation
                </label>
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={overlayText}
                    onChange={(e) => setOverlayText(e.target.checked)}
                  />
                  Foreground Text Overlay
                </label>
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={showTextBody}
                    onChange={(e) => setShowTextBody(e.target.checked)}
                  />
                  Under-Flame Ember Body
                </label>
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={smoke}
                    onChange={(e) => setSmoke(e.target.checked)}
                  />
                  Soot / Smoke Plume
                </label>
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={sparks}
                    onChange={(e) => setSparks(e.target.checked)}
                  />
                  Ember Sparks
                </label>
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={bloom}
                    onChange={(e) => setBloom(e.target.checked)}
                  />
                  Thermal Bloom
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="code-header">
            <h2>{mode === "react" ? "React Usage" : "Plain JS Usage"}</h2>
            <button type="button" className="copy-btn" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy Code"}
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
