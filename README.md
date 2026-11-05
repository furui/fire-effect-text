# fire-effect-text 🔥

[![npm version](https://img.shields.io/npm/v/fire-effect-text.svg?color=ff6a14)](https://www.npmjs.com/package/fire-effect-text)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()

> A high-performance, physics-based burning text component for **React** and **Plain JavaScript**. Powered by an Eulerian Navier–Stokes fluid solver, Planckian blackbody thermal radiation ($500\,\text{K} - 2150\,\text{K}$), and vorticity confinement.

Works with any custom font, size, and layout. Features interactive pointer wind gusts, customizable flame reach/height, pause/resume playback controls, and crisp foreground overlay text with configurable blend modes.

---

## ⚡ Quick Demo

To run the interactive test and demo harness locally:

```bash
git clone https://github.com/synkknys/fire-effect-text.git
cd fire-effect-text
npm install
npm start
```

This launches the interactive Vite playground with live controls for font family, size, letter spacing, flame height, wind, fuel, foreground blend modes, pause/resume, and test window resizing.

---

## 📦 Installation

```bash
npm install fire-effect-text
# or
yarn add fire-effect-text
# or
pnpm add fire-effect-text
```

---

## 🚀 Usage

### 1. React Component

```jsx
import React, { useRef } from "react";
import { FireText } from "fire-effect-text/react";

export function HeroBanner() {
  const fireRef = useRef(null);

  return (
    <div>
      <FireText
        ref={fireRef}
        text="INFERNO"
        fontFamily="'Cinzel Decorative', Georgia, serif"
        fontSize={104}
        fontWeight="900"
        fuel={1.2}
        flameHeight={1.2} // Flame reach multiplier (0.2 - 2.5)
        wind={0}
        overlayText={true} // Keep text crisp on top of fire
        overlayBlendMode="hard-light" // Any canvas blend mode
        overlayColor="ember"
        smoke={true}
        sparks={true}
        bloom={true}
      />

      {/* Programmatic controls */}
      <button onClick={() => fireRef.current?.togglePause()}>
        Pause / Resume
      </button>
    </div>
  );
}
```

### 2. Plain JavaScript

```javascript
import { FireText } from "fire-effect-text/vanilla";

const fire = new FireText("#fire-stage", {
  text: "BLAZE",
  fontFamily: "Impact, sans-serif",
  fontSize: 96,
  fontWeight: "900",
  flameHeight: 1.0,
  fuel: 1.15,
  overlayText: true,
  overlayBlendMode: "source-over",
  overlayColor: "molten",
});

// Update options anytime:
fire.setOptions({
  text: "NEW TITLE",
  fontSize: 120,
  flameHeight: 1.5,
});

// Playback controls:
fire.pause();
fire.resume();
fire.togglePause();

// Clean up when unmounting:
// fire.destroy();
```

### 3. Browser Script Tag (IIFE)

You can also use the standalone global bundle directly in HTML:

```html
<div id="fire-container"></div>

<script src="https://unpkg.com/fire-effect-text/dist/fire-text.global.js"></script>
<script>
  const fire = new FireTextBundle.FireText("#fire-container", {
    text: "PYRO",
    fontSize: 84,
    flameHeight: 1.3,
  });
</script>
```

---

## 🎛️ Configuration Options & Props

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `text` | `string` | `"FIRE"` | Text content to ignite (supports `\n` for multi-line). |
| `fontFamily` | `string` | `"system-ui, ..."` | Any CSS `font-family` (e.g. `'Cinzel Decorative', serif`, `Impact`). |
| `fontSize` | `number` | `96` | Font size in CSS pixels. |
| `fontWeight` | `string \| number` | `"900"` | CSS `font-weight` (e.g. `400`, `700`, `900`, `"bold"`). |
| `fontStyle` | `string` | `"normal"` | CSS `font-style` (`"normal"` or `"italic"`). |
| `letterSpacing` | `string` | `"0px"` | CSS letter spacing (e.g. `"2px"`, `"-1px"`). |
| `flameHeight` | `number` | `1.0` | Controls how high the flames reach and upward buoyancy push (`0.2` – `2.5`). |
| `fuel` | `number` | `1.15` | Flame fuel intensity (`0.3` – `2.2`). |
| `wind` | `number` | `0` | Horizontal wind force (`-1.0` left to `+1.0` right). |
| `autoWind` | `boolean` | `true` | Subtle natural procedural wind breeze. |
| `paused` | `boolean` | `false` | Freeze/pause simulation and rendering. |
| `overlayText` | `boolean` | `false` | Render crisp foreground text directly over flames. |
| `overlayBlendMode`| `string` | `"source-over"` | Blend mode (`"source-over"`, `"screen"`, `"hard-light"`, `"multiply"`, `"overlay"`, etc.). |
| `overlayColor` | `string` | `"ember"` | Overlay fill: `"ember"`, `"molten"`, or any CSS color (`"#fff"`, `"#140904"`). |
| `overlayOpacity` | `number` | `0.82` | Opacity of the foreground overlay text (`0.0` – `1.0`). |
| `overlayStrokeColor` | `string` | `"rgba(255, 165, 70, 0.75)"` | Rim stroke color around the foreground text. |
| `overlayStrokeWidth` | `number` | `1.5` | Rim stroke width in CSS pixels (`0` to disable). |
| `showTextBody` | `boolean` | `true` | Charred/glowing ember text body under the flames. |
| `smoke` | `boolean` | `true` | Render dark soot and smoke plume. |
| `sparks` | `boolean` | `true` | Render flying advected ember sparks. |
| `bloom` | `boolean` | `true` | Soft thermal bloom glow. |
| `interactive` | `boolean` | `true` | Allow mouse/touch drag to blow flames. |
| `background` | `string` | `"#07090f"` | Canvas background color, or `"transparent"`. |
| `simScale` | `number` | `3.0` | Simulation grid cell size in CSS pixels (lower = higher res). |
| `width` | `number \| null` | `null` | Explicit canvas width (auto-sized to text if null). |
| `height` | `number \| null` | `null` | Explicit canvas height (auto-sized to text if null). |

---

## 🔬 Physics & Rendering Pipeline

1. **Glyph Fuel & Temperature Injection**:
   Text glyphs are rasterized into a grid mask. High-curvature edge contours emit volatile fuel and trigger advected sparks, while inner strokes maintain glowing ember thermal cores.
2. **Eulerian Navier–Stokes Solver**:
   Includes advection, thermal buoyancy $\mathbf{g} \propto \beta T$, and 3D Perlin-like vorticity confinement to preserve turbulent flame swirls without excessive numerical dissipation.
3. **Red-Black Gauss–Seidel Pressure Projection**:
   Enforces fluid incompressibility ($\nabla \cdot \mathbf{u} = 0$).
4. **Planckian Blackbody Radiation Spectrum**:
   Temperature fields map through Planck's law integrated across CIE 1931 colorimetric matching lobes:
   $$M_\lambda(T) = \frac{2\pi h c^2}{\lambda^5 \left(e^{\frac{hc}{\lambda k_B T}} - 1\right)}$$
   Yielding realistic deep red embers ($800\,\text{K}$), radiant amber flames ($1400\,\text{K}$), and brilliant incandescent white-hot centers ($1800\,\text{K}+$).

---

## 🛠️ Development & Publishing

```bash
# Run local dev server with demo harness
npm start

# Run automated tests
npm test

# Build distribution bundles into dist/
npm run build

# Publish to npm (requires NPM_TOKEN or authenticated npm login)
npm publish --access public
```

### GitHub Actions CI/CD
- **`ci.yml`**: Runs on pushes and pull requests to verify compilation, test suites, and bundle generation.
- **`release.yml`**: Automatically publishes to npm with provenance whenever a GitHub release is created or dispatched.

---

## 👤 Author

- **Author**: Jeff Davis
- **npm Account**: [synkknys](https://www.npmjs.com/~synkknys)
- **Repository**: [https://github.com/synkknys/fire-effect-text](https://github.com/synkknys/fire-effect-text)

---

## 📄 License

[MIT](LICENSE) © 2026 Jeff Davis
