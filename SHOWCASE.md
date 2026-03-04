# Switches — Effect Showcase & Prompt Catalog

A complete reference of every effect the plugin can produce, with ready-to-use prompts.

---

## Table 1: Effects & Showcase Prompts

Each prompt below demonstrates a single capability. Select a node where noted, paste the prompt, and watch it work.

| # | Effect | Prompt | Notes |
|---|--------|--------|-------|
| **Shapes & Drawing** | | | |
| 1 | Rectangle with live controls | "Create a rounded rectangle, 200×120, with sliders for corner radius, width, and height, and a color picker for the fill" | No selection needed |
| 2 | Star with rotation dial | "Create a 5-pointed star with a dial for rotation and a slider for number of points" | Shows the dial control and superformula-style generation |
| 3 | Organic blob (superformula) | "Create an organic blob shape with sliders for symmetry, roundness, and spikiness, and a color picker" | Generates infinite organic forms from one equation |
| 4 | Leaf shape | "Create a leaf shape using the superformula. Give me controls for curvature, size, and a green fill color picker" | Asymmetric superformula with a=1, b=2 |
| 5 | Custom SVG vector | "Draw a lightning bolt vector shape with controls for the bolt's fill color, stroke color, stroke weight, and size" | createVector with generator for live control |
| **Color & Fill** | | | |
| 6 | Color palette generator | "Generate a palette of 7 color swatches from a base color, with controls for hue spread, saturation, and count" | chroma.js perceptual color mixing |
| 7 | Gradient grid | "Create a grid of circles, 8 columns by 6 rows, with a two-color gradient going from coral to indigo using perceptual LAB mixing" | chroma.js scale in LAB space |
| 8 | Color temperature control | "Add a warmth slider to this rectangle that shifts its fill from cool blue through neutral to warm orange. Don't create any new shapes — just add the control" | **Select a rectangle.** Direct property patching, no generator needed |
| **Shadows & Effects** | | | |
| 9 | Coordinated shadow depth | "Add a depth slider that controls shadow blur, spread, offset, and opacity together — low feels flat, high feels like it's floating" | Single slider drives 4 effect properties |
| 10 | Light angle dial | "Add a dial for light angle that moves the drop shadow around the object in a circle" | Polar-to-cartesian shadow offset |
| 11 | Inner glow | "Add an inner shadow effect that simulates a glow. Give me controls for glow color, radius, and intensity" | INNER_SHADOW with spread and color |
| 12 | Layered shadow stack | "Add three stacked drop shadows at different scales — a tight crisp one, a medium soft one, and a large ambient one — with a single depth slider controlling all three" | Multi-effect coordination |
| **Patterns & Tiles** | | | |
| 13 | Dot pattern tile (bitmap) | "Create a seamless polka dot pattern with controls for dot size, spacing, dot color, and background color" | renderCanvas + applyImageFill TILE |
| 14 | Vector hex pattern | "Create a vector hexagonal dot pattern fill with controls for dot size, spacing, tile type, and colors" | applyPatternFill, resolution-independent |
| 15 | Crosshatch pattern | "Create a seamless crosshatch pattern tile with controls for line weight, spacing, angle, line color, and background" | renderCanvas with rotated line strokes |
| 16 | Stripe pattern | "Create a diagonal stripe pattern with controls for stripe width, gap, color, and angle" | Canvas2D line drawing, tiled |
| **Noise & Organic Textures** | | | |
| 17 | Noise terrain | "Create a topographic noise field — a grid of circles where the radius of each circle is driven by 2D simplex noise. Controls for frequency, amplitude, grid size, and color" | lib.noise2D driving per-dot radius |
| 18 | Scatter field | "Scatter 100 small ellipses randomly inside a 500×500 frame with noise-driven sizes and a color picker" | lib.random + lib.noise for variation |
| 19 | Wavy line pattern | "Draw 20 horizontal wavy lines across a frame, where each line's y-offset is modulated by simplex noise. Controls for wave frequency, amplitude, and stroke color" | Noise-modulated SVG paths |
| **Geometry & Voronoi** | | | |
| 20 | Voronoi diagram | "Create a Voronoi diagram with 60 random points in a 400×400 frame. Each cell gets a random pastel fill. Controls for cell count and border width" | d3-delaunay Voronoi |
| 21 | Delaunay triangulation | "Create a Delaunay triangulation from 80 random points. Color each triangle by its area — small triangles dark, large ones light. Controls for point count" | renderTriangle + area-based coloring |
| 22 | Voronoi image mosaic | "Turn this image into a Voronoi stained glass mosaic with controls for cell count, border width, and border color" | **Select an image first.** Pixel sampling at cell centroids |
| **3D Projection** | | | |
| 23 | 3D wireframe sphere | "Create a 3D wireframe sphere with dials for X and Y rotation, a segments slider, and a color picker for the stroke" | Euler rotation, perspective projection, depth sorting |
| 24 | 3D cube | "Create a 3D cube with rotation dials and a size slider" | lib.cube mesh + projection |
| 25 | 3D torus | "Create a 3D torus with rotation dials, a slider for ring size vs tube size, and depth-shaded fills" | lib.torus + Z-depth luminance |
| **Charts & Data Visualization** | | | |
| 26 | Bar chart | "Create a bar chart with 6 bars. I need a slider for each bar's value (0–100), controls for bar color and gap width" | lib.charts.Bar, paths-js |
| 27 | Pie chart | "Create a pie chart with 5 slices. Give me sliders for each slice's value and color pickers for each slice" | lib.charts.Pie |
| 28 | Radar chart | "Create a radar/spider chart with 6 axes. Give me sliders for each axis value and a color picker for the fill" | lib.charts.Radar |
| 29 | Line chart | "Create a smooth line chart with 8 data points. Controls for each point's value, line color, and whether to show the filled area underneath" | lib.charts.SmoothLine |
| 30 | Sankey diagram | "Create a Sankey flow diagram showing traffic sources flowing to page categories. 3 sources, 4 destinations" | lib.charts.Sankey |
| **Fractals & L-Systems** | | | |
| 31 | Fractal tree | "Generate a fractal tree with controls for branch angle, iterations (2–6), trunk length, and color" | L-System with turtle graphics |
| 32 | Koch snowflake | "Generate a Koch snowflake curve with a slider for iterations (1–5) and stroke color" | Classic Koch L-System |
| 33 | Sierpinski triangle | "Generate a Sierpinski triangle with iteration control and fill color" | L-System variant |
| 34 | Dragon curve | "Generate a Dragon curve fractal with controls for iterations and stroke color" | L-System: FX → X+YF+ |
| 35 | Fern | "Generate a realistic fern using an L-System with controls for iterations, size, and a green color picker" | Barnsley fern via L-System productions |
| **QR Codes** | | | |
| 36 | QR code | "Generate a QR code for 'https://figma.com' with controls for size, error correction level (L/M/Q/H), foreground color, and background color" | qrcode-svg, vector output |
| 37 | Styled QR code | "Generate a QR code for 'Hello World' where each module is a rounded rectangle instead of a sharp square. Controls for corner radius, module size, and color" | Module matrix iteration + createRectangle per cell |
| **Flow Fields** | | | |
| 38 | Noise flow field | "Create a flow field visualization: streamlines following a simplex noise vector field inside a 500×400 area. Controls for line density, stroke color, and stroke weight" | lib.computeStreamlines + noise |
| 39 | Circular flow field | "Create a circular/vortex flow field where lines spiral outward from the center. Controls for density, stroke weight, and color" | vectorField returns tangent to radius |
| **Hand-Drawn / Sketchy (Rough.js)** | | | |
| 40 | Sketchy rectangle | "Create a hand-drawn rectangle with controls for roughness, bowing, fill style (hachure, cross-hatch, zigzag, dots, sunburst), fill color, and stroke color" | lib.rough.rectangle, 8 fill styles |
| 41 | Sketchy circle | "Draw a hand-drawn circle with a roughness slider and a bowing slider. Hachure fill in blue" | lib.rough.circle |
| 42 | Sketchy polygon | "Draw a hand-drawn pentagon with cross-hatch fill. Controls for roughness and fill color" | lib.rough.polygon |
| 43 | Roughen any SVG | "Take this organic blob and make it look hand-drawn with controls for roughness and fill style" | lib.rough.path wraps any SVG path |
| **Image Processing — Vector** | | | |
| 44 | Halftone dots | "Convert this image into a halftone dot pattern. Controls for dot density, max dot size, and background color" | **Select an image.** Brightness → dot radius |
| 45 | ASCII art | "Convert this image into ASCII art using text characters. Controls for character density and font size" | **Select an image.** Brightness → character mapping |
| 46 | Pixel art grid | "Convert this image into pixel art — a grid of colored squares. Controls for pixel size and color count" | **Select an image.** sampleGrid + createRectangle |
| **Image Processing — Bitmap** | | | |
| 47 | Gaussian blur | "Blur this image with a radius slider (0–20)" | **Select an image.** lib.stackBlur |
| 48 | Tilt-shift blur | "Apply a tilt-shift miniature effect to this image. Controls for focus position, focus width, and blur strength" | **Select an image.** Selective stackBlur blending |
| 49 | Dithering | "Apply Floyd-Steinberg dithering to this image. Give me a dropdown to switch between dithering algorithms and a threshold slider" | **Select an image.** lib.dither with 7 algorithms |
| 50 | Posterize / color quantize | "Posterize this image to a limited color palette. Controls for number of colors (2–32)" | **Select an image.** lib.RgbQuant reduce |
| 51 | Palette extraction | "Extract the dominant color palette from this image and display them as swatches. Control for number of colors" | **Select an image.** lib.RgbQuant palette |
| **Layout & Typography** | | | |
| 52 | Auto-layout card | "Create a card with a title, subtitle, and body text. Give me auto-layout with controls for padding and spacing" | createText + setLayoutProperties |
| 53 | Text style controls | "Create a heading that says 'Hello World' with controls for font size, letter spacing, and line height" | setProperty for text props |
| **Auto-Generate** | | | |
| 54 | Auto-generated controls | *(Select any designed element or group, then click the auto-generate button)* | Reverse-engineers the selection into a bespoke control panel — no prompt needed |

---

## Table 2: Advanced Showcase — Creative Compositions & Multi-Step Workflows

These go beyond single effects. They chain prompts, combine multiple libraries, push creative boundaries, and include generator-powered compositions that demonstrate the full depth of the toolkit.

### Multi-Prompt Compositions

Build up complex results by layering prompts in conversation:

| # | Concept | Step-by-Step Prompts | Why it's impressive |
|---|---------|---------------------|---------------------|
| 1 | **Branded QR poster** | **Prompt 1:** "Generate a QR code for 'https://mysite.com' with rounded modules, dark navy color on white" | Chains QR generation → color palette → layered design |
| | | **Prompt 2:** "Now add a color palette of 5 swatches below the QR code, derived from the navy base color with increasing lightness" | |
| | | **Prompt 3:** "Add a text label above the QR that says 'SCAN ME' with a letter spacing control" | |
| 2 | **Photo to art pipeline** | **Prompt 1:** "Apply Atkinson dithering to this image with a threshold slider" *(select photo)* | Shows the bitmap→vector pipeline |
| | | **Prompt 2:** *(Select the dithered result)* "Now turn this into a Voronoi mosaic with 150 cells" | |
| 3 | **Dashboard mockup** | **Prompt 1:** "Create a bar chart with 6 bars representing monthly revenue, values 40, 65, 80, 55, 90, 72. Blue fill." | Builds a full data dashboard piece by piece |
| | | **Prompt 2:** "Add a pie chart next to it showing expense categories: Engineering 45%, Marketing 25%, Operations 20%, Other 10%" | |
| | | **Prompt 3:** "Add a radar chart below showing team performance across 5 axes: Speed, Quality, Communication, Innovation, Reliability" | |
| 4 | **Generative wallpaper** | **Prompt 1:** "Create a field of 200 organic blob shapes scattered randomly, each with slightly different symmetry and size, all in shades of indigo and violet" | Combines superformula + noise + color science at scale |
| | | **Prompt 2:** "Add a noise-driven flow field on top with thin white strokes, 0.5px weight, density of 25" | |
| 5 | **Design system tokens** | **Prompt 1:** "Generate a color palette with 10 shades from a base color #3B82F6, evenly spaced in lightness from 50 to 950" | Auto-generates an entire design token set |
| | | **Prompt 2:** "Create a grid showing all corner radius values: 0, 2, 4, 8, 12, 16, 24 — one rounded rectangle per value, labeled" | |
| 6 | **Sketchy wireframe kit** | **Prompt 1:** "Create a hand-drawn rectangle with hachure fill, 300×200, with roughness and bowing controls" | Builds a full whiteboard-style wireframe from scratch |
| | | **Prompt 2:** "Add a sketchy circle next to it with cross-hatch fill and the same roughness control" | |
| | | **Prompt 3:** "Draw a wobbly line connecting them" | |

### Single-Prompt Power Prompts (Generator)

Each of these produces something remarkable in a single prompt, leveraging the `generate` function:

| # | Concept | Prompt | What it demonstrates |
|---|---------|--------|---------------------|
| 6 | **Spirograph** | "Create a spirograph pattern using overlapping circles traced by a point on a rolling circle. Controls for inner radius, outer radius, pen offset, number of rotations, and stroke color" | Parametric math → SVG path, hundreds of points |
| 7 | **Noise topography** | "Create a topographic contour map using simplex noise. Draw concentric contour lines at 10 elevation levels. Controls for noise frequency, contour spacing, and stroke color" | Marching squares or threshold-based contour extraction from noise |
| 8 | **Particle ring** | "Create a ring of 200 small circles arranged in a circle, where each circle's radius pulses based on its position using sine waves. Controls for ring radius, particle count, wave frequency, wave amplitude, and base color" | Trigonometric distribution + wave modulation |
| 9 | **Gradient mesh simulation** | "Create a 10×10 grid of rectangles where the fill color smoothly interpolates between four corner colors using bilinear interpolation. Color pickers for each corner." | 2D color interpolation across 100 cells |
| 10 | **Mondrian generator** | "Generate a random Mondrian-style composition: recursively subdivide a 400×400 frame into rectangles, then fill some with red, blue, or yellow, leaving others white. Black borders, 3px. Controls for subdivision depth and color probability" | Recursive subdivision + probabilistic coloring |
| 11 | **Circular barcode** | "Create a circular barcode from concentric filled circles (no strokes). Convert the input text to binary bits. For each bit, draw a circle — black fill for 1, white fill for 0. Draw from outermost ring inward so inner circles paint over outer ones. Controls for text input, size, and center hole radius" | Data encoding as visual pattern |
| 12 | **Phyllotaxis spiral** | "Create a sunflower phyllotaxis spiral — 500 dots arranged using the golden angle (137.5°), where dot size increases from center outward. Controls for dot count, golden angle offset, and a color gradient from center to edge" | Golden ratio math, polar coordinates, color interpolation |
| 13 | **Impossible triangle** | "Draw a Penrose impossible triangle as a single vector path. Controls for size, stroke weight, and fill color" | Optical illusion geometry as SVG |
| 14 | **Generative city skyline** | "Generate a random city skyline: 30 buildings of varying heights and widths, some with lit windows (small yellow squares), against a gradient sky. Controls for building count, max height, window density, and sky gradient colors" | Multi-layer scene with randomized architecture |
| 15 | **Moiré interference** | "Create a moiré interference pattern by overlapping two grids of concentric circles, slightly offset. Controls for circle count, offset distance, and stroke weight" | Visual interference from geometric overlap |
| 16 | **Fractal mountain range** | "Generate a mountain range silhouette using midpoint displacement (fractal subdivision). 3 layers at different depths with decreasing opacity and different colors for parallax depth. Controls for roughness, peak count, and layer colors" | Fractal terrain + parallax layering |
| 17 | **Isometric grid** | "Create an isometric dot grid — dots arranged in a diamond/isometric perspective. Controls for grid size, dot size, and color. The dots should fade in opacity from front to back" | Isometric projection + depth fade |
| 18 | **Wave interference** | "Create a visualization of two-source wave interference. Two point sources emit circular waves that overlap. Where crests meet, draw bright dots; where they cancel, draw nothing. Controls for wavelength, source separation, and dot size" | Physics simulation as generative art |
| 19 | **Radial data viz** | "Create a radial bar chart — bars extend outward from a center point in a circle, one for each month. Slider for each month's value. The bars should be colored by a gradient from inside to outside" | Polar coordinate data visualization |
| 20 | **Escher-style tessellation** | "Create a tessellation of interlocking arrows that perfectly tile a plane. Controls for tile size, two alternating fill colors, and stroke weight" | Geometric tessellation with zero gaps |
| 21 | **Sketchy bar chart** | "Create a hand-drawn bar chart with 5 bars. Each bar should look sketchy with hachure fill. Controls for roughness, each bar's value, fill style, and colors" | lib.rough + lib.charts — roughens data viz |
| 22 | **Hand-drawn fractal tree** | "Generate a fractal tree with L-systems, then make every branch look hand-drawn with roughness control. Controls for iterations, branch angle, roughness, and color" | lib.LSystem output piped through lib.rough.path |
| 23 | **Whiteboard UI mockup** | "Create a whiteboard-style UI mockup: a sketchy phone frame (rounded rectangle) with 3 sketchy placeholder content blocks inside and wobbly divider lines. Controls for roughness and bowing" | Multiple rough shapes composed into a coherent UI sketch |
| 24 | **Sketchy flow field** | "Create a flow field where each streamline is drawn in a hand-drawn sketchy style. Controls for roughness, line density, and stroke color" | lib.computeStreamlines paths piped through lib.rough.path |

### Image-Based Advanced Prompts

These require selecting an image first:

| # | Concept | Prompt | What it demonstrates |
|---|---------|--------|---------------------|
| 25 | **Dual-tone print** | "Convert this image to duotone using two colors. Give me color pickers for the shadow color and highlight color, and a contrast slider" | **Select an image.** Pixel brightness mapped to two-color gradient |
| 26 | **Stained glass mosaic** | "Turn this into a stained glass window — Voronoi cells with thick black leading (borders), cells colored from the image, with a subtle inner glow on each cell" | **Select an image.** Voronoi + per-cell color + styled borders |
| 27 | **Color-sorted pixel strips** | "Sort the pixels of this image by hue and arrange them as vertical strips, creating a color-sorted rainbow visualization. Control for strip width" | **Select an image.** Pixel sorting by HSL hue |
| 28 | **Pop art grid** | "Create a Warhol-style pop art grid: 2×2 copies of this image, each with a different duotone color scheme. Color pickers for each variant's two colors" | **Select an image.** 4× image processing with different palettes |
| 29 | **Pointillist effect** | "Convert this image into a pointillist painting — colored dots of varying size based on local detail. Dense small dots in detailed areas, sparse large dots in flat areas. Controls for max dot size and density" | **Select an image.** Edge detection + adaptive dot placement |

### Auto-Generate Showcases

These demonstrate the auto-generate capability — select the described element, then click the auto-generate button (no prompt needed):

| # | What to Select | What auto-generate produces | Why it's impressive |
|---|---------------|---------------------------|---------------------|
| 30 | A card component with text, icon, shadow, and rounded corners | Fill color, corner radius, shadow depth, text size, padding — all wired to the actual node IDs | Reverse-engineers a component into a control panel |
| 31 | A row of 5 evenly-spaced icons | Spacing slider that repositions all icons, plus size and color controls | Detects spatial relationships automatically |
| 32 | A gradient button with hover state | Gradient start/end colors, corner radius, shadow toggle, font size | Identifies gradient fills and maps them to color pickers |
| 33 | A grid of avatars (3×4) | Row gap, column gap, avatar size — sliders that reposition all 12 items simultaneously | Detects grid layout and creates spatial controls |
| 34 | A complex illustration with multiple colored layers | Per-layer color controls, overall opacity, coordinated scale slider | Groups shared properties, creates coordinated controls |

---

## Quick Reference: What to Select

| Requirement | Prompts |
|-------------|---------|
| **No selection** | Shapes, patterns, charts, 3D, fractals, QR codes, flow fields, organic shapes, palettes, layouts, hand-drawn/sketchy |
| **Select an image** | Halftone, mosaic, pixel art, ASCII art, blur, tilt-shift, dithering, posterize, palette extraction, duotone, pointillist, pop art, color sorting |
| **Select any node(s)** | Auto-generate, shadow/effect controls, color controls, property controls |
