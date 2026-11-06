import React, { useEffect, useRef, useState } from "react";
import { FireText } from "../src/index.js";

const RENDERERS = ["webgpu", "webgl2", "canvas2d"];

async function measureFrameTime() {
  const times = [];
  let last = performance.now();
  await new Promise((resolve) => {
    let count = 0;
    const tick = (now) => {
      times.push(now - last);
      last = now;
      count += 1;
      if (count >= 120) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const average = times.reduce((sum, value) => sum + value, 0) / times.length;
  return { average, fps: 1000 / average };
}

export default function Benchmark() {
  const [results, setResults] = useState([]);
  const containerRef = useRef(null);
  const instancesRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const renderer of RENDERERS) {
        if (cancelled) return;
        const host = document.createElement("div");
        containerRef.current?.appendChild(host);
        const instance = new FireText(host, {
          text: "BENCH",
          fontSize: 120,
          width: 640,
          height: 260,
          renderer,
          fallback: false,
          simScale: 3,
        });
        instancesRef.current.push(instance);
        try {
          await instance.ready;
          await new Promise((resolve) => setTimeout(resolve, 400));
          const metrics = await measureFrameTime();
          if (!cancelled) {
            setResults((previous) => [
              ...previous,
              { renderer, ...metrics },
            ]);
          }
        } catch (error) {
          if (!cancelled) {
            setResults((previous) => [
              ...previous,
              { renderer, error: error.message || String(error) },
            ]);
          }
        }
        instance.destroy();
        host.remove();
      }
    };
    run();
    return () => {
      cancelled = true;
      for (const instance of instancesRef.current) instance.destroy();
      instancesRef.current = [];
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <h1>fire-effect-text benchmark</h1>
          <p>Average frame time over 120 animation frames.</p>
        </div>
      </header>
      <section className="panel">
        <pre className="code-box">
          <code>
            {results
              .map((result) =>
                result.error
                  ? `${result.renderer}: unavailable (${result.error})`
                  : `${result.renderer}: ${result.average.toFixed(2)} ms (${result.fps.toFixed(1)} fps)`
              )
              .join("\n")}
          </code>
        </pre>
      </section>
      <div
        ref={containerRef}
        style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
      />
    </div>
  );
}
