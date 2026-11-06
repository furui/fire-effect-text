import React, { useEffect } from "react";
import { FireTextReact } from "../src/react.js";

export default function Preview() {
  useEffect(() => {
    document.body.classList.add("preview-body");
    return () => document.body.classList.remove("preview-body");
  }, []);

  return (
    <div id="preview-stage">
      <FireTextReact
        text="INFERNO"
        fontSize={120}
        fontFamily="Impact, 'Arial Black', sans-serif"
        flameHeight={1.15}
        fuel={1.2}
        wind={0.15}
        overlayText
        overlayColor="ember"
        overlayOpacity={0.9}
        overlayStrokeWidth={0}
        smoke
        sparks
        bloom
        showTextBody
        width={960}
        height={380}
        background="#07090f"
        renderer="canvas2d"
        simScale={3}
        interactive={false}
      />
    </div>
  );
}
