import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Benchmark from "./Benchmark.jsx";
import Preview from "./Preview.jsx";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const isPreview = params.get("preview") === "1";
const isBenchmark = params.get("benchmark") === "1";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isPreview ? <Preview /> : isBenchmark ? <Benchmark /> : <App />}
  </React.StrictMode>
);
