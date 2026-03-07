# Switches

A Figma plugin that generates custom micro-plugins on the fly. Describe what you want in natural language, and the LLM builds both the canvas output and a control panel to tweak the result -- then iterate through conversation.

## How It Works

1. Select something on the canvas (or start from scratch)
2. Describe what you want: "Add a drop shadow with blur and spread controls" or "Generate a Voronoi mosaic from this image"
3. The LLM returns Figma actions and a control panel
4. Adjust controls in real time, iterate through conversation, refine

The plugin operates in two modes:

- **Live mode** -- controls patch node properties immediately (shadows, fills, opacity, corner radius). No regeneration, instant feedback.
- **Apply mode** -- a generator function computes a full layout from control values, executed on every control change. Used for grids, patterns, generative art, and anything involving node creation or computed layouts.

The LLM decides which mode to use based on the request.

## Setup

```bash
npm install
npm run build
```

Load the plugin in Figma: Plugins > Development > Import plugin from manifest, select `manifest.json`.

Set your Anthropic API key in the plugin settings on first run.

### Development

```bash
npm run watch    # rebuild on file changes
npm run proxy    # CORS proxy for API calls (localhost:3333)
```

Reload the plugin in Figma after rebuilds.

### Requirements

- Node.js 18+
- Figma desktop app
- Anthropic API key (Claude)

## Architecture

Three isolated environments communicate through message passing and HTTP:

```
Figma Main Thread (sandbox)        UI Iframe (React)            External
  code.ts              <-->          App.tsx                      proxy.mjs
  message-handler.ts                 prompt-composer.ts           Anthropic API
  action-executor.ts                 codegen.ts (generator lib)
  selection-serializer.ts            UIRenderer.tsx
```

The main thread has access to the Figma API but no DOM. The UI iframe has DOM and React but no Figma API. They communicate via `postMessage`. The LLM API is called from the iframe through a local CORS proxy.

Detailed architecture diagrams are in [ARCHITECTURE.md](ARCHITECTURE.md).

### Key files

| File | Purpose |
|---|---|
| `src/main/code.ts` | Entry point -- registers plugin, listens for selection changes |
| `src/main/action-executor.ts` | Executes LLM-generated Figma actions (createFrame, setFill, etc.) |
| `src/main/selection-serializer.ts` | Converts selected Figma nodes to compact JSON for the LLM |
| `src/ui/App.tsx` | Main React app -- chat, controls, generator execution |
| `src/ui/codegen.ts` | Compiles and runs generator functions, provides the `lib` helper object |
| `src/ui/prompt/system-prompt.ts` | Core system prompt (always included) |
| `src/ui/prompt/prompt-modules.ts` | Conditional documentation modules (included by keyword) |
| `src/ui/prompt/prompt-composer.ts` | Assembles the full prompt from context, history, and modules |
| `src/ui/api/claude.ts` | Claude API client with retry logic and streaming |
| `src/ui/renderer/UIRenderer.tsx` | Renders the declarative control panel from the LLM's UI spec |
| `proxy.mjs` | Local CORS proxy for Anthropic API calls |

### Prompt optimization

The system prompt is modularized. A keyword scanner examines the user's message and selection context, then includes only the documentation modules relevant to the request. A "create a drop shadow" request gets ~6K tokens of core prompt. A "create a Voronoi mosaic" request gets the core plus Delaunay, image processing, and generator modules. This cuts per-request input tokens by 40-50% compared to sending everything.

Chat history is managed with a sliding window: the last 4 turns are kept in full, older turns are summarized to just their conversational message (the JSON payload is stripped). A 20K character budget prevents unbounded growth.

## Figma Actions

The LLM can emit these actions, executed by the main thread:

- **Node creation**: `createRectangle`, `createFrame`, `createEllipse`, `createVector`, `createText`
- **Styling**: `setFill`, `setStroke`, `setEffect`, `setProperty`, `setCornerRadius`
- **Layout**: `setLayoutProperties`, `resize`, `appendChild`
- **Image**: `applyImageFill`, `applyPatternFill`
- **Cleanup**: `deleteNode`, `deleteChildren`

Generators reference nodes by `tempId` (assigned during creation) and can target the previous node with `__prev`.

## Generator Library

Generators receive a `lib` object with bundled libraries and hand-rolled utilities. Everything runs synchronously in the UI iframe -- no external dependencies at runtime.

### Bundled libraries

| Library | Purpose |
|---|---|
| chroma-js | Color science -- scales, mixing, contrast, saturate, darken |
| simplex-noise | 2D/3D/4D noise for organic procedural generation |
| bezier-easing | Cubic-bezier easing curves (CSS timing function compatible) |
| d3-delaunay | Voronoi diagrams and Delaunay triangulations |
| paths-js | Charts -- bar, pie, smooth line, radar, waterfall, sankey |
| lindenmayer | L-Systems for fractal trees, Koch curves, ferns |
| qrcode-svg | Vector QR code generation |
| roughjs | Hand-drawn sketchy graphics with hachure/cross-hatch fills |
| stackblur-canvas | Fast Gaussian blur on ImageData |
| rgbquant | Color quantization and palette extraction |
| marchingsquares | Contour extraction from scalar fields (iso-lines) |

### Built-in utilities

**Math and vectors**: `vec2` (add/sub/scale/rotate/normalize), `polarToXY`, `degToRad`, `radToDeg`, `mapRange`, `lerp`, `clamp`, `distribute`, `shuffle`

**Seeded RNG**: `lib.random()`, `lib.randomInt()`, `lib.randomColor()`, `lib.reseed()` -- deterministic randomness so layouts stay stable across control changes

**3D projection**: `rotate3D`, `project3D`, `cube`, `sphere`, `torus`, `pointsToSvgPath` -- pure-math 3D rendering pipeline producing editable Figma vectors

**SVG path sampling**: `samplePath(svgPath, count)` returns evenly spaced `{x, y, angle}` points along any SVG path. `pathBounds(svgPath)` returns the bounding box. Used for distributing objects along user-drawn vectors.

**Organic shapes**: `superformula` and `superformulaPath` -- Gielis superformula for circles, stars, flowers, blobs, leaves from 6 parameters

**Flow fields**: `computeStreamlines` -- synchronous streamline integration through 2D vector fields with automatic spacing

**Image processing**: `getPixel`, `getBrightness`, `sampleGrid`, `processImage`, `renderCanvas`, `toImageData` -- pixel sampling and Canvas2D manipulation pipeline

**Dithering**: Floyd-Steinberg, Atkinson, Burkes, Jarvis, Sierra, Stucki -- error-diffusion algorithms for 1-bit effects

### Computational design helpers

Native helpers for generative and computational design, all producing vector output:

| Helper | Output | Description |
|---|---|---|
| `lib.circlePack(w, h, opts)` | `{x, y, r}[]` | Non-overlapping circles with spatial hashing. Emits `createEllipse` actions. |
| `lib.strangeAttractor(w, h, opts)` | SVG path string | Clifford and De Jong chaotic attractors. Single `createVector`. |
| `lib.metaballs(w, h, opts)` | SVG path string | Organic merging blobs via scalar field + marching squares + Chaikin smoothing. |
| `lib.dla(w, h, opts)` | `{x, y, parent}[]` | Diffusion-limited aggregation -- coral, frost, branching fractals. Branch tracing via parent index. |
| `lib.cellularAutomata(w, h, opts)` | SVG path string | Game of Life (2D) and Wolfram 1D rules (0-255). Smooth contours or blocky rectangles. |
| `lib.waveFunctionCollapse(w, h, opts)` | SVG path string | Constraint-based tile generation. Built-in tile sets: truchet arcs, lines, quadratic curves. |
| `lib.reactionDiffusion(w, h, opts)` | PNG bytes | Gray-Scott Turing patterns (raster). 9-neighbor Laplacian, configurable feed/kill rates. |
| `lib.reactionDiffusionSVG(w, h, opts)` | SVG path string | Vector Turing patterns via marching squares + Chaikin smoothing. Crisp at any scale. |

## Image Processing

Select a frame or node with an image fill, and the plugin can export it as pixel data for the generator. The runtime downscales the image (default 100px wide for sampling generators, configurable up to 800px for bitmap effects) and makes it available as `lib.imageData`.

This enables: halftone dots, ASCII art, Voronoi mosaics, color-mapped grids, dithering, posterization, blur effects, color extraction, and any effect expressible as math over pixels.

For bitmap effects, `lib.processImage` provides a Canvas2D pipeline that returns PNG bytes for `applyImageFill`. For sampling-based generators (halftone, mosaic), `lib.sampleGrid` and `lib.getBrightness` read pixel values that drive shape creation.

## Pattern Fills

Two approaches for tiled patterns:

- **Raster tiles**: `lib.renderCanvas(w, h, fn)` draws on an offscreen canvas, returns PNG bytes for `applyImageFill` with `scaleMode: 'TILE'`. Good for complex pixel-level tiles.
- **Vector tiles**: `applyPatternFill` references a Figma node (created by the generator or the user's selection via `lib.selectionId`) as a repeating tile source. Resolution-independent, tile remains editable.

## Control Panel Components

The LLM builds control panels from these components:

- **slider** -- continuous or stepped range
- **dial** -- rotary angle control
- **toggle** -- boolean switch
- **color** -- color picker with hex input
- **select** -- dropdown menu
- **segmented** -- segmented button group
- **text** -- text input field
- **number** -- numeric input with optional min/max
- **button** -- action trigger (randomize, reset)
- **xy-pad** -- 2D coordinate picker
- **angle-wheel** -- circular angle selector
- **curve-editor** -- cubic bezier curve editor
- **gradient** -- gradient stop editor
- **range** -- dual-handle range slider

Controls are rendered declaratively from the LLM's JSON response. In live mode, each control can carry patch actions that fire immediately. In generator mode, any control change triggers a full generator re-run with the updated parameter values.

## Testing

A manual testing script with 32 tests across 13 categories is in [TESTING.md](TESTING.md). Covers direct actions, generators, image processing, vector path distribution, 3D, Voronoi, fractals, sketchy style, pattern fills, computational design helpers, multi-turn conversation, and edge cases.

## Project Structure

```
src/
  main/                 Figma sandbox (no DOM access)
    code.ts               Entry point -- showUI, selection listener
    message-handler.ts    Routes messages between threads
    action-executor.ts    Executes LLM-generated Figma actions
    selection-serializer.ts  Serializes selection to compact JSON
  ui/                   Iframe (React, DOM access)
    App.tsx               Main app -- chat, controls, generator execution
    codegen.ts            Generator compiler + runtime + full lib object
    prompt/
      system-prompt.ts      Core system prompt
      prompt-modules.ts     Conditional documentation modules
      prompt-composer.ts    Prompt assembly + module selection + history management
    api/
      claude.ts             API client with retry and streaming
    renderer/
      UIRenderer.tsx        Renders control panel from LLM's UI spec
    chat/
      ChatInput.tsx         Chat input component
      ChatHistory.tsx       Chat message display
    components/             Individual control components (Slider, Toggle, etc.)
  shared/
    message-types.ts      Typed message protocol between threads
proxy.mjs               Local CORS proxy for Anthropic API
manifest.json           Figma plugin manifest
esbuild.config.js       Build configuration
```
