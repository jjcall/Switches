# PRD: On-Demand Figma Plugin

## 1. Introduction

Figma's property panels are fixed by node type. Complex operations — animation sequences, spatial systems, semantic adjustments — have no native UI. Existing plugins are purpose-built: you find the right one, install it, learn it. The tool dictates the workflow.

This plugin inverts that relationship. Instead of a fixed interface, it generates one. You select objects, describe what you want, and the plugin produces both the Figma API calls to do the work *and* a bespoke control panel to manipulate the result. The interface itself is the AI output.

The goal: a working proof of concept with one end-to-end demo scenario impressive enough to share internally at Figma.

---

## 2. Goals

1. Demonstrate that a single plugin shell can replace purpose-built plugins by generating task-specific UI on demand.
2. Deliver an end-to-end loop: select → describe → execute → manipulate — with live canvas updates driven by generated controls.
3. Ship a declarative component library that produces Figma-native UI without the LLM touching CSS.
4. Produce an internal demo artifact that aligns with Figma's AI-powered product direction.

---

## 3. User Stories

**US-1: Generate a task-specific plugin on the fly**
As a designer, I select objects on my canvas and describe what I want in natural language. The plugin creates the appropriate canvas changes and renders a control panel tailored to what it just built, so I can manipulate the result without writing code or hunting for a purpose-built plugin.

**US-2: Iterate through conversation**
As a designer using a generated control panel, I ask for changes via the persistent chat — "add a slider for blur" or "make the shadow softer by default." The plugin updates the panel and canvas without starting over, so I stay in flow.

**US-3: Manipulate the canvas through generated controls**
As a designer, I drag a slider or toggle a switch in the generated panel. The corresponding property on the canvas updates in real time, so I can explore variations without re-prompting.

**US-4: Start fresh**
As a designer, I change my selection or type a new request. The plugin clears the previous panel and generates a new one for the current context, so I'm never locked into a prior result.

---

## 4. Functional Requirements

### 4.1 Plugin Shell

1. The plugin opens as a standard Figma plugin window with two zones: a **render zone** (top) for generated UI, and a **chat input** (bottom) for user prompts.
2. The render zone is empty on launch. It populates only after the LLM returns a response.
3. The chat input accepts free-form text. Pressing Enter (or a send button) submits the message.
4. A loading indicator appears while the LLM request is in flight.

### 4.2 Selection Serializer

5. When the user opens the plugin or changes their selection, the plugin serializes the current selection into a structured context object.
6. The context object includes: node types, node names, dimensions, fills, strokes, effects, text properties, hierarchy (parent/children), and prototyping connections where present.
7. The serializer handles multi-node selections.
8. The serializer caps context size to stay within LLM token limits. If a selection is too large, it truncates with a summary (e.g., "12 additional child nodes omitted").

### 4.3 LLM Integration

9. The plugin calls the Claude API with a prompt composed of: system instructions, selection context, current UI state (if iterating), and the user's message.
10. The LLM returns a structured JSON response with two fields:
    - `actions`: an array of Figma API operations to execute.
    - `ui`: a declarative component spec describing the control panel.
11. The response is validated as parseable JSON before execution. If parsing fails, the plugin displays an error message in the chat and does not execute anything.
12. The system prompt instructs the LLM to use only components from the shipped component library. It may fall back to raw HTML constrained to the design token set when no standard component fits.

### 4.4 Action Executor

13. The `actions` array contains Figma API calls that the plugin executes sequentially in the main thread (sandbox with full `figma.*` access).
14. All actions from a single LLM response execute within a single undo group, so the user can revert the entire operation with Cmd+Z.
15. For MVP, the executor trusts LLM output directly — no allowlisting or dry-run preview.
16. If an action throws a runtime error, the executor logs the error, skips the failing action, and continues with remaining actions. The error is surfaced in the chat.

### 4.5 UI Renderer

17. The iframe receives the `ui` spec from the LLM response and renders it using the shipped component library.
18. Rendering is batch: the full response arrives, actions execute first (canvas changes visible), then the UI renders in the render zone.
19. Each rendered control is bound to a `postMessage` callback. When the user adjusts a control (e.g., drags a slider), the iframe sends a message to the main thread with the control's ID and new value.
20. The main thread receives control-change messages and applies the corresponding Figma API update to the canvas immediately.

### 4.6 Iteration via Chat

21. The chat maintains a conversation history for the current session.
22. On each new message, the prompt sent to the LLM includes: the current UI spec, the conversation history, and the current selection context.
23. The LLM can return a partial UI update (add/remove/modify controls) or a full replacement. The renderer handles both.
24. The LLM can also return additional actions to execute on the canvas alongside UI changes.

### 4.7 Declarative Component Library

25. The component library is forked from [DialKit](https://github.com/joshpuckett/dialkit/tree/main/src/components) (React + `motion/react`) and adapted for the Figma plugin iframe. DialKit provides production-quality controls with spring animations, rubber-band physics, and a declarative rendering pattern that maps directly to our LLM-output-to-UI pipeline.

26. **Components from DialKit (adapt and restyle):**

    | DialKit Component | Plugin Component | Adaptation Notes |
    |---|---|---|
    | `Slider` | `Slider` | Rubber-band drag, spring-animated click, inline editable value, hash marks. Restyle to Figma tokens. |
    | `Toggle` | `Toggle` | Built on `SegmentedControl` (On/Off pill selector). |
    | `SelectControl` | `Select` | Animated dropdown with portal rendering. Adjust portal target for Figma iframe. |
    | `Folder` | `Section` | Collapsible container with spring animation. Strip root-panel morphing behavior; keep section fold. |
    | `ColorControl` | `ColorSwatch` | Hex text input + native `<input type="color">`. |
    | `SpringControl` + `SpringVisualization` | `SpringEditor` | Full spring curve editor with time/physics mode toggle and live SVG visualization. |
    | `TextControl` | `TextInput` | Labeled text input. |
    | `ButtonGroup` | `Button` | Button rendering with grouping support. |
    | `SegmentedControl` | `SegmentedControl` | Animated pill selector. Not in original spec but useful for multi-option toggles beyond boolean. |

27. **Components to build from scratch:**

    | Component | Purpose | Priority |
    |---|---|---|
    | `NumberInput` | Standalone numeric entry with step/range. DialKit's Slider has inline editing but no standalone numeric field. | MVP |
    | `XYPad` | 2D coordinate input (e.g., position, origin point). | Post-MVP |
    | `GradientRamp` | Gradient stop editor. | Post-MVP |

28. **DialKit's `Panel.renderControl()` pattern** — DialKit already implements a declarative renderer that takes a control spec (`{ type, path, label, ...props }`) and dispatches to the correct component. This pattern maps directly to our LLM → UI pipeline. The renderer walks a JSON tree of component descriptors and instantiates the right component for each `type` field.

29. **Adaptation work required:**
    - Replace DialKit's `DialStore` with a `postMessage`-based bridge: control changes in the iframe send messages to the main thread, which executes Figma API updates.
    - Restyle CSS to match Figma's native plugin aesthetic (`#1e1e1e` background, Inter font, 11–12px type, dense layout, dark theme).
    - Adjust `SelectControl`'s portal rendering for the Figma iframe context (no `document.body` portal — render within the plugin iframe root).
    - Strip DialKit features not needed for MVP: preset manager, copy-to-clipboard toolbar, root panel morphing animation.

30. Design tokens baked into the component library:
    - Background: `#1e1e1e`
    - Font: Inter, 11–12px
    - Slider style: inline filled track
    - Dark theme throughout
    - Dense layout

31. The LLM's system prompt includes a component catalog describing each component's name, accepted props, and usage examples.

### 4.8 Communication Protocol

28. The iframe and main thread communicate via `postMessage`. Message types:
    - `ui-render`: main thread → iframe. Carries the UI spec.
    - `control-change`: iframe → main thread. Carries control ID + new value.
    - `execute-actions`: internal main thread. Triggers Figma API calls.
    - `error`: bidirectional. Surfaces errors in the chat.

---

## 5. Non-Goals (Out of Scope for MVP)

- **Persistence / save / reuse.** No saving, naming, or reloading generated plugins. Each session is ephemeral. (Phase 2)
- **Community library.** No publishing, browsing, or importing shared controls. (Phase 5)
- **Streaming responses.** LLM response arrives as a single batch. No progressive rendering. (Future)
- **Action sandboxing or allowlisting.** LLM-generated code runs with full `figma.*` access, unvalidated beyond JSON parsing. (Future)
- **Dry-run preview.** No "here's what will change" confirmation step. (Future)
- **Multi-user / collaborative features.** Single-user plugin only.
- **FigJam support.** Design mode only.
- **Publishing to the Figma Community.** Internal demo artifact only.

---

## 6. Design Considerations

### Shell Layout

```
┌─────────────────────────────┐
│                             │
│       Render Zone           │
│   (generated UI appears     │
│    here — empty on launch)  │
│                             │
├─────────────────────────────┤
│  💬 Chat input              │
└─────────────────────────────┘
```

### Visual Language

- Match Figma's native plugin aesthetic: dark background (`#1e1e1e`), Inter font, dense type (11–12px).
- Controls should feel like they came from Figma's own team — not like a third-party plugin.
- Filled-track sliders, tight spacing, minimal chrome.

### Plugin Dimensions

- Default width: ~300px (standard Figma plugin width).
- Height: dynamic, grows with generated UI content. Set a reasonable max height with scroll.

---

## 7. Technical Considerations

### Architecture

```
┌──────────────────┐     postMessage     ┌──────────────────┐
│   Main Thread    │ ◄────────────────► │    Iframe (UI)    │
│                  │                     │                  │
│  - Selection     │                     │  - Component     │
│    serializer    │                     │    library       │
│  - Action        │                     │  - UI renderer   │
│    executor      │                     │  - Chat UI       │
│  - figma.* API   │                     │  - Control       │
│                  │                     │    bindings      │
└──────────────────┘                     └──────────────────┘
         │                                        │
         └──────── LLM API call ──────────────────┘
                   (from iframe or main thread)
```

### Key Technical Decisions

- **LLM provider:** Claude API (Anthropic). Model selection TBD — optimize for structured output quality and latency.
- **API call origin:** The LLM API call should originate from the iframe (which has network access in Figma plugins). The main thread (sandbox) does not have direct network access.
- **Component spec format:** JSON. The LLM outputs a tree of component descriptors with `type`, `props`, and `children` fields. The renderer walks the tree and instantiates components.
- **Action format:** Each action is a JSON object describing a Figma API call: `{ method: "setPluginData", nodeId: "...", args: [...] }`. The executor maps these to actual `figma.*` calls. Avoid sending raw executable JS strings to reduce risk.
- **Undo grouping:** Wrap all actions in `figma.group(() => { ... })` so Cmd+Z reverts atomically.
- **Token budget:** Reserve ~2,000 tokens for selection context, ~1,000 for UI state, remainder for conversation history and LLM response.

### Dependencies

- Figma Plugin API
- Anthropic Claude API (requires API key — stored in plugin settings or hardcoded for MVP)
- [DialKit](https://github.com/joshpuckett/dialkit) — forked and adapted as the component library foundation
- React (DialKit dependency) — runs in the iframe
- `motion/react` (Framer Motion — DialKit dependency) — spring animations, `AnimatePresence`, layout transitions

### Constraints

- Figma plugin iframe is sandboxed. No `eval()`. Component rendering must be declarative, not code-execution-based.
- Main thread has no network access. All API calls go through the iframe.
- Plugin must work without a backend server — direct API calls from the iframe to Claude.
- DialKit's `createPortal` usage (in `SelectControl`, `DialRoot`) must be adjusted — Figma iframes don't have a standard `document.body` portal target. Use the plugin's iframe root element instead.

---

## 8. Success Metrics

| Metric | Target |
|---|---|
| End-to-end loop works | Select → describe → canvas changes → controls appear → controls update canvas |
| Demo reaction | Internal stakeholders respond with "I want to try this" |
| Iteration works | At least 2 back-and-forth chat turns that modify the panel meaningfully |
| Time to first result | Under 10 seconds from prompt submission to rendered UI + canvas changes |
| Controls feel native | Non-engineer viewers assume it's a Figma-built panel |

---

## 9. Example Demo Scenarios

These illustrate the plugin's range. None are committed targets — the dynamic UI should handle any of them. They serve as mental models during development and test cases for the LLM prompt.

### Depth System
Select a stack of cards. Ask for depth/elevation. The plugin applies shadow, blur, and scale layers. Controls: depth intensity, perspective angle, fog amount.

### Type System Auditor
Select a frame. Ask "normalize the type scale." The plugin maps all text nodes to the nearest scale step. Controls: scale base, ratio, rounding behavior.

### Mood Shift
Select an image or filled frame. Ask "make this feel colder." The plugin adjusts fills, overlays, and image adjustments. Controls: temperature, saturation, vignette.

### Responsive Spacing
Select a component. Ask "apply an 8pt spacing rhythm." Controls: base unit, padding ratio, gap multiplier — all live-updating the layout.

### State Scaffolder
Select a component. Ask "generate interactive states." The plugin builds hover/focus/disabled/error variants. Controls: state visibility toggles, transition easing, duration.

---

## 10. Phases

| Phase | Scope | Depends On |
|---|---|---|
| **1 — Shell + demo** | Plugin shell, selection serializer, LLM integration, action executor, declarative UI renderer (forking DialKit components + `renderControl` pattern), postMessage bridge replacing DialStore, live canvas update loop. One end-to-end demo. | — |
| **2 — Save + reuse** | Name, save, and reload generated plugins. Soft warning on context mismatch. Remix as starting point. | Phase 1 |
| **3 — Bespoke control creation** | User prompts for a control that doesn't exist. Chat generates it, user iterates. Save to personal library. | Phase 2 |
| **4 — Community library** | Publish controls to shared pool. LLM surfaces community controls contextually. Toggle, apply, fork. | Phase 3 |
| **5 — Ecosystem** | Usage signals improve matching. Ratings/attribution. Shared plugin recipes across teams. | Phase 4 |

---

## 11. Open Questions

1. **Which Claude model?** Sonnet for speed, Opus for quality? Should the plugin let the user toggle between models?
2. **API key management for MVP.** Hardcoded in source? Environment variable? Simple settings field in the plugin UI?
3. **Action format: structured JSON vs. raw JS.** Structured JSON (safer, more constrained) vs. raw JS strings (more flexible, the LLM can express any Figma API call). The PRD recommends structured JSON, but complex scenarios may require raw JS. Decide during implementation.
4. **iframe network restrictions.** Verify that Figma's iframe sandbox allows direct HTTPS calls to `api.anthropic.com`. If not, a lightweight proxy server may be required.
5. **Context window limits.** Complex selections with deep hierarchies could exceed token budgets. How aggressively should the serializer truncate?
6. **Error recovery UX.** When the LLM produces invalid actions, should the plugin offer a "try again" button, or rely on the user re-prompting?
