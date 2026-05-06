# Token Optimization Testing Script

Run each test top to bottom. For each test, note the result in the Status column.
Delete the plugin output between tests (select the generated frame and delete it)
so each test starts clean.

Use these status codes:
- **PASS** — works as expected
- **DEGRADED** — works but worse than before (describe how)
- **BROKEN** — doesn't work at all (describe what happened)

---

## Phase A: Direct Actions (no generator, core-only prompt)

These should NOT trigger any generator modules. The LLM should use direct
`setProperty`, `setFill`, `setEffect`, etc. actions with control patch actions.

### A1. Drop shadow
- **Setup:** Select any rectangle or frame
- **Prompt:** `Add a drop shadow`
- **Expect:** Shadow applied, controls for blur/offset/opacity/color
- **Verify:** Adjusting blur slider changes shadow in real time
- **Status:**

### A2. Multi-property edit
- **Setup:** Select any rectangle
- **Prompt:** `Make the opacity 50% and round the corners to 12`
- **Expect:** Both properties applied, controls for each
- **Status:**

### A3. Fill change
- **Setup:** Select any rectangle
- **Prompt:** `Change the fill to a blue gradient`
- **Expect:** Gradient applied, color controls
- **Status:**

---

## Phase B: Basic Generators (grid/palette patterns)

These trigger MODULE_GENERATOR_INTRO + MODULE_CHROMA + MODULE_EXAMPLES.
Key thing to watch: **frame sizing must be dynamic** (rule 3/28).

### B1. Circle grid
- **Setup:** No selection needed
- **Prompt:** `Create a 6x6 grid of colorful circles`
- **Expect:** Grid of circles, controls for columns/size/spacing
- **Frame sizing:** Increase columns slider — frame MUST grow wider. Increase size — frame MUST grow.
- **Status:**

### B2. Color palette
- **Setup:** No selection needed
- **Prompt:** `Make a random color palette with 8 swatches`
- **Expect:** Row of color swatches, controls for count/size
- **Frame sizing:** Increase swatch count — frame MUST grow wider. Increase swatch size — swatches get bigger AND frame grows.
- **Status:**

### B3. Scattered shapes
- **Setup:** No selection needed
- **Prompt:** `Scatter 20 random rectangles with different sizes and colors`
- **Expect:** Random rectangles, controls for count/size range
- **Status:**

---

## Phase C: Image Processing (MODULE_IMAGE)

Requires a selected node with visible content (frame, image fill, etc).

### C1. Halftone
- **Setup:** Select a frame or rectangle with an image fill
- **Prompt:** `Turn this into a halftone dot pattern`
- **Expect:** Halftone dots sized by brightness, controls for density/dot size
- **Status:**

### C2. Posterize (cut example — relies on docs only)
- **Setup:** Select a frame or rectangle with an image fill
- **Prompt:** `Posterize this image to 6 colors`
- **Expect:** Color-reduced version applied as image fill
- **Status:**

---

## Phase D: Vector Path Distribution (samplePath / pathBounds)

This was broken and is now fixed. Critical to verify.

### D1. Circles along path
- **Setup:** Draw a vector line or curve with the pen tool, select it
- **Prompt:** `Add circles along this path`
- **Expect:** Circles distributed evenly along the path, controls for count/size
- **Verify:** Circles follow the path shape, NOT stacked on each other. Frame matches path bounds.
- **Status:**

### D2. Objects along path with rotation
- **Setup:** Draw a wavy vector line, select it
- **Prompt:** `Place small arrows along this path, following the direction`
- **Expect:** Arrow shapes rotated to follow the tangent angle at each point
- **Status:**

---

## Phase E: 3D (MODULE_3D)

### E1. 3D wireframe
- **Setup:** No selection needed
- **Prompt:** `Create a 3D wireframe cube`
- **Expect:** Cube with rotation controls (X/Y dials or sliders), faces colored by depth
- **Verify:** Rotating the dials actually changes the 3D perspective
- **Status:**

### E2. 3D sphere
- **Setup:** No selection needed
- **Prompt:** `Make a 3D sphere`
- **Expect:** Sphere with rotation + segment controls
- **Status:**

---

## Phase F: Voronoi / Delaunay (MODULE_DELAUNAY)

### F1. Voronoi mosaic
- **Setup:** Select a frame with an image fill
- **Prompt:** `Make a Voronoi mosaic from this image`
- **Expect:** Organic cells colored by sampled image pixels, controls for cell count/border
- **Status:**

---

## Phase G: L-Systems / Fractals (MODULE_LSYSTEM)

### G1. Fractal tree
- **Setup:** No selection needed
- **Prompt:** `Generate a fractal tree`
- **Expect:** Branching tree, controls for iterations/angle/length
- **Verify:** Increasing iterations adds more branching complexity
- **Status:**

---

## Phase H: Rough / Sketchy (MODULE_ROUGH)

### H1. Sketchy rectangle
- **Setup:** No selection needed
- **Prompt:** `Draw a hand-drawn sketchy rectangle`
- **Expect:** Rough-style rectangle with hachure fill, controls for roughness/bowing/fill style
- **Status:**

---

## Phase I: Pattern Fills (MODULE_PATTERN)

### I1. Patternize selection
- **Setup:** Select a small frame or icon
- **Prompt:** `Tile this as a repeating pattern`
- **Expect:** Pattern fill rectangle using the selected node as tile source
- **Verify:** Scale/spacing/tile-type controls work
- **Status:**

---

## Phase J: Libraries Without Examples (docs-only, regression risk)

These libraries had their examples cut. They rely solely on documentation.

### J1. Flow field (MODULE_FLOWFIELD)
- **Setup:** No selection needed
- **Prompt:** `Create a flow field background with noise`
- **Expect:** Flowing streamlines, controls for density/color
- **Status:**

### J2. QR code (MODULE_QRCODE)
- **Setup:** No selection needed
- **Prompt:** `Generate a QR code for https://figma.com`
- **Expect:** QR code, controls for size/error correction/colors
- **Status:**

### J3. Pie chart (MODULE_CHARTS)
- **Setup:** No selection needed
- **Prompt:** `Make a pie chart with values 30, 45, 25`
- **Expect:** Three-slice pie chart with colors
- **Status:**

### J4. Organic blob (MODULE_3D — superformula)
- **Setup:** No selection needed
- **Prompt:** `Create an organic blob shape`
- **Expect:** Superformula-based shape, controls for symmetry/roundness
- **Status:**

---

## Phase K: Computational Design Helpers (MODULE_COMPUTATIONAL)

These test the six new native helpers. Each should produce vector output.

### K1. Truchet tiling (WFC)
- **Setup:** No selection needed
- **Prompt:** `Create a Truchet tile pattern, 15x15 grid, thick strokes`
- **Expect:** Grid of quarter-circle arcs forming continuous flowing curves, controls for tile set/cols/rows/stroke weight
- **Verify:** Switching tile set between truchet/lines/arcs produces visibly different patterns. Stroke weight slider changes line thickness.
- **Status:**

### K2. Strange attractor
- **Setup:** No selection needed
- **Prompt:** `Generate a Clifford strange attractor in a 500px frame with a thin 0.5px white stroke on a dark background. Use a=−1.4 b=1.6 c=1.0 d=0.7 and 80000 iterations. Add sliders for a, b, c, d (range −3 to 3), iterations, and stroke weight, plus a color picker for the stroke.`
- **Expect:** Dense, wispy orbital path as a single stroked vector inside a dark frame. Controls for a/b/c/d params, iterations, stroke weight, and stroke color.
- **Verify:** Changing a/b/c/d sliders produces wildly different shapes. Output is a stroked path with no fill. Increasing iterations makes the path denser.
- **Status:**

### K3. Metaballs
- **Setup:** No selection needed
- **Prompt:** `Create 6 organic metaballs that merge together in a 500px frame. Use radius range 40–90px, 2 smoothing passes, and a teal fill color. Add sliders for blob count (2–12), min radius, max radius, and smoothing, plus a color picker.`
- **Expect:** 6 smooth organic blobs that fuse where they overlap, rendered as a single filled vector with clean contours. Controls for count, min/max radius, smoothing passes, and fill color.
- **Verify:** Output is a single filled vector (not multiple shapes). Increasing count adds more blobs. Changing smoothing from 0 to 3 visibly affects contour smoothness. Blobs that are close merge into continuous outlines.
- **Status:**

### K4. Circle packing
- **Setup:** No selection needed
- **Prompt:** `Fill a 500px frame with 150 tightly packed circles, sizes ranging from 3px to 40px radius, 1px padding between them. Color each circle randomly. Add sliders for count (10–400), min radius, max radius, padding, and frame size.`
- **Expect:** Non-overlapping circles of varying radii filling the frame, each with a random color. Controls for count, min/max radius, padding, and size.
- **Verify:** Circles are native Figma ellipses (not vectors). No circles overlap. Increasing count packs more circles in. Changing min/max radius visibly shifts the size distribution.
- **Status:**

### K5. DLA / fractal growth
- **Setup:** No selection needed
- **Prompt:** `Generate a coral-like DLA fractal growth pattern in a 400px frame using 300 particles with a stick distance of 3px. Render as connected branch lines with a 1px white stroke on a dark background. Add sliders for particle count (50–500), stick distance (1–10), and stroke weight.`
- **Expect:** Branching fractal tree structure growing outward from the center, rendered as connected line segments (parent-to-child) in a single stroked vector. Controls for particle count, stick distance, and stroke weight.
- **Verify:** Output has organic branching structure, not random scatter. More particles = denser tree. Larger stick distance = chunkier branches.
- **Status:**

### K6. Cellular automata - Wolfram
- **Setup:** No selection needed
- **Prompt:** `Create a Wolfram Rule 90 cellular automaton in a 500px frame, 100-cell grid, 80 steps, blocky rectangle style. Black fill on white. Add sliders for rule number (0–255), grid size (20–150), and steps (10–200), plus a toggle for smooth vs blocky output.`
- **Expect:** Sierpinski triangle-like pattern with crisp rectangular cells. Controls for rule number, grid size, steps, and smooth toggle.
- **Verify:** Changing the rule number produces different patterns (try 30 = chaotic, 90 = Sierpinski, 110 = complex). Toggling smooth on/off switches between marching-squares contours and blocky rectangles. Output is a single vector.
- **Status:**

### K7. Cellular automata - Game of Life
- **Setup:** No selection needed
- **Prompt:** `Generate a Game of Life pattern in a 500px frame — 60-cell grid, 40 steps of evolution, 0.35 fill ratio, smooth marching-squares contours with 2 Chaikin passes. Dark green fill. Add sliders for grid size (20–120), steps (10–100), fill ratio (0.1–0.7), and smoothing (0–4).`
- **Expect:** Organic blob-like shapes from an evolved Life grid, rendered as smooth filled vector contours. Controls for grid size, steps, fill ratio, and smoothing.
- **Verify:** Smooth contours (not blocky pixels). Increasing steps evolves the pattern further. Higher fill ratio starts with more cells. Smoothing 0 = angular, 3+ = very organic. Output is a filled vector.
- **Status:**

### K8. Turing pattern (vector)
- **Setup:** No selection needed
- **Prompt:** `Create a vector Turing reaction-diffusion pattern`
- **Expect:** Organic labyrinth/worm pattern as a crisp editable vector, controls for feed/kill/iterations
- **Verify:** Output is a vector node (not an image fill). Zooming in shows clean edges.
- **Status:**

---

## Phase L: Multi-turn Conversation (history management)

### L1. Iterative refinement (5+ turns)
- **Setup:** No selection needed
- **Prompt sequence:**
  1. `Create a drop shadow`
  2. `Increase the max blur to 80`
  3. `Add a color picker for the shadow`
  4. `Make the spread go up to 100`
  5. `Add an opacity slider`
  6. `Also add a toggle to switch between drop and inner shadow`
- **Expect:** Each turn preserves previous controls and adds/modifies as requested
- **Verify:** By turn 6, all previously added controls still work
- **Status:**

---

## Phase M: Edge Cases

### M1. Vague prompt
- **Setup:** No selection needed
- **Prompt:** `Make something cool`
- **Expect:** Some creative output (not an error)
- **Status:**

### M2. Complex selection
- **Setup:** Select a frame containing 20+ children
- **Prompt:** `Add rounded corners to all of these`
- **Expect:** Corner radius applied to children, no truncation errors
- **Status:**

### M3. Auto-generate
- **Setup:** Select 2-3 different nodes (rectangle + text + ellipse)
- **Prompt:** Click the auto-generate button (or type `/gen`)
- **Expect:** Controls inferred from the selection properties
- **Status:**

---

## Summary

| Phase | Tests | Pass | Degraded | Broken |
|-------|-------|------|----------|--------|
| A - Direct Actions       | 3 |  |  |  |
| B - Basic Generators     | 3 |  |  |  |
| C - Image Processing     | 2 |  |  |  |
| D - Vector Path Distrib. | 2 |  |  |  |
| E - 3D                   | 2 |  |  |  |
| F - Voronoi / Delaunay   | 1 |  |  |  |
| G - L-Systems / Fractals | 1 |  |  |  |
| H - Rough / Sketchy      | 1 |  |  |  |
| I - Pattern Fills        | 1 |  |  |  |
| J - Docs-Only Libraries  | 4 |  |  |  |
| K - Computational Design | 8 |  |  |  |
| L - Multi-turn           | 1 |  |  |  |
| M - Edge Cases           | 3 |  |  |  |
| **Total** | **32** | | | |

### Issues Found

List any DEGRADED or BROKEN results here with details:

1.
2.
3.
