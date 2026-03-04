# Switches — Demo Script

**Audience:** Design/engineering team
**Duration:** ~5 minutes
**Setup:** Figma open, plugin loaded. Five premade examples already on the canvas (see Prep below).

---

## Prep — Premade examples on canvas

Before the demo, generate these five plugins and leave them on the canvas. Each should have
its control panel persisted on the node so it restores on click.

| # | Prompt to generate beforehand | Why it's in the lineup |
|---|-------------------------------|----------------------|
| 1 | "Create a 3D wireframe sphere with dials for X and Y rotation, a segments slider, and a color picker" | 3D projection, dials with cube preview, editable vectors |
| 2 | "Turn this into a Voronoi stained glass mosaic with controls for cell count, border width, and border color" *(on a colorful photo)* | Image processing, d3-delaunay, per-cell vector output |
| 3 | "Scatter 80 circles randomly in a 500×500 frame. Use an xy-pad for wind direction, a range slider for size variation, a curve editor for size falloff from center, and a gradient bar for the color ramp" | All four new controls in one plugin |
| 4 | "Create a fractal tree with controls for branch angle, iterations, trunk length, and color" | L-Systems, turtle graphics, recursive beauty |
| 5 | "Create a hand-drawn rectangle with controls for roughness, bowing, fill style, fill color, and stroke color" | Sketchy/rough aesthetic, fill style variety |

Arrange them left to right, spaced out. The third example is the hero — it has every new control.

---

## 1 · Opening (30 seconds)

> "Designers constantly need tools Figma doesn't have. A slider that applies a gradient across a grid. A pad that controls shadow offset in two dimensions. A curve that shapes how sizes taper across a pattern. These controls have never existed because every workflow is different. Switches builds them. You describe what you want, and the plugin writes itself — the canvas output and a bespoke control panel, each one unique to the task."

---

## 2 · The showcase sweep (60 seconds)

Walk through the premade examples. No typing, no waiting — just clicking and dragging.
The speed is the point. Each click restores a fully functional plugin.

**3D Sphere** — Click the sphere. Dials appear. Grab the 3D cube preview and rotate —
the sphere re-renders live. Bump segments up — it gets denser.

> "Every face is a native Figma vector. The generator has full 3D projection —
> rotation, perspective, depth sorting — running client-side in under 50ms."

**Voronoi Mosaic** — Click the mosaic. Drag Cell Count from 80 to 200 — finer detail.
Drop it to 30 — large stained glass cells. Change border color to white.

> "200 editable vector cells, each sampled from the source image."

**Fractal Tree** — Click the tree. Drag branch angle — the tree reshapes. Bump iterations.

> "L-Systems — a grammar that produces infinite botanical forms."

**Sketchy Rectangle** — Click it. Crank roughness. Switch fill style from hachure to
cross-hatch to dots. Each one re-renders.

> "Hand-drawn aesthetics from Rough.js — eight fill styles, one equation."

Pause. Let the variety land.

> "None of these are pre-built features. Each one is a program the LLM wrote on the spot."

---

## 3 · The new controls — one plugin, four inputs (60 seconds)

Click the scatter circle example (premade #3). This is the hero moment for the new controls.

**XY Pad** — Drag the crosshair. All 80 circles shift as if blown by wind.

> "The XY pad replaces two sliders with a single spatial input. Shadow offset,
> gradient direction, wind — anywhere you have a paired X/Y value."

**Range Slider** — Drag the two handles. Small circles get smaller, large ones get larger.

> "A range slider for variation bounds. Instead of two separate min/max sliders,
> one control defines the interval."

**Curve Editor** — Drag a control point. The size distribution changes — circles near the
center grow, edges shrink, or vice versa.

> "A bezier curve editor for shaping distribution. It controls *how* values taper —
> not just how much, but what shape the falloff takes. This feeds into lib.easing."

**Gradient Bar** — Click a stop, change its color. Drag stops to reposition. Click the
bar to add a new stop. The circles' colors follow.

> "A full gradient editor with draggable stops. The generator samples this
> color ramp to paint each circle by its distance from center."

---

## 4 · Live prompt — proving it's real (60 seconds)

Now build something from scratch to prove it's not canned.

Type: **"Create an organic blob shape with controls for symmetry, roundness, and spikiness, a size slider, and a color picker"**

Shape appears. Drag symmetry from 5 to 3 — triangle. Push to 8 — eight-pointed star.
Crank roundness — it inflates into a blob. Adjust spikiness — points stretch.

> "One prompt, one equation — the Gielis superformula. Every possible organic form
> from circles to starfish, controlled by three intuitive sliders."

Then iterate. Type: **"Add a curve editor for controlling how spikiness tapers from tip to base"**

A curve control appears. Drag it — the spike profile changes from linear to ease-in-out.

> "Each prompt refines the tool. The LLM rewrites the generator to incorporate the
> new control while preserving everything else."

---

## 5 · Auto-generate — reverse engineering (45 seconds)

Select a designed element already on the canvas — a card component, a row of icons,
anything with shadows, fills, and spatial relationships.

Click the auto-generate button. No prompt needed.

Controls appear: fill color, corner radius, shadow depth, spacing — all wired to the
actual node IDs.

Drag a slider — the design updates.

> "No prompt, no description. The plugin analyzes the selection — fills, strokes,
> effects, spatial layout — and infers the most useful controls. Select a grid of
> avatars and it gives you row gap and column gap sliders. Select a card and it
> gives you shadow depth and corner radius. The tool reverse-engineers the design."

---

## 6 · Closing (30 seconds)

> "Everything you saw — the 3D sphere, the Voronoi mosaic, the fractal tree, the
> scatter field with the curve editor and gradient bar — none of it shipped with the
> plugin. The LLM wrote each program on the spot against a creative toolkit: chroma.js,
> simplex-noise, d3-delaunay, bezier-easing, Rough.js, L-Systems, a 3D pipeline,
> Canvas2D processing. The result is a tool that would take an engineer weeks to build,
> delivered in a sentence. And each one persists on the Figma node — anyone who opens
> this file gets the same controls."

---

## Presenter notes

- **The showcase sweep (section 2) sets the pace.** Move fast. Four premade plugins in 60 seconds
  establishes that this isn't a one-trick demo. Don't linger — the speed *is* the message.
- **The new controls demo (section 3) is the hero.** This is the newest work and the visual
  highlight. The XY pad, range slider, curve editor, and gradient bar in a single plugin
  shows the depth of the control vocabulary. Spend time here.
- **The live prompt (section 4) proves authenticity.** After showing premades, people will wonder
  if it's canned. One live generation erases that doubt. The iteration step reinforces it.
- **Auto-generate (section 5) is the closer before the close.** It flips the mental model —
  from "describe what you want" to "select what you have." Land this cleanly.
- Keep the Figma layers panel visible during the sweep so people see real vectors.
- If the live prompt is slow, fill with: "The LLM is writing the generator function, which
  will run locally after this. Every subsequent interaction is instant — no API calls."
- If something breaks, `/clear` resets cleanly.
- Have a backup designed element (card, button row) ready for auto-generate in case you
  need a clean selection.

---

## Timing budget

| Section | Target | Cumulative |
|---------|--------|------------|
| Opening | 0:30 | 0:30 |
| Showcase sweep (premade) | 1:00 | 1:30 |
| New controls hero | 1:00 | 2:30 |
| Live prompt + iteration | 1:00 | 3:30 |
| Auto-generate | 0:45 | 4:15 |
| Closing | 0:30 | 4:45 |
| **Buffer** | 0:15 | **5:00** |
