# Switches

Switches is a standalone Figma plugin that generates task-specific design tools on demand. Select layers or start from a blank canvas, describe what you want, and Claude returns both the Figma canvas actions and a custom control panel for refining the result.

This repo contains the original standalone plugin and reference implementation. The idea has also been explored inside the adjacent `figma-clone` prototype, but this README documents the code that lives here.

## What It Does

1. Serializes the current Figma selection into compact JSON.
2. Builds a prompt from the selection, the current control panel, chat history, and task-specific prompt modules.
3. Calls Claude Sonnet through a local CORS proxy.
4. Executes structured Figma actions in the plugin main thread.
5. Renders a React control panel in the iframe.
6. Lets you refine the output through live controls or follow-up chat.

Two interaction modes drive the generated controls:

- **Live mode**: Controls patch existing node properties immediately, such as fills, shadows, opacity, text properties, size, or corner radius.
- **Apply mode**: Controls re-run a generated function that rebuilds a layout, pattern, image effect, chart, or other computed output.

The generated UI spec and prompt history are persisted on the target node with Figma plugin data, so selecting a generated frame can restore its controls. The Anthropic API key is stored with `figma.clientStorage`.

## Setup

Requirements:

- Node.js 18+
- Figma desktop app
- Anthropic API key

Install and build:

```bash
npm install
npm run build
```

Load the plugin in Figma:

1. Open Figma.
2. Go to **Plugins > Development > Import plugin from manifest...**.
3. Select `manifest.json` from this repo.

Run the local Anthropic proxy before using AI generation:

```bash
npm run proxy
```

The proxy listens on `http://localhost:3333` and forwards requests to `https://api.anthropic.com`. Figma plugin iframes have a null origin, so the proxy adds the CORS headers that the browser requires.

Set your API key inside the plugin:

```text
/key sk-ant-...
```

Useful commands:

- `/key` or `/key status`: Check whether an API key is loaded.
- `/key clear`: Remove the stored API key.
- `/gen`, `/generate`, or `/auto`: Auto-generate controls from the current selection.
- `/clear`: Detach the current generated control panel and clear chat state.
- `/remove <controlId>`: Remove one control from the current panel.
- `/ui ...`, `/demo ...`, `/loader`, `/history`, and `/state ...`: Local UI/demo helpers for development.

## Development

```bash
npm run watch      # rebuild the plugin on source changes
npm run proxy      # local Anthropic CORS proxy on localhost:3333
npm run preview    # standalone component preview on localhost:3333
```

`npm run preview` uses the same port as the proxy, so run only one of those commands at a time.

Build outputs:

- `dist/code.js`: bundled Figma main-thread code
- `dist/ui.html`: self-contained iframe HTML with inline React/CSS bundle
- `dist/preview.html`: standalone component preview, built by `npm run preview`

## Architecture

Switches has three runtime environments:

```text
Figma main thread             UI iframe                      External
src/main/code.ts       <->    src/ui/App.tsx          ->      proxy.mjs
message-handler.ts            prompt-composer.ts              Anthropic API
selection-serializer.ts       claude.ts
action-executor.ts            UIRenderer.tsx
                              codegen.ts
```

The main thread can call `figma.*` but has no DOM. The iframe runs React and browser APIs but cannot call the Figma API directly. They communicate with `postMessage`; the iframe talks to Anthropic through `proxy.mjs`.

Request lifecycle:

1. `code.ts` opens the UI and sends selection changes to the iframe.
2. `selection-serializer.ts` extracts node geometry, fills, strokes, effects, text, hierarchy, vector paths, image fills, and reactions.
3. `App.tsx` combines the latest selection, current UI spec, chat history, and user message.
4. `prompt-composer.ts` selects relevant prompt modules and trims history to fit the context budget.
5. `claude.ts` calls Claude Sonnet 4.5 with retry handling and dynamic `max_tokens`.
6. `prompt-composer.ts` parses the JSON response.
7. `action-executor.ts` executes the returned action descriptors against Figma.
8. `UIRenderer.tsx` renders the returned control spec.
9. Control changes either send direct `CONTROL_CHANGE` patches or re-run the generator from `codegen.ts`.

More diagrams are in `ARCHITECTURE.md`.

## Prompt System

The core prompt always defines the response format, action protocol, control catalog, and safety constraints. `prompt-composer.ts` adds optional modules by scanning the user message and selection context.

Module categories include color, noise, easing, vectors, Delaunay/Voronoi, image processing, Canvas2D, reaction diffusion, 3D, L-systems, QR codes, flow fields, charts, Rough.js, pattern fills, computational design helpers, generator rules, and examples.

History management keeps the last 4 turns in full, summarizes older assistant turns, enforces a 20K character history budget, and applies a 180K estimated-token safety guard before sending a request. Simple edits use 4,096 `max_tokens`; generator-heavy requests use 16,384.

## Supported Actions

The LLM returns `ActionDescriptor` objects. The executor supports:

- **Node creation**: `createRectangle`, `createFrame`, `createEllipse`, `createVector`, `createText`
- **Styling**: `setFill`, `setStroke`, `setEffect`, `setProperty`, `setCornerRadius`
- **Layout**: `setLayoutProperties`, `resize`, `appendChild`
- **Images and patterns**: `applyImageFill`, `applyPatternFill`
- **Cleanup**: `deleteNode`, `deleteChildren`

Actions can use `tempId` values to reference nodes created earlier in the same batch. `__prev` targets the most recently created node. The executor returns a temp-id map so the iframe can rewrite persisted control actions to real Figma node IDs.

`createVector` accepts SVG path data. The executor normalizes unsupported SVG commands, including arcs and relative path commands, into the subset Figma accepts.

## Control Components

Control panels are rendered from the LLM's JSON UI spec. Available control types:

- `slider`
- `toggle`
- `select`
- `color`
- `text`
- `button`
- `number`
- `segmented`
- `dial`
- `xy-pad`
- `range`
- `gradient-bar`
- `curve`

Generator specs can also trigger an interactive cube preview when they expose paired rotation dials. The UI includes local preview helpers for simple generated action previews.

## Generator Runtime

Apply-mode generators are JavaScript function bodies compiled in the iframe. They receive:

```ts
function generate(params, lib) {
  return [
    { method: 'createFrame', tempId: 'root', args: { width: 400, height: 400 } },
  ];
}
```

`params` contains current control values. `lib` provides deterministic randomness, math helpers, geometry, image processing, and bundled libraries.

Bundled libraries and helpers:

| Area | Available through `lib` |
|---|---|
| Color | `chroma`, `chromaToFigma`, `hslToRgb`, `hexToRgb` |
| Randomness | `random`, `randomInt`, `randomColor`, `reseed`, stable seeded runs |
| Math/vector | `lerp`, `clamp`, `mapRange`, `vec2`, `polarToXY`, `degToRad`, `radToDeg`, `shuffle`, `distribute` |
| Noise/easing | `simplex-noise`, `createNoise2D/3D/4D`, `bezier-easing`, built-in easing presets |
| Geometry | `Delaunay`, `samplePath`, `pathBounds`, `superformula`, `superformulaPath` |
| 3D | `rotate3D`, `project3D`, `cube`, `sphere`, `torus`, `pointsToSvgPath` |
| Drawing/data | `roughjs`, `paths-js` charts, `qrcode-svg`, `lindenmayer` |
| Image | `getPixel`, `getBrightness`, `sampleGrid`, `toImageData`, `processImage`, `renderCanvas`, `stackBlur`, `dither`, `RgbQuant` |
| Computational design | `computeStreamlines`, `circlePack`, `strangeAttractor`, `metaballs`, `dla`, `cellularAutomata`, `waveFunctionCollapse`, `reactionDiffusion`, `reactionDiffusionSVG` |

Generators should use `lib.random()` instead of `Math.random()` so outputs stay stable when a user tweaks a control.

## Image Processing

If a generated UI spec sets `imageNodeId`, the main thread exports that node as PNG, decodes it, and sends RGBA pixels back to the iframe. The runtime downsamples to `imageMaxWidth` up to 800px.

This supports vector and bitmap effects such as halftone dots, ASCII art, Voronoi mosaics, color-mapped grids, dithering, posterization, blur, palette extraction, and other pixel-driven generators.

Bitmap generators can use `lib.processImage()` to return PNG bytes for `applyImageFill`. Sampling generators can use `lib.sampleGrid()`, `lib.getPixel()`, and `lib.getBrightness()` to create editable Figma shapes from image data.

## Pattern Fills

Switches supports two pattern-fill paths:

- **Raster tiles**: `lib.renderCanvas(w, h, fn)` draws into an offscreen canvas and returns PNG bytes for `applyImageFill` with `scaleMode: 'TILE'`.
- **Vector tiles**: `applyPatternFill` references a Figma node, either created by the generator or supplied through `lib.selectionId`, as an editable repeating tile source.

## Project Structure

```text
src/
  main/
    code.ts                  Figma entry point, UI setup, selection listener
    message-handler.ts       Message router between iframe and Figma APIs
    action-executor.ts       Structured action execution and live control patches
    selection-serializer.ts  Selection-to-JSON serializer
  ui/
    App.tsx                  React shell, chat loop, persistence, generator orchestration
    messaging.ts             Iframe postMessage helpers
    codegen.ts               Generator compiler, executor, and `lib` object
    template.ts              `{{controlId}}` action-template resolver
    api/claude.ts            Claude API client through the local proxy
    chat/                    Chat input and history views
    prompt/
      system-prompt.ts       Core system prompt
      prompt-modules.ts      Optional documentation modules
      prompt-composer.ts     Module selection, history trimming, response parsing
    renderer/UIRenderer.tsx  Declarative UI spec renderer
    components/              Control components and previews
  preview/
    Preview.tsx              Standalone component preview app
  shared/
    message-types.ts         Shared protocol, action, selection, and UI spec types
src/styles/plugin.css        Figma-like dark UI tokens and component styles
manifest.json                Figma plugin manifest
esbuild.config.js            Build, watch, and preview scripts
proxy.mjs                    Local Anthropic CORS proxy
```

Generated files in `dist/` are build artifacts. `dist/code.js`, `dist/ui.html`, and `dist/preview.html` are produced from source by the build scripts.

## Testing And References

Manual regression coverage lives in `TESTING.md`. It contains 32 tests across direct actions, generators, image processing, vector paths, 3D, Voronoi, fractals, sketchy style, pattern fills, computational helpers, multi-turn conversation, and edge cases.

`SHOWCASE.md` contains a prompt catalog with 54+ single-effect prompts and 29 advanced compositions.

Run a build check before loading or sharing changes:

```bash
npm run build
```
