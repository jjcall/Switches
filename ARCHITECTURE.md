# Architecture

## System Overview

Three isolated environments communicate through message passing and HTTP:

```mermaid
graph TB
    subgraph figma["Figma Main Thread (sandbox)"]
        code["code.ts<br/><i>entry point</i>"]
        handler["message-handler.ts<br/><i>message router</i>"]
        serializer["selection-serializer.ts<br/><i>nodes → JSON</i>"]
        executor["action-executor.ts<br/><i>Figma API calls</i>"]

        code --> handler
        code -->|selectionchange| serializer
        handler --> executor
    end

    subgraph iframe["UI Iframe (React)"]
        app["App.tsx<br/><i>orchestrator</i>"]
        composer["prompt-composer.ts<br/><i>prompt assembly</i>"]
        modules["prompt-modules.ts<br/><i>conditional docs</i>"]
        core["system-prompt.ts<br/><i>core prompt</i>"]
        claude["claude.ts<br/><i>API client</i>"]
        codegen["codegen.ts<br/><i>generator runtime + lib</i>"]
        renderer["UIRenderer.tsx<br/><i>control panel</i>"]

        app --> composer
        composer --> core
        composer --> modules
        app --> claude
        app --> codegen
        app --> renderer
    end

    subgraph external["External"]
        proxy["proxy.mjs<br/><i>CORS proxy :3333</i>"]
        anthropic["Anthropic API<br/><i>Claude</i>"]

        proxy --> anthropic
    end

    handler <-->|postMessage| app
    serializer -->|SELECTION_CONTEXT| app
    app -->|EXECUTE_ACTIONS| executor
    renderer -->|CONTROL_CHANGE| handler
    claude -->|HTTP| proxy

    style figma fill:#1a1a2e,stroke:#e94560,color:#fff
    style iframe fill:#1a1a2e,stroke:#0f3460,color:#fff
    style external fill:#1a1a2e,stroke:#16213e,color:#fff
```

## Request Lifecycle

From user prompt to canvas output:

```mermaid
sequenceDiagram
    participant U as User
    participant UI as UI Iframe
    participant C as Composer
    participant API as Claude API
    participant Gen as Generator Runtime
    participant Main as Figma Main Thread
    participant Canvas as Figma Canvas

    U->>UI: types prompt
    UI->>C: composePrompt()

    Note over C: selectModules() scans<br/>keywords + selection context<br/>→ picks relevant doc modules

    C-->>UI: { system, messages }
    UI->>API: callClaude()

    Note over API: retry on 429/5xx<br/>stream or batch<br/>dynamic max_tokens

    API-->>UI: { actions, ui, generate?, message? }

    alt Direct Actions (no generate)
        UI->>Main: EXECUTE_ACTIONS
        Main->>Canvas: setFill, setEffect, etc.
        Note over Canvas: Controls patch properties<br/>directly via CONTROL_CHANGE
    else Generator Function
        UI->>Gen: compileGenerator()
        Gen-->>UI: ActionDescriptor[]
        UI->>Main: EXECUTE_ACTIONS
        Main->>Canvas: createFrame, createEllipse, etc.
        Note over Canvas: Controls trigger<br/>full generator re-run
    end

    Main-->>UI: EXECUTION_RESULT
    UI-->>U: control panel rendered
```

## Prompt Assembly

How the system prompt is composed per request:

```mermaid
graph LR
    subgraph always["Always Included"]
        CP["CORE_PROMPT<br/><i>~6K tokens</i><br/>role, format, actions,<br/>UI controls, constraints"]
    end

    subgraph conditional["Conditionally Included"]
        GI["Generator Intro<br/><i>basic utils, helpers</i>"]
        CH["Chroma<br/><i>color science</i>"]
        NO["Noise<br/><i>simplex-noise</i>"]
        EA["Easing<br/><i>bezier curves</i>"]
        DL["Delaunay<br/><i>Voronoi</i>"]
        IM["Image<br/><i>pixel processing</i>"]
        TD["3D + Paths<br/><i>projection, samplePath</i>"]
        LS["L-Systems<br/><i>fractals</i>"]
        QR["QR Codes"]
        FF["Flow Fields"]
        CT["Charts"]
        RO["Rough<br/><i>sketchy style</i>"]
        PA["Patterns<br/><i>tile fills</i>"]
        CO["Computational<br/><i>pack, attract, meta,<br/>DLA, CA, WFC</i>"]
        RD["Reaction-Diffusion<br/><i>Turing patterns</i>"]
        EX["Examples<br/><i>7 generators</i>"]
        GR["Generator Rules<br/><i>29 rules</i>"]
    end

    UM["User Message"] -->|keyword scan| SEL["selectModules()"]
    SC["Selection Context"] -->|has vectorPaths?| SEL

    SEL --> CP
    SEL -->|generator likely| GI
    SEL -->|generator likely| CH
    SEL -->|generator likely| EX
    SEL -->|generator likely| GR
    SEL -->|matched keywords| NO
    SEL -->|matched keywords| DL
    SEL -->|matched keywords| IM
    SEL -->|matched keywords| TD
    SEL -->|matched keywords| LS
    SEL -->|matched keywords| QR
    SEL -->|matched keywords| FF
    SEL -->|matched keywords| CT
    SEL -->|matched keywords| RO
    SEL -->|matched keywords| PA
    SEL -->|matched keywords| CO
    SEL -->|matched keywords| RD

    style always fill:#0d1b2a,stroke:#e0e1dd,color:#fff
    style conditional fill:#1b263b,stroke:#778da9,color:#fff
```

## Selection Context Flow

How Figma node data reaches the LLM:

```mermaid
flowchart LR
    A["Figma Selection<br/><i>user clicks nodes</i>"] -->|debounced 150ms| B["selection-serializer.ts"]

    B --> C{"Serialize each node"}
    C --> D["Position, size<br/><i>rounded to 1dp</i>"]
    C --> E["Fills, strokes, effects<br/><i>RGB rounded to 3dp</i>"]
    C --> F["Children<br/><i>truncated to budget</i>"]
    C --> G["Vector paths<br/><i>SVG path data</i>"]
    C --> H["Text properties"]

    D & E & F & G & H --> I["Strip defaults<br/><i>omit rotation:0, opacity:1,<br/>visible:true, empty arrays</i>"]

    I --> J["Truncate to 12K chars"]
    J --> K["SelectionContext JSON<br/><i>compact, minified</i>"]
    K -->|postMessage| L["UI Iframe"]
    L --> M["Embedded in prompt<br/>as user message preamble"]

    style A fill:#2d6a4f,stroke:#95d5b2,color:#fff
    style K fill:#1b4332,stroke:#52b788,color:#fff
```

## Control Interaction Modes

Two distinct paths for how controls update the canvas:

```mermaid
flowchart TB
    subgraph direct["Direct Mode"]
        direction LR
        S1["Slider moved"] --> A1["CONTROL_CHANGE<br/><i>{ controlId, value, action }</i>"]
        A1 --> E1["action-executor<br/><i>patches one property</i>"]
        E1 --> C1["Canvas updated<br/><i>instant, single property</i>"]
    end

    subgraph generator["Generator Mode"]
        direction LR
        S2["Slider moved"] --> D2["Debounce 100ms"]
        D2 --> G2["Re-run generate(params, lib)"]
        G2 --> R2["Delete old children<br/>+ create new"]
        R2 --> C2["Canvas rebuilt<br/><i>full re-render</i>"]
    end

    Note["The LLM decides which mode to use:<br/>Direct for simple property edits,<br/>Generator for computed layouts"]

    style direct fill:#0a1628,stroke:#4cc9f0,color:#fff
    style generator fill:#0a1628,stroke:#f72585,color:#fff
```

## Chat History Management

How conversation history is bounded:

```mermaid
flowchart LR
    subgraph history["Chat History (unbounded input)"]
        T1["Turn 1"] --> T2["Turn 2"] --> T3["Turn 3"] --> T4["Turn 4"] --> T5["Turn 5"] --> T6["Turn 6"]
    end

    subgraph processed["Processed for API"]
        O1["Turn 1<br/><i>summarized</i><br/>'Created shadow plugin<br/>with 4 controls'"]
        O2["Turn 2<br/><i>summarized</i>"]
        O3["Turn 3<br/><i>full content</i>"]
        O4["Turn 4<br/><i>full content</i>"]
        O5["Turn 5<br/><i>full content</i>"]
        O6["Turn 6<br/><i>full content</i>"]
    end

    T1 & T2 -.->|older: strip JSON,<br/>keep message only| O1 & O2
    T3 & T4 & T5 & T6 -->|last 4 turns:<br/>kept in full| O3 & O4 & O5 & O6

    O1 & O2 & O3 & O4 & O5 & O6 --> B["20K char budget<br/><i>drop oldest if exceeded</i>"]

    style history fill:#1a1a2e,stroke:#e94560,color:#fff
    style processed fill:#16213e,stroke:#0f3460,color:#fff
```
