# Switches — Demo Script

**Audience:** Design/engineering team
**Duration:** ~12 minutes
**Setup:** Figma open, plugin loaded, empty canvas. Have a photo or illustration placed on the canvas for the image demos (Demos 6 & 7).

---

## Opening (30 seconds)

> "Every designer has had this moment. You're in Figma, you need a specific tool, and it doesn't exist. So you file a request, wait three sprints, and by the time it ships, you've moved on. But there's a deeper problem: some of the controls you need aren't even *possible* in Figma. There's no slider that applies a gradient across a grid of objects. There's no dial that rotates a 3D wireframe. Those controls have never existed — because every workflow is different, and no plugin store can anticipate yours. Switches builds them. You describe what you want in a sentence, and the plugin writes itself — the canvas output and a bespoke control panel tailored to that exact task. Every plugin is one-of-one."

---

## Demo 1: From zero to live controls (60 seconds)

**What it shows:** The core loop — prompt, generate, tweak live.

1. Select nothing. Type: **"Create a red square with rounded corners"**
2. Rectangle appears with controls: Fill Color, Corner Radius, Size.
3. Drag Corner Radius — square updates instantly.
4. Open Fill Color picker — drag to blue. Square changes in real time.
5. Drag Size — square grows/shrinks uniformly.

> "One sentence. Three live controls. I didn't configure anything — the LLM decided what made sense for this shape and built the panel. Now, to be clear — fill color, corner radius, size — these are Figma's own properties. You could do this in the sidebar. What the plugin did here is wrap existing Figma controls into a focused panel for this task. That alone is useful. But it's not the interesting part."

**Pause. Let it land.**

> "The interesting part is when the plugin creates controls for things Figma doesn't have."

---

## Demo 2: You choose the controls (90 seconds)

**What it shows:** The user controls the interface, not just the output. Introduces the dial.

1. Type: **"Create a star shape with a dial for rotation and a slider for the number of points"**
2. A star appears. Two controls: a **circular dial** for Rotation and a slider for Points.
3. Drag the dial — the star rotates smoothly. The needle tracks your finger around the arc.
4. Drag Points from 5 to 12 — the star gains more points. Pull it to 3 — a triangle.
5. Click the value under the dial. Type 45. Star snaps to 45°.

> "Notice what happened. I didn't just describe the shape — I told it *what kind of controls to give me*. A dial for rotation, a slider for points. The plugin isn't choosing for you. You are the designer of the tool, not just the output. You can ask for sliders, toggles, dials, dropdowns, color pickers — and it builds exactly the panel you want."

**Beat.** Then:

6. Type: **"Add a color picker for the fill and a toggle for showing a drop shadow"**
7. Two new controls appear beneath the existing ones. Pick a color — star updates. Flip the toggle — shadow appears.

> "You can keep adding controls through conversation. Each prompt refines the tool."

---

## Demo 3: Generative grid with gradient color science (2 minutes)

**What it shows:** Generators, chroma.js color mixing, local execution.

1. Type: **"Create a grid of squares, 8 columns, 6 rows, with a gradient going from red to blue using perceptual color mixing"**
2. Grid appears. The gradient transitions through purples — perceptually uniform, not the muddy brown you get from naive RGB interpolation.
3. Drag Columns from 8 to 3 — grid regenerates live.
4. Change the gradient end color to green — whole grid re-renders instantly.

> "Stop and think about what you'd have to do to get this in Figma today. Create 48 squares. Create a gradient. Mask it, or manually pick 48 colors. If you want to change the column count, start over. Here, one slider controls a property Figma has no concept of: *columns in a color-interpolated grid*. Another control changes the gradient endpoints and every cell recomputes. These aren't Figma controls wired to Figma properties — they're bespoke controls that orchestrate dozens of objects at once. The gradient goes through purple, not brown — that's chroma.js doing perceptual mixing in LAB color space. And none of this is calling the LLM on each drag. It wrote a local JavaScript function that runs in under 50ms."

---

## Demo 4: 3D wireframe — vectors, not images (90 seconds)

**What it shows:** 3D projection pipeline, editable Figma vectors, dial controls with 3D cube preview.

1. Type: **"Create a 3D wireframe sphere I can rotate"**
2. A sphere made of editable Figma vector paths appears. Two dial controls: Rotate X, Rotate Y. A slider for Segments.
3. Drag the 3D cube preview (or the dials) — the sphere rotates in real time. Every face re-projects and re-renders.
4. Increase Segments — the sphere gets denser. Decrease it — you can see the individual triangular faces.
5. Select one of the vector faces in Figma's layer panel — it's a real editable path.

> "That's a 3D sphere rendered as native Figma vectors. Not a raster image — every face is an editable path with its own fill. The generator has a full 3D pipeline: mesh primitives, Euler rotation, perspective projection, painter's algorithm depth sorting. And the dials you saw earlier? When the plugin detects two rotation dials, it links them to a 3D cube preview. Drag the cube, and both dials move together. The interface adapts to the content."

---

## Demo 5: Organic shapes with the superformula (90 seconds)

**What it shows:** Mathematical shape generation, createVector, intuitive param mapping.

1. Type: **"Create an organic blob shape with controls for symmetry, roundness, and spikiness"**
2. An organic shape appears — maybe a flower or starfish. Controls: Petals/Symmetry, Roundness, Spikiness, Size, Fill Color.
3. Drag Petals from 5 to 3 — shape becomes triangular. Push it to 8 — an eight-pointed star.
4. Crank Roundness up — the shape inflates into a blob. Drop it low — sharp pinches appear.
5. Adjust Spikiness — the points stretch outward.

> "This is the Gielis superformula — one equation that generates circles, stars, flowers, leaves, and everything in between. Six parameters produce an infinite variety of organic forms. The generator evaluates 256 points on the curve, builds an SVG path, and outputs a single editable Figma vector. One shape, one path, fully scalable."

---

## Demo 6: Image to Voronoi mosaic (2 minutes)

**What it shows:** Image pixel sampling, d3-delaunay, per-cell color extraction.

**Prep:** Have a colorful photo on the canvas.

1. Select the photo. Type: **"Turn this into a Voronoi stained glass mosaic"**
2. The plugin exports the image as pixel data, generates random seed points, computes a Voronoi diagram, samples the image color at each cell center, and creates one editable vector per cell.
3. Controls: Cell Count, Border Width, Border Color.
4. Drag Cell Count from 80 to 200 — the mosaic gets finer, more detailed.
5. Reduce to 30 — large abstract cells, like stained glass.
6. Increase Border Width — thick black borders. Change Border Color to white — completely different feel.
7. Select a single Voronoi cell in Figma — it's a real vector path with its own fill.

> "Every cell is a native Figma vector. The plugin sampled the image pixels, ran a Delaunay triangulation with d3-delaunay, computed the Voronoi diagram, and colored each cell by sampling the source image at its centroid. 200 editable vector cells, each with its own sampled color. Drag the Cell Count slider and it regenerates in under a second."

---

## Demo 7: Bitmap image effects (90 seconds)

**What it shows:** Canvas2D image processing, non-destructive pipeline.

**Prep:** Same photo on canvas, or select a new one.

1. Select a photo. Type: **"Add a pixelate effect with a control for pixel size"**
2. The image pixelates. A Pixel Size slider appears.
3. Drag Pixel Size from 4 to 20 — the image becomes chunky pixel art. Pull it down to 2 — nearly original.
4. Type: **"Add a vignette control too"**
5. A Vignette slider appears. Drag it — edges darken.

> "The generator reads the source image pixels, processes them through an offscreen Canvas2D — same API as HTML canvas — and writes the result back as a Figma image fill. It's non-destructive: every slider change re-processes from the original source. The LLM can use any Canvas2D operation — blur, sharpen, posterize, color grading, glitch effects — anything you can do with pixel data."

---

## Demo 8: Iterative refinement & plugin memory (60 seconds)

**What it shows:** Conversation-driven iteration, control removal, persistence.

1. Go back to the gradient grid from Demo 3. Type: **"Replace the gradient with a single color control"**
2. The two-stop Gradient control disappears. A single Color control takes its place.
3. Adjust Columns to 4, pick a distinctive color.
4. Deselect the frame. Controls disappear.
5. Reselect it. Controls restore exactly as you left them.
6. Drag a slider — still works.

> "Each prompt edits the current plugin. The LLM removes the old gradient, adds a new control, rewrites the generator — all in one response. And the whole spec persists on the Figma node. Anyone on your team who opens this file gets the same controls, the same tool. It's not my plugin — it's the layer's plugin."

---

## Developer workflow spotlight (2 minutes)

> "Now, a peek behind the curtain. Building a plugin inside a Figma iframe sandbox means no devtools shortcuts, no hot reload to a known state. So we built slash commands to make the plugin testable from within itself."

### /ui — Instant control catalog

`/ui` → full control gallery: sliders, toggles, selects, color pickers, dials with 3D cube preview, sections, buttons. No LLM call.

`/ui color` → just the color controls. `/ui dials` → dials with the cube. `/ui 3d` → generator-backed 3D preview.

> "Every control component, rendered instantly. We styled all of these without writing a single prompt."

### /state — App state machine

`/state idle` → `/state ready` → `/state loading` → `/state success`. Four states, instant transitions. The flask loader animates, the random verb generator picks a word.

### /loader — Full animation cycle

`/loader` → idle → ready → loading → success → ready, all automatic. One command to validate the entire loading flow.

### /key — API key management

`/key sk-ant-...` → saved. `/key status` → check. `/key clear` → removed. Persisted in figma.clientStorage, surviving across sessions.

### /history — Chat interaction demo

`/history` → sample messages animate in with staggered timing. User, assistant, error states.

> "Every one of these saved us from the rebuild-reopen-navigate-test cycle. Type a command, see the result."

---

## Closing (30 seconds)

> "One more thing to leave you with. Everything you saw today — the 3D sphere, the Voronoi mosaic, the superformula shapes, the bitmap effects — those aren't pre-built features. They're programs the LLM wrote on the spot, running locally, producing native Figma objects. The creative toolkit bundles chroma.js, simplex-noise, d3-delaunay, a 3D projection pipeline, the Gielis superformula, and Canvas2D processing. The LLM writes code against that toolkit. The result is a tool that would take an engineer weeks to build — delivered in a sentence."

---

## Tips for the presenter

- **Demo 2 is the thesis statement.** The dial moment shows that users design their own interface, not just the output. Land this clearly — it's the idea that separates Switches from "AI that makes shapes."
- **Demo 6 is the jaw-dropper.** A photo turning into 200 editable Voronoi vectors gets a reaction. Spend time here.
- Demo 4 (3D sphere) lands well with engineering audiences — they appreciate the projection math happening client-side.
- Demo 5 (superformula) lands well with design audiences — they've never seen parametric organic shapes in Figma.
- Keep the Figma layers panel visible during Demos 4 and 6 so people can see the individual vectors.
- If something goes wrong, `/clear` resets cleanly.
- Have a backup photo already placed on canvas before starting Demo 6.
- The generator demos (3–7) are where the library shines. Demos 1–2 are setup and thesis. Demo 8 is payoff — keep it brisk.

---

## Library capabilities reference

For Q&A — what the generator library actually ships:

| Capability | Library | What it does |
|------------|---------|-------------|
| Color science | chroma.js | Perceptual mixing (LAB/LCH), scales, palettes, saturation/lightness, contrast ratios, color temperature |
| Noise | simplex-noise | 2D/3D/4D deterministic noise for organic variation, procedural textures, terrain |
| Easing | bezier-easing | Cubic bezier curves matching CSS timing functions, 10 built-in presets |
| Geometry | d3-delaunay | Voronoi diagrams, Delaunay triangulation, cell polygons, SVG paths from point sets |
| 3D projection | Custom | Euler rotation, perspective projection, mesh primitives (cube, sphere, torus), painter's algorithm |
| Organic shapes | Superformula | Gielis equation — circles, stars, flowers, blobs, leaves from 6 parameters |
| Bitmap processing | Canvas2D | Pixel-level effects via offscreen canvas — blur, sharpen, posterize, vignette, glitch, color grading |
| Pattern tiles | renderCanvas | Draw arbitrary tiles from scratch, apply as Figma TILE fills |
| Vector patterns | applyPatternFill | Native Figma pattern fills from vector tile nodes — resolution-independent, editable |
| Vector math | vec2 | 2D vectors with add, sub, scale, rotate, normalize |
