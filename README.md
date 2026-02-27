# Switches

A Figma plugin that generates custom plugins on the fly. Describe what you want in natural language, and the LLM builds both the canvas changes and a control panel to tweak the result — then iterate through conversation.

## How it works

1. Select something on the canvas (or start from scratch)
2. Describe what you want: "Add a drop shadow with blur and spread controls" or "Generate a Voronoi mosaic from this image"
3. The LLM returns Figma actions + a control panel
4. Adjust controls, iterate through conversation, refine

The plugin supports two modes:

- **Live mode** — controls patch node properties immediately (shadows, fills, opacity)
- **Apply mode** — a generator function computes actions from control values, executed on Apply (grids, patterns, generative art)

## Architecture

```
src/
  main/           Figma sandbox (no DOM)
    code.ts         Entry point — showUI, selection listener
    message-handler.ts  Routes messages, proxies Claude API, handles image export
    action-executor.ts  Executes LLM-generated Figma actions
    selection-serializer.ts  Serializes selection context for the LLM
  ui/             Iframe (React)
    App.tsx         Main app — chat, controls, generator execution
    codegen.ts      Compiles generator functions, provides lib utilities
    prompt/         System prompt and prompt composition
    renderer/       Renders the declarative control panel
    chat/           Chat input and history
    components/     Slider, toggle, color picker, etc.
    api/            Claude API client
  shared/
    message-types.ts  Typed message protocol between threads
```

## Creative toolkit

Generators receive a `lib` object with bundled libraries:

| Library | Purpose | Size |
|---|---|---|
| chroma-js | Color science — saturate, darken, scales, mixing, contrast | ~13 kB |
| simplex-noise | Organic noise for procedural generation | ~2 kB |
| bezier-easing | Cubic-bezier easing curves | ~1 kB |
| d3-delaunay | Voronoi diagrams and Delaunay triangulations | ~18 kB |
| upng-js | PNG decoding for image pixel processing (main thread) | ~8 kB |

Plus hand-rolled math utilities: `vec2`, `polarToXY`, `mapRange`, `shuffle`, `distribute`.

## Supported Figma actions

`createRectangle`, `createFrame`, `createEllipse`, `createVector`, `createText`, `setFill`, `setStroke`, `setEffect`, `setProperty`, `setCornerRadius`, `setLayoutProperties`, `resize`, `appendChild`, `deleteNode`, `deleteChildren`

## Image processing

Select a frame or image, and the plugin can export it as pixel data for the generator. Enables halftone dots, ASCII art, Voronoi mosaics, color-mapped grids, and any effect the LLM can write as math over pixels.

## Setup

```bash
npm install
npm run build
```

Load the plugin in Figma: Plugins > Development > Import plugin from manifest, select `manifest.json`.

Set your Anthropic API key in the plugin settings on first run.

## Development

```bash
npm run watch
```

Rebuilds on file changes. Reload the plugin in Figma to pick up updates.

## Requirements

- Node.js 18+
- Figma desktop app
- Anthropic API key (Claude)
