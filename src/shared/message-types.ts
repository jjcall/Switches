// ─── Selection context ────────────────────────────────────────────────────────

export interface SolidFill {
  type: 'SOLID';
  color: { r: number; g: number; b: number };
  opacity: number;
}

export interface GradientStop {
  position: number;
  color: { r: number; g: number; b: number; a: number };
}

export interface GradientFill {
  type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND';
  gradientStops: GradientStop[];
  opacity: number;
}

export interface ImageFill {
  type: 'IMAGE';
  imageHash: string | null;
  opacity: number;
}

export type FillDescriptor = SolidFill | GradientFill | ImageFill;

export interface StrokeDescriptor {
  color: { r: number; g: number; b: number };
  opacity: number;
  weight: number;
  alignment: 'CENTER' | 'INSIDE' | 'OUTSIDE';
}

export interface ShadowEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW';
  color: { r: number; g: number; b: number; a: number };
  offset: { x: number; y: number };
  radius: number;
  spread?: number;
  visible: boolean;
}

export interface BlurEffect {
  type: 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  radius: number;
  visible: boolean;
}

export type EffectDescriptor = ShadowEffect | BlurEffect;

export interface ChildSummary {
  id: string;
  type: string;
  name: string;
}

export interface ReactionDescriptor {
  trigger: string;
  actionType: string;
  destinationId: string | null;
}

export interface NodeDescriptor {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  fills: FillDescriptor[];
  strokes: StrokeDescriptor[];
  effects: EffectDescriptor[];
  parentId: string | null;
  parentName: string | null;
  childCount: number;
  children?: ChildSummary[];
  // Text-node specific
  fontSize?: number;
  fontName?: { family: string; style: string };
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  characters?: string;
  lineHeight?: LineHeight;
  letterSpacing?: LetterSpacing;
  // Vector path geometry (SVG path data strings)
  vectorPaths?: string[];
  // Prototyping
  reactions?: ReactionDescriptor[];
}

export interface LineHeight {
  unit: 'AUTO' | 'PIXELS' | 'PERCENT';
  value?: number;
}

export interface LetterSpacing {
  unit: 'PIXELS' | 'PERCENT';
  value: number;
}

export interface SelectionContext {
  nodes: NodeDescriptor[];
  truncated: boolean;
  /** Stored plugin spec JSON from a previously generated frame (if selected). */
  pluginSpec?: string;
  /** Stored prompt history JSON from a previously generated frame (if selected). */
  pluginMessages?: string;
}

// ─── Message types ────────────────────────────────────────────────────────────

/** Main → iframe: sends serialized selection whenever it changes. */
export interface SelectionContextMessage {
  type: 'SELECTION_CONTEXT';
  payload: SelectionContext;
}

/** Iframe → iframe (internal): carries the UI spec emitted by the LLM. */
export interface UIRenderMessage {
  type: 'UI_RENDER';
  payload: UISpec;
}

/** Iframe → main: describes one or more Figma API updates triggered by a control. */
export interface ControlChangeMessage {
  type: 'CONTROL_CHANGE';
  payload: {
    controlId: string;
    value: unknown;
    /** Single action (backwards compat) or multiple coordinated actions. */
    action?: ActionDescriptor;
    actions?: ActionDescriptor[];
  };
}

/** Iframe → main: the full actions array from an LLM response. */
export interface ExecuteActionsMessage {
  type: 'EXECUTE_ACTIONS';
  payload: {
    actions: ActionDescriptor[];
    /** Serialized UISpec JSON to persist on the root frame via setPluginData. */
    pluginSpec?: string;
    /** Explicit node ID to persist pluginSpec on (used for spec-only updates). */
    persistNodeId?: string;
    /** After execution, select this node (real or temp ID) and fire selectionchange. */
    selectNodeId?: string;
    /** Skip centering/repositioning newly created nodes (used for wrapping). */
    skipCenter?: boolean;
  };
}

/** Bidirectional: communicates an error. */
export interface ErrorMessage {
  type: 'ERROR';
  payload: {
    source: string;
    message: string;
  };
}

/** Iframe → main: signals the iframe has mounted and is ready to receive messages. */
export interface PluginReadyMessage {
  type: 'PLUGIN_READY';
}

/** Main → iframe: reports the result of executing an actions batch. */
export interface ExecutionResultMessage {
  type: 'EXECUTION_RESULT';
  payload: ExecutionResult;
}

export interface ExecutionResult {
  success: boolean;
  executedCount: number;
  errorCount: number;
  errors: string[];
  createdNodeIds: string[];
  /** Maps tempId strings used in the action batch to real Figma node IDs. */
  tempIdMap?: Record<string, string>;
  /** The ID of the top-level frame created by a generator, for frame reuse on re-apply. */
  rootFrameId?: string;
}

/** Iframe → main: request pixel data for a node (for image-processing generators). */
export interface RequestImageDataMessage {
  type: 'REQUEST_IMAGE_DATA';
  payload: {
    requestId: string;
    nodeId: string;
    maxWidth: number;
  };
}

/** Main → iframe: pixel data response. */
export interface ImageDataMessage {
  type: 'IMAGE_DATA';
  payload: {
    requestId: string;
    width: number;
    height: number;
    pixels: number[];
  };
}

export type MainToIframeMessage =
  | SelectionContextMessage
  | ExecutionResultMessage
  | ErrorMessage
  | ImageDataMessage
  | ClientStorageValueMessage;

export interface ClearPluginDataMessage {
  type: 'CLEAR_PLUGIN_DATA';
  payload: {
    nodeId: string;
  };
}

/** Iframe → main: persist prompt history on a node. */
export interface PersistMessagesMessage {
  type: 'PERSIST_MESSAGES';
  payload: {
    nodeId: string;
    messages: string;
  };
}

export interface ClosePluginMessage {
  type: 'CLOSE_PLUGIN';
}

/** Iframe → main: persist a value in figma.clientStorage. */
export interface SetClientStorageMessage {
  type: 'SET_CLIENT_STORAGE';
  payload: {
    key: string;
    value: string;
  };
}

/** Iframe → main: delete a value from figma.clientStorage. */
export interface DeleteClientStorageMessage {
  type: 'DELETE_CLIENT_STORAGE';
  payload: {
    key: string;
  };
}

/** Main → iframe: delivers a value from figma.clientStorage. */
export interface ClientStorageValueMessage {
  type: 'CLIENT_STORAGE_VALUE';
  payload: {
    key: string;
    value: string | null;
  };
}

export type IframeToMainMessage =
  | PluginReadyMessage
  | ControlChangeMessage
  | ExecuteActionsMessage
  | ErrorMessage
  | RequestImageDataMessage
  | ClearPluginDataMessage
  | PersistMessagesMessage
  | ClosePluginMessage
  | SetClientStorageMessage
  | DeleteClientStorageMessage;

// ─── UI spec (LLM → renderer) ─────────────────────────────────────────────────

export interface UISpec {
  replace?: boolean;
  /** Control IDs to remove during merge. Applied before adding new controls. */
  removeControls?: string[];
  /** Control interaction mode. live = immediate canvas updates, apply = update on Apply button only. */
  mode?: 'live' | 'apply';
  /** Template actions used for apply-mode regeneration (simple placeholder substitution). */
  actionTemplate?: ActionDescriptor[];
  /** JS function body that receives (params, lib) and returns ActionDescriptor[].
   *  Preferred over actionTemplate when the plugin needs loops, randomness, or computation. */
  generate?: string;
  /** When set, the runtime pre-fetches pixel data for this node before running the generator.
   *  The data is available as lib.imageData inside the generate function. */
  imageNodeId?: string;
  /** Max pixel width for image export. Default 100 for sampling generators, set 400-800 for bitmap effects. */
  imageMaxWidth?: number;
  controls: UIControl[];
}

export interface UIControl {
  id: string;
  type:
    | 'slider'
    | 'toggle'
    | 'select'
    | 'color'
    | 'text'
    | 'button'
    | 'number'
    | 'segmented'
    | 'dial'
    | 'xy-pad'
    | 'range'
    | 'gradient-bar'
    | 'curve';
  label?: string;
  props?: Record<string, unknown>;
  /** Single Figma API update when this control changes (simple case). */
  action?: ActionDescriptor;
  /** Multiple coordinated Figma API updates (for controls that drive multiple properties). */
  actions?: ActionDescriptor[];
}

// ─── Action descriptor (LLM → executor) ──────────────────────────────────────

export interface ActionDescriptor {
  method: string;
  nodeId?: string;
  parentId?: string;
  args: Record<string, unknown>;
  /** Temporary ID used to reference nodes created earlier in the same batch. */
  tempId?: string;
}
