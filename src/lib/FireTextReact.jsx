import React from "react";
import {
  FireText as FireTextCore,
  DEFAULT_OPTIONS,
  OVERLAY_BLEND_MODES,
} from "./FireText.js";

export function createFireTextComponent(ReactInstance = React) {
  const R = ReactInstance;
  if (!R) {
    throw new Error("createFireTextComponent requires a valid React instance.");
  }

  const Component = R.forwardRef(function FireTextReact(props, ref) {
    const {
      text = DEFAULT_OPTIONS.text,
      fontFamily = DEFAULT_OPTIONS.fontFamily,
      fontSize = DEFAULT_OPTIONS.fontSize,
      fontWeight = DEFAULT_OPTIONS.fontWeight,
      fontStyle = DEFAULT_OPTIONS.fontStyle,
      letterSpacing = DEFAULT_OPTIONS.letterSpacing,
      fuel = DEFAULT_OPTIONS.fuel,
      wind = DEFAULT_OPTIONS.wind,
      autoWind = DEFAULT_OPTIONS.autoWind,
      flameHeight = DEFAULT_OPTIONS.flameHeight,
      paused = DEFAULT_OPTIONS.paused,
      smoke = DEFAULT_OPTIONS.smoke,
      sparks = DEFAULT_OPTIONS.sparks,
      bloom = DEFAULT_OPTIONS.bloom,
      showTextBody = DEFAULT_OPTIONS.showTextBody,
      overlayText = DEFAULT_OPTIONS.overlayText,
      overlayBlendMode = DEFAULT_OPTIONS.overlayBlendMode,
      overlayColor = DEFAULT_OPTIONS.overlayColor,
      overlayOpacity = DEFAULT_OPTIONS.overlayOpacity,
      overlayStrokeColor = DEFAULT_OPTIONS.overlayStrokeColor,
      overlayStrokeWidth = DEFAULT_OPTIONS.overlayStrokeWidth,
      interactive = DEFAULT_OPTIONS.interactive,
      pointerStrength = DEFAULT_OPTIONS.pointerStrength,
      background = DEFAULT_OPTIONS.background,
      simScale = DEFAULT_OPTIONS.simScale,
      flameHeadroom = DEFAULT_OPTIONS.flameHeadroom,
      paddingX = DEFAULT_OPTIONS.paddingX,
      paddingBottom = DEFAULT_OPTIONS.paddingBottom,
      width = DEFAULT_OPTIONS.width,
      height = DEFAULT_OPTIONS.height,
      renderer = DEFAULT_OPTIONS.renderer,
      fallback = DEFAULT_OPTIONS.fallback,
      onRendererChange,
      onError,
      className,
      style,
    } = props;

    const canvasRef = R.useRef(null);
    const instanceRef = R.useRef(null);
    const callbacksRef = R.useRef({ onRendererChange, onError });
    callbacksRef.current = { onRendererChange, onError };

    const setRef = (value) => {
      if (typeof ref === "function") ref(value);
      else if (ref) ref.current = value;
    };

    R.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return undefined;
      const instance = new FireTextCore(canvas, {
        text,
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        letterSpacing,
        fuel,
        wind,
        autoWind,
        flameHeight,
        paused,
        smoke,
        sparks,
        bloom,
        showTextBody,
        overlayText,
        overlayBlendMode,
        overlayColor,
        overlayOpacity,
        overlayStrokeColor,
        overlayStrokeWidth,
        interactive,
        pointerStrength,
        background,
        simScale,
        flameHeadroom,
        paddingX,
        paddingBottom,
        width,
        height,
        renderer,
        fallback,
        onRendererChange: (info) =>
          callbacksRef.current.onRendererChange?.(info),
        onError: (error) => callbacksRef.current.onError?.(error),
      });
      instanceRef.current = instance;
      setRef(instance);
      return () => {
        setRef(null);
        instance.destroy();
        instanceRef.current = null;
      };
    }, []);

    R.useEffect(() => {
      if (!instanceRef.current) return;
      instanceRef.current.setOptions({
        text,
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        letterSpacing,
        fuel,
        wind,
        autoWind,
        flameHeight,
        paused,
        smoke,
        sparks,
        bloom,
        showTextBody,
        overlayText,
        overlayBlendMode,
        overlayColor,
        overlayOpacity,
        overlayStrokeColor,
        overlayStrokeWidth,
        interactive,
        pointerStrength,
        background,
        simScale,
        flameHeadroom,
        paddingX,
        paddingBottom,
        width,
        height,
        renderer,
        fallback,
      });
    }, [
      text,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      letterSpacing,
      fuel,
      wind,
      autoWind,
      flameHeight,
      paused,
      smoke,
      sparks,
      bloom,
      showTextBody,
      overlayText,
      overlayBlendMode,
      overlayColor,
      overlayOpacity,
      overlayStrokeColor,
      overlayStrokeWidth,
      interactive,
      pointerStrength,
      background,
      simScale,
      flameHeadroom,
      paddingX,
      paddingBottom,
      width,
      height,
      renderer,
      fallback,
    ]);

    return R.createElement("canvas", {
      ref: canvasRef,
      className,
      style: { display: "block", ...style },
    });
  });

  Component.displayName = "FireTextReact";
  return Component;
}

export const FireTextReact = createFireTextComponent(React);
export { FireTextReact as FireText, OVERLAY_BLEND_MODES };
export default FireTextReact;
