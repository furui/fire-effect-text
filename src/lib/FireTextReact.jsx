import React from "react";
import { FireText as FireTextCore, DEFAULT_OPTIONS, OVERLAY_BLEND_MODES } from "./FireText.js";

/**
 * Factory to create a React component bound to any React instance.
 */
export function createFireTextComponent(ReactInstance = React) {
  const R = ReactInstance;
  if (!R) {
    throw new Error("createFireTextComponent requires a valid React instance.");
  }

  const Component = R.forwardRef(function FireTextReact(
    {
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
      buoyancy = DEFAULT_OPTIONS.buoyancy,
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
      background = DEFAULT_OPTIONS.background,
      simScale = DEFAULT_OPTIONS.simScale,
      flameHeadroom = DEFAULT_OPTIONS.flameHeadroom,
      paddingX = DEFAULT_OPTIONS.paddingX,
      paddingBottom = DEFAULT_OPTIONS.paddingBottom,
      width = DEFAULT_OPTIONS.width,
      height = DEFAULT_OPTIONS.height,
      className,
      style,
    },
    ref
  ) {
    const canvasRef = R.useRef(null);
    const instanceRef = R.useRef(null);

    R.useImperativeHandle(ref, () => instanceRef.current, []);

    R.useEffect(() => {
      if (!canvasRef.current) return undefined;
      const instance = new FireTextCore(canvasRef.current, {
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
        buoyancy,
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
        background,
        simScale,
        flameHeadroom,
        paddingX,
        paddingBottom,
        width,
        height,
      });
      instanceRef.current = instance;
      return () => {
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
        buoyancy,
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
        background,
        simScale,
        flameHeadroom,
        paddingX,
        paddingBottom,
        width,
        height,
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
      buoyancy,
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
      background,
      simScale,
      flameHeadroom,
      paddingX,
      paddingBottom,
      width,
      height,
    ]);

    return R.createElement("canvas", {
      ref: canvasRef,
      className,
      style: { display: "block", ...style },
    });
  });

  return Component;
}

export const FireTextReact = createFireTextComponent(React);
export { FireTextReact as FireText, OVERLAY_BLEND_MODES };
export default FireTextReact;
