## Relevant Files

- `manifest.json` — Figma plugin manifest (name, id, main entry, ui entry)
- `package.json` — Dependencies (React, motion/react, Anthropic SDK) and build scripts
- `tsconfig.json` — TypeScript configuration for both main thread and iframe
- `esbuild.config.js` — Build configuration for bundling main thread and iframe separately
- `src/main/code.ts` — Main thread entry point; registers plugin command, orchestrates selection → execution loop
- `src/main/selection-serializer.ts` — Reads `figma.currentPage.selection`, produces structured context JSON
- `src/main/action-executor.ts` — Receives structured action specs, executes `figma.*` calls inside undo group
- `src/main/message-handler.ts` — Main thread postMessage listener; routes messages to serializer, executor, etc.
- `src/ui/index.html` — Iframe HTML shell that loads the React app
- `src/ui/App.tsx` — Root React component; shell layout with render zone and chat
- `src/ui/api/claude.ts` — Claude API client (fetch calls to `api.anthropic.com`)
- `src/ui/chat/ChatInput.tsx` — Chat input component with send button
- `src/ui/chat/ChatHistory.tsx` — Displays conversation history and errors
- `src/ui/renderer/UIRenderer.tsx` — Declarative JSON spec → React component tree
- `src/ui/prompt/system-prompt.ts` — System prompt template with component catalog and action format spec
- `src/ui/prompt/prompt-composer.ts` — Assembles full prompt from system instructions + context + history + user message
- `src/ui/components/Slider.tsx` — Forked from DialKit, restyled
- `src/ui/components/Toggle.tsx` — Forked from DialKit
- `src/ui/components/SegmentedControl.tsx` — Forked from DialKit
- `src/ui/components/SelectControl.tsx` — Forked from DialKit, portal target adjusted
- `src/ui/components/Folder.tsx` — Forked from DialKit, stripped of root-panel morphing
- `src/ui/components/ColorControl.tsx` — Forked from DialKit
- `src/ui/components/SpringControl.tsx` — Forked from DialKit
- `src/ui/components/SpringVisualization.tsx` — Forked from DialKit
- `src/ui/components/TextControl.tsx` — Forked from DialKit
- `src/ui/components/ButtonGroup.tsx` — Forked from DialKit
- `src/ui/components/NumberInput.tsx` — New component, built from scratch
- `src/ui/components/index.ts` — Barrel export for all components
- `src/shared/message-types.ts` — TypeScript types/interfaces shared between main thread and iframe
- `src/styles/plugin.css` — Figma-native design tokens and component styles (dark theme, Inter, 11–12px)

### Notes

- The main thread (`src/main/`) runs in Figma's sandbox with `figma.*` access but no network.
- The iframe (`src/ui/`) runs React with network access but no `figma.*`.
- All communication between them uses `window.postMessage` / `figma.ui.postMessage`.
- DialKit components use `motion/react` (Framer Motion) for spring animations — this dependency carries into the iframe bundle.
- No unit test framework is specified for MVP. Testing is manual via the Figma desktop app.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Initialize a git repository if one does not exist (`git init`)
  - [x] 0.2 Create and checkout a new branch (`git checkout -b feature/on-demand-plugin`)

- [x] 1.0 Scaffold Figma plugin project
  - [x] 1.1 Create `manifest.json` with plugin name, API version `1.0.0`, `main` pointing to the built main-thread bundle, and `ui` pointing to the built iframe HTML
  - [x] 1.2 Create `package.json` with dependencies: `react`, `react-dom`, `motion/react`, `@anthropic-ai/sdk` (or use raw fetch); devDependencies: `typescript`, `esbuild`, `@figma/plugin-typings`, `@types/react`, `@types/react-dom`
  - [x] 1.3 Create `tsconfig.json` configured for JSX (`react-jsx`), strict mode, and path aliases if needed
  - [x] 1.4 Create `esbuild.config.js` with two build targets: (a) `src/main/code.ts` → `dist/code.js` (no JSX, Figma sandbox), (b) `src/ui/App.tsx` → `dist/ui.html` (React JSX, bundled inline into HTML)
  - [x] 1.5 Create `src/ui/index.html` — minimal HTML shell with `<div id="root">` mount point and injection placeholders
  - [x] 1.6 Create `src/main/code.ts` — minimal entry that calls `figma.showUI(__html__, { width: 300, height: 500 })` and logs "Plugin loaded"
  - [x] 1.7 Create `src/ui/App.tsx` — minimal React component that renders "Plugin ready" into `#root`
  - [x] 1.8 Run `npm install`, build the plugin — `dist/code.js` (407B) and `dist/ui.html` (~1.1MB bundled) produced cleanly

- [x] 2.0 Fork and adapt DialKit component library
  - [x] 2.1 Copy DialKit source files into `src/ui/components/`: `Slider.tsx`, `Toggle.tsx`, `SegmentedControl.tsx`, `SelectControl.tsx`, `Folder.tsx`, `ColorControl.tsx`, `SpringControl.tsx`, `SpringVisualization.tsx`, `TextControl.tsx`, `ButtonGroup.tsx`
  - [x] 2.2 Remove DialKit features not needed for MVP: `PresetManager`, `DialRoot`, copy-to-clipboard toolbar, root panel morphing — none included in the fork
  - [x] 2.3 Remove all imports of `DialStore`. All components use `value` + `onChange` props. `SpringControl` manages mode with local `useState`.
  - [x] 2.4 Simplify `Folder.tsx`: collapsible section with spring animation, chevron. Root-panel morphing removed entirely.
  - [x] 2.5 Fix `SelectControl.tsx` portal: targets `document.getElementById('root') ?? document.body`
  - [x] 2.6 Create `src/styles/plugin.css`: Figma-native tokens (`#1e1e1e`, Inter, 11–12px, 32px row height, dense spacing), full component CSS
  - [x] 2.7 Build `src/ui/components/NumberInput.tsx`: labeled numeric input, arrow-key increment, blur-to-commit, validation
  - [x] 2.8 Create `src/ui/components/index.ts`: barrel export with renamed aliases (Select, Section, ColorSwatch, SpringEditor, TextInput, Button)
  - [x] 2.9 Test harness in `App.tsx` renders all components with live state — build passes cleanly. Verify in Figma.

- [x] 3.0 Build the postMessage communication layer
  - [x] 3.1 Create `src/shared/message-types.ts` defining TypeScript interfaces for every message type:
    - `SelectionContextMessage` — main → iframe, carries serialized selection data
    - `UIRenderMessage` — iframe → iframe (internal), carries the UI spec from LLM response
    - `ControlChangeMessage` — iframe → main, carries `{ controlId: string, value: any, action: string }` describing which figma.* update to apply
    - `ExecuteActionsMessage` — iframe → main, carries the `actions` array from LLM response
    - `ErrorMessage` — bidirectional, carries `{ source: string, message: string }`
    - `PluginReadyMessage` — iframe → main, signals the iframe has mounted
  - [x] 3.2 Create `src/main/message-handler.ts` — registers a `figma.ui.onmessage` listener that routes incoming messages by type to the appropriate handler (action executor, error logger, etc.)
  - [x] 3.3 Create helper functions in the iframe for sending messages to the main thread (`postToMain(message)` wrapper around `parent.postMessage({ pluginMessage: ... }, '*')`) and listening for messages from the main thread (`onMainMessage(callback)` wrapper around `window.addEventListener('message', ...)`)
  - [x] 3.4 Verify round-trip communication: iframe sends a `PluginReadyMessage` on mount → main thread receives it, sends back a `SelectionContextMessage` with dummy data → iframe receives and logs it. Confirm in Figma's developer console.

- [x] 4.0 Build plugin shell UI
  - [x] 4.1 Build the shell layout in `App.tsx`: a flex-column container that fills the iframe, with a scrollable render zone (top, `flex: 1`) and a fixed chat area (bottom)
  - [x] 4.2 Build `src/ui/chat/ChatInput.tsx` — a text input with a send button. Enter key submits. Input clears after submission. Disabled while a request is in flight. Calls an `onSubmit(message: string)` prop.
  - [x] 4.3 Build `src/ui/chat/ChatHistory.tsx` — displays a scrollable list of chat messages (user messages and assistant responses). Each message shows the sender and content. Error messages display in a distinct error style. Auto-scrolls to the latest message.
  - [x] 4.4 Build an empty state for the render zone — show a brief hint like "Select something and describe what you want" centered in the render zone when no UI has been generated yet
  - [x] 4.5 Build a loading indicator — shown in the render zone (or between chat messages) while the LLM request is in flight. A simple pulsing dot or spinner styled to match the dark theme.
  - [x] 4.6 Wire up state management in `App.tsx`: maintain `messages[]` (chat history), `currentUISpec` (the latest UI spec from LLM), `isLoading` (request in flight), `selectionContext` (latest from main thread). Listen for `SelectionContextMessage` from main thread and update `selectionContext`.
  - [x] 4.7 Style the shell to match Figma's native plugin aesthetic: `#1e1e1e` background, `#2c2c2c` chat input background, `#fff` text at 85% opacity, Inter font, 12px body text, 11px labels, tight padding (8px).

- [x] 5.0 Build the selection serializer
  - [x] 5.1 Create `src/main/selection-serializer.ts` with a `serializeSelection(nodes: readonly SceneNode[]): SelectionContext` function
  - [x] 5.2 For each selected node, extract: `id`, `type`, `name`, `x`, `y`, `width`, `height`, `rotation`, `opacity`, `visible`
  - [x] 5.3 Extract fill properties: `fills` array (type, color, opacity for solid fills; gradient stops for gradient fills; image hash for image fills)
  - [x] 5.4 Extract stroke properties: `strokes` array (color, weight, alignment)
  - [x] 5.5 Extract effects: `effects` array (type, radius, offset, color for shadows/blurs)
  - [x] 5.6 For text nodes: extract `fontSize`, `fontName`, `textAlignHorizontal`, `textAlignVertical`, `characters` (truncated to 100 chars), `lineHeight`, `letterSpacing`
  - [x] 5.7 Extract hierarchy: `parentId`, `parentName`, `childCount`. For frames/groups, include direct children's `id`, `type`, and `name` (one level deep only)
  - [x] 5.8 Extract prototyping connections if present: `reactions` array with `trigger`, `action type`, `destinationId`
  - [x] 5.9 Implement truncation: if total serialized context exceeds a configurable token limit (~2000 tokens, roughly 8000 characters), truncate children lists and add a summary (e.g., "…and 12 more children")
  - [x] 5.10 Register a `figma.on('selectionchange', ...)` listener in `code.ts` that calls the serializer and sends the result to the iframe via `figma.ui.postMessage`
  - [x] 5.11 Also serialize and send on plugin launch (initial selection)

- [x] 6.0 Build LLM integration and system prompt
  - [x] 6.1 Create `src/ui/api/claude.ts` — a function `callClaude(messages: ChatMessage[], systemPrompt: string): Promise<LLMResponse>` that makes a fetch request to `https://api.anthropic.com/v1/messages` with the appropriate headers (`x-api-key`, `anthropic-version`, `content-type`). Parse the response and extract the text content.
  - [x] 6.2 Handle API errors: network failures, 4xx/5xx responses, rate limiting. Return a structured error object rather than throwing, so the caller can display it in the chat.
  - [x] 6.3 Add API key configuration: for MVP, read from a hardcoded constant in `claude.ts` (with a clear `// TODO: move to settings` comment). Add a `.env` or `.gitignore` entry to avoid committing the key.
  - [x] 6.4 Create `src/ui/prompt/system-prompt.ts` — the system prompt that tells the LLM:
    - Its role (generating Figma plugin UI and actions on demand)
    - The response format (`{ "actions": [...], "ui": {...} }`)
    - The action format (structured JSON describing `figma.*` calls, with `method`, `nodeId`, and `args` fields)
    - The complete component catalog: every component name, its props with types and defaults, and a short usage example
    - Constraints: only use listed components, fall back to raw HTML with design tokens if nothing fits, keep UI concise
  - [x] 6.5 Create `src/ui/prompt/prompt-composer.ts` — a function `composePrompt(selectionContext, currentUISpec, chatHistory, userMessage): { system: string, messages: ChatMessage[] }` that assembles the full prompt. Selection context and current UI spec go into a system message or the first user message. Chat history maps to alternating user/assistant messages. The new user message goes last.
  - [x] 6.6 Parse the LLM response: extract JSON from the response text (handle cases where the LLM wraps JSON in markdown code fences). Validate that the parsed object has `actions` (array) and `ui` (object) fields. If validation fails, return an error describing what went wrong.
  - [x] 6.7 Wire into `App.tsx`: when the user submits a chat message, call `composePrompt` → `callClaude` → parse response → dispatch actions to main thread via postMessage → update `currentUISpec` in state. Add the user message and LLM response to chat history.

- [x] 7.0 Build the action executor
  - [x] 7.1 Create `src/main/action-executor.ts` with a function `executeActions(actions: Action[]): ExecutionResult` that processes an array of structured action objects
  - [x] 7.2 Define the `Action` interface: `{ method: string, nodeId?: string, args: Record<string, any>, parentId?: string }`. Support methods like: `createRectangle`, `createFrame`, `createText`, `setProperty`, `setFill`, `setStroke`, `setEffect`, `setLayoutProperties`, `appendChild`, `resize`, `setReactions`, etc.
  - [x] 7.3 Implement node resolution: given a `nodeId` string, find the corresponding node using `figma.getNodeById()`. For newly created nodes (where `nodeId` is a temporary reference), maintain a mapping of temp IDs → created nodes within the execution batch.
  - [x] 7.4 Wrap all actions in `figma.group(() => { ... })` (or the equivalent undo-group API) so the entire batch can be reverted with a single Cmd+Z
  - [x] 7.5 Execute actions sequentially. If an individual action throws an error, catch it, log the error with the action's index and method name, and continue with the next action. Collect all errors.
  - [x] 7.6 After execution, return an `ExecutionResult` with: `{ success: boolean, executedCount: number, errorCount: number, errors: string[], createdNodeIds: string[] }`. Send this back to the iframe via postMessage so it can be displayed in the chat.
  - [x] 7.7 Wire into `message-handler.ts`: when an `ExecuteActionsMessage` arrives, call `executeActions` and send the result back.

- [x] 8.0 Build the declarative UI renderer and live canvas update loop
  - [x] 8.1 Create `src/ui/renderer/UIRenderer.tsx` — a React component that takes a `spec: UISpec` prop (the JSON tree from the LLM) and renders it as a component tree
  - [x] 8.2 Implement the spec-to-component mapping: the renderer walks the JSON tree, and for each node, looks up the `type` field (`slider`, `toggle`, `select`, `section`, `color`, `spring`, `text`, `button`, `number`, `segmented`) and renders the corresponding component from `src/ui/components/`. Unknown types render a warning placeholder.
  - [x] 8.3 Wire `onChange` callbacks: each rendered control gets an `onChange` handler that sends a `ControlChangeMessage` to the main thread. The message includes the control's `id` (from the spec), the new value, and an `action` field describing what Figma API update to perform (this `action` comes from the LLM's spec — e.g., `{ method: "setProperty", nodeId: "123:45", property: "opacity" }`)
  - [x] 8.4 Handle partial UI updates: when the LLM returns an updated spec during iteration, merge it with the existing spec (replace controls by ID, add new ones, remove deleted ones) rather than always doing a full replacement. Support a `replace: true` flag from the LLM for full replacement.
  - [x] 8.5 In `src/main/message-handler.ts`, handle `ControlChangeMessage`: extract the `action` descriptor, resolve the target node, and apply the property update (e.g., `node.opacity = value`). No undo grouping for individual control changes — these are live tweaks.
  - [x] 8.6 Ensure control changes feel instant: the postMessage → node update → canvas repaint loop should have no perceptible delay. Avoid unnecessary serialization or re-rendering on either side.
  - [x] 8.7 Pass `currentUISpec` to `<UIRenderer>` in `App.tsx`. When `currentUISpec` changes (new LLM response), the renderer re-renders the full panel.

- [ ] 9.0 End-to-end integration and demo polish
  - [x] 9.1 Wire the full loop in `App.tsx` and `code.ts`: plugin opens → selection serialized → user types message → LLM called → actions executed on canvas → UI rendered in iframe → controls update canvas live → user iterates via chat
  - [ ] 9.2 Test with a simple scenario: select a rectangle, type "add a drop shadow with controls." Verify: shadow appears on the rectangle, a slider for shadow radius renders in the panel, dragging the slider updates the shadow in real time.
  - [ ] 9.3 Test iteration: after the first result, type "also add a slider for opacity." Verify: the panel adds an opacity slider without losing the shadow slider, and both controls work.
  - [ ] 9.4 Test with one of the demo scenarios from the PRD (e.g., depth system on a stack of cards, or mood shift on a filled frame). Tune the system prompt if the LLM produces poor output.
  - [x] 9.5 Handle edge cases: no selection (show a message asking the user to select something), LLM returns invalid JSON (show a clear error in chat, allow re-prompting), LLM returns actions referencing nonexistent nodes (executor skips and reports errors)
  - [x] 9.6 Verify atomic undo: after the LLM executes a batch of actions, pressing Cmd+Z should revert all of them in one step
  - [x] 9.7 Polish the system prompt: rewritten for iterative plugin building — LLM framed as creative plugin designer, supports additive refinement via replace:false, syntax reference demoted from template to format example, component catalog includes defaultValue guidance on every type
  - [x] 9.8 Final visual polish: added render-zone fade gradient for scroll hint, send button active state, ui-renderer bottom padding for spacing. Dark theme consistent, controls properly sized.
  - [ ] 9.9 Record a short screen capture of the end-to-end demo for internal sharing
