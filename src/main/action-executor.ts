/// <reference types="@figma/plugin-typings" />

import type { ActionDescriptor, ExecutionResult } from '../shared/message-types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

// Maps tempId strings assigned by the LLM to real nodes created in this batch.
type TempNodeMap = Map<string, SceneNode>;

// ─── Node resolution ──────────────────────────────────────────────────────────

/**
 * Resolves a nodeId to a SceneNode, checking the tempId map first (for nodes
 * created earlier in the same batch), then falling back to figma.getNodeById().
 */
function resolveNode(
  nodeId: string | undefined,
  tempMap: TempNodeMap,
): SceneNode {
  if (!nodeId) throw new Error('No nodeId provided.');

  const temp = tempMap.get(nodeId);
  if (temp) return temp;

  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (node.type === 'DOCUMENT' || node.type === 'PAGE') {
    throw new Error(`Cannot target document or page node: ${nodeId}`);
  }
  return node as SceneNode;
}

/**
 * Resolves a parentId to a container node.
 */
function resolveParent(
  parentId: string | undefined,
  tempMap: TempNodeMap,
): FrameNode | GroupNode | PageNode | ComponentNode | SectionNode {
  if (!parentId) return figma.currentPage;
  const node = tempMap.get(parentId) ?? figma.getNodeById(parentId);
  if (!node) throw new Error(`Parent node not found: ${parentId}`);
  if (
    node.type !== 'FRAME' &&
    node.type !== 'GROUP' &&
    node.type !== 'COMPONENT' &&
    node.type !== 'COMPONENT_SET' &&
    node.type !== 'SECTION' &&
    node.type !== 'PAGE'
  ) {
    throw new Error(`Node ${parentId} (${node.type}) cannot contain children.`);
  }
  return node as FrameNode | GroupNode | PageNode | ComponentNode | SectionNode;
}

// ─── Paint / effect helpers ───────────────────────────────────────────────────

function toRGB(raw: unknown): RGB {
  if (typeof raw !== 'object' || raw === null) return { r: 0, g: 0, b: 0 };
  const c = raw as Record<string, unknown>;
  return {
    r: typeof c.r === 'number' ? c.r : 0,
    g: typeof c.g === 'number' ? c.g : 0,
    b: typeof c.b === 'number' ? c.b : 0,
  };
}

function toRGBA(raw: unknown): RGBA {
  const rgb = toRGB(raw);
  const c = raw as Record<string, unknown>;
  return { ...rgb, a: typeof c.a === 'number' ? c.a : 1 };
}

function toPaints(rawFills: unknown): Paint[] {
  if (!Array.isArray(rawFills)) return [];
  return rawFills.map((f): Paint => {
    const fill = f as Record<string, unknown>;
    const type = String(fill.type ?? 'SOLID');

    if (type === 'SOLID') {
      return {
        type: 'SOLID',
        color: toRGB(fill.color),
        opacity: typeof fill.opacity === 'number' ? fill.opacity : 1,
      } as SolidPaint;
    }

    // Gradient passthrough — minimal conversion.
    if (type.startsWith('GRADIENT_')) {
      const stops: ColorStop[] = Array.isArray(fill.gradientStops)
        ? (fill.gradientStops as unknown[]).map(s => {
            const stop = s as Record<string, unknown>;
            return {
              position: typeof stop.position === 'number' ? stop.position : 0,
              color: toRGBA(stop.color),
            };
          })
        : [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } }, { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } }];
      return {
        type: type as 'GRADIENT_LINEAR',
        gradientTransform: [[1, 0, 0], [0, 1, 0]],
        gradientStops: stops,
        opacity: typeof fill.opacity === 'number' ? fill.opacity : 1,
      } as GradientPaint;
    }

    // Default: transparent solid
    return { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0 } as SolidPaint;
  });
}

function toEffects(rawEffects: unknown): Effect[] {
  if (!Array.isArray(rawEffects)) return [];
  return rawEffects.map((e): Effect => {
    const effect = e as Record<string, unknown>;
    const type = String(effect.type ?? 'DROP_SHADOW');

    if (type === 'DROP_SHADOW' || type === 'INNER_SHADOW') {
      const offsetRaw = effect.offset as Record<string, unknown> | undefined;
      return {
        type: type as 'DROP_SHADOW',
        color: toRGBA(effect.color),
        offset: {
          x: typeof offsetRaw?.x === 'number' ? offsetRaw.x : 0,
          y: typeof offsetRaw?.y === 'number' ? offsetRaw.y : 4,
        },
        radius: typeof effect.radius === 'number' ? effect.radius : 8,
        spread: typeof effect.spread === 'number' ? effect.spread : 0,
        visible: effect.visible !== false,
        blendMode: 'NORMAL',
        showShadowBehindNode: false,
      } as DropShadowEffect;
    }

    if (type === 'LAYER_BLUR' || type === 'BACKGROUND_BLUR') {
      return {
        type: type as 'LAYER_BLUR',
        radius: typeof effect.radius === 'number' ? effect.radius : 8,
        visible: effect.visible !== false,
      } as BlurEffect;
    }

    // Unknown — return a no-op blur.
    return { type: 'LAYER_BLUR', radius: 0, visible: false } as BlurEffect;
  });
}

// ─── Method implementations ───────────────────────────────────────────────────

function execCreateRectangle(args: Args, tempMap: TempNodeMap, tempId?: string): SceneNode {
  const node = figma.createRectangle();
  if (typeof args.x === 'number') node.x = args.x;
  if (typeof args.y === 'number') node.y = args.y;
  if (typeof args.width === 'number' && typeof args.height === 'number') {
    node.resize(args.width as number, args.height as number);
  }
  const parent = resolveParent(undefined, tempMap);
  parent.appendChild(node);
  if (tempId) tempMap.set(tempId, node);
  return node;
}

function execCreateFrame(args: Args, tempMap: TempNodeMap, tempId?: string): SceneNode {
  const node = figma.createFrame();
  if (typeof args.x === 'number') node.x = args.x;
  if (typeof args.y === 'number') node.y = args.y;
  if (typeof args.width === 'number' && typeof args.height === 'number') {
    node.resize(args.width as number, args.height as number);
  }
  const parent = resolveParent(undefined, tempMap);
  parent.appendChild(node);
  if (tempId) tempMap.set(tempId, node);
  return node;
}

function execCreateText(args: Args, tempMap: TempNodeMap, tempId?: string): SceneNode {
  const node = figma.createText();
  if (typeof args.x === 'number') node.x = args.x;
  if (typeof args.y === 'number') node.y = args.y;
  if (typeof args.fontSize === 'number') node.fontSize = args.fontSize;
  if (typeof args.characters === 'string') node.characters = args.characters;
  const parent = resolveParent(undefined, tempMap);
  parent.appendChild(node);
  if (tempId) tempMap.set(tempId, node);
  return node;
}

function execSetProperty(node: SceneNode, args: Args): void {
  const prop = String(args.property ?? '');
  if (!prop) throw new Error('setProperty requires a "property" arg.');

  // Determine the value: prefer args.value, fall back to the numeric/bool args
  // the LLM sometimes provides at the top level.
  const value = 'value' in args ? args.value : undefined;
  if (value === undefined) throw new Error(`setProperty: no "value" provided for property "${prop}".`);

  // Use type assertion — the property names come from LLM output which we trust
  // for MVP (per PRD). Invalid properties will throw at runtime and be caught.
  (node as unknown as Record<string, unknown>)[prop] = value;
}

function execSetFill(node: SceneNode, args: Args): void {
  if (!('fills' in node)) throw new Error(`Node type ${node.type} does not support fills.`);

  // If the value is a hex color string (from color control), convert it.
  if (typeof args.value === 'string' && args.value.startsWith('#')) {
    const hex = args.value.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    (node as GeometryMixin).fills = [{ type: 'SOLID', color: { r, g, b }, opacity: 1 }];
    return;
  }

  const rawFills = args.fills ?? (Array.isArray(args.value) ? args.value : undefined);
  (node as GeometryMixin).fills = toPaints(rawFills);
}

function execSetStroke(node: SceneNode, args: Args): void {
  if (!('strokes' in node)) throw new Error(`Node type ${node.type} does not support strokes.`);
  const rawStrokes = args.strokes ?? (Array.isArray(args.value) ? args.value : []);
  (node as GeometryMixin).strokes = toPaints(rawStrokes);
  if (typeof args.weight === 'number') {
    (node as GeometryMixin).strokeWeight = args.weight;
  }
  if (typeof args.align === 'string') {
    (node as GeometryMixin).strokeAlign = args.align as StrokeAlign;
  }
}

function execSetEffect(node: SceneNode, args: Args): void {
  if (!('effects' in node)) throw new Error(`Node type ${node.type} does not support effects.`);
  const rawEffects = args.effects ?? (Array.isArray(args.value) ? args.value : []);
  (node as BlendMixin).effects = toEffects(rawEffects);
}

function execSetCornerRadius(node: SceneNode, args: Args): void {
  if (!('cornerRadius' in node)) throw new Error(`Node type ${node.type} does not support cornerRadius.`);
  const r = typeof args.radius === 'number' ? args.radius : (args.value as number);
  (node as RectangleNode).cornerRadius = r;
}

function execSetLayoutProperties(node: SceneNode, args: Args): void {
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') {
    throw new Error(`setLayoutProperties requires a Frame or Component, got ${node.type}.`);
  }
  const frame = node as FrameNode;

  // Special case: the LLM may send a single property + value pair (from a control change).
  if (typeof args.property === 'string' && 'value' in args) {
    (frame as unknown as Record<string, unknown>)[args.property as string] = args.value;
    return;
  }

  if (typeof args.layoutMode === 'string') frame.layoutMode = args.layoutMode as 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  if (typeof args.primaryAxisSizingMode === 'string') frame.primaryAxisSizingMode = args.primaryAxisSizingMode as 'FIXED' | 'AUTO';
  if (typeof args.counterAxisSizingMode === 'string') frame.counterAxisSizingMode = args.counterAxisSizingMode as 'FIXED' | 'AUTO';
  if (typeof args.itemSpacing === 'number') frame.itemSpacing = args.itemSpacing;
  if (typeof args.paddingTop === 'number') frame.paddingTop = args.paddingTop;
  if (typeof args.paddingRight === 'number') frame.paddingRight = args.paddingRight;
  if (typeof args.paddingBottom === 'number') frame.paddingBottom = args.paddingBottom;
  if (typeof args.paddingLeft === 'number') frame.paddingLeft = args.paddingLeft;
  if (typeof args.padding === 'number') {
    frame.paddingTop = frame.paddingRight = frame.paddingBottom = frame.paddingLeft = args.padding;
  }
}

function execResize(node: SceneNode, args: Args): void {
  if (!('resize' in node)) throw new Error(`Node type ${node.type} does not support resize.`);
  const w = typeof args.width === 'number' ? args.width : (node as LayoutMixin).width;
  const h = typeof args.height === 'number' ? args.height : (node as LayoutMixin).height;
  (node as LayoutMixin).resize(w, h);
}

function execAppendChild(action: ActionDescriptor, tempMap: TempNodeMap): void {
  const child = resolveNode(action.nodeId, tempMap) as SceneNode;
  const parent = resolveParent(action.parentId, tempMap);
  parent.appendChild(child);
}

function execDeleteNode(node: SceneNode): void {
  node.remove();
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function dispatchAction(action: ActionDescriptor, tempMap: TempNodeMap): SceneNode | null {
  const { method, nodeId, args, tempId } = action;
  const a = (args ?? {}) as Args;

  switch (method) {
    case 'createRectangle':
      return execCreateRectangle(a, tempMap, tempId);

    case 'createFrame':
      return execCreateFrame(a, tempMap, tempId);

    case 'createText':
      return execCreateText(a, tempMap, tempId);

    case 'setProperty': {
      const node = resolveNode(nodeId, tempMap);
      execSetProperty(node, a);
      return null;
    }

    case 'setFill': {
      const node = resolveNode(nodeId, tempMap);
      execSetFill(node, a);
      return null;
    }

    case 'setStroke': {
      const node = resolveNode(nodeId, tempMap);
      execSetStroke(node, a);
      return null;
    }

    case 'setEffect': {
      const node = resolveNode(nodeId, tempMap);
      execSetEffect(node, a);
      return null;
    }

    case 'setCornerRadius': {
      const node = resolveNode(nodeId, tempMap);
      execSetCornerRadius(node, a);
      return null;
    }

    case 'setLayoutProperties': {
      const node = resolveNode(nodeId, tempMap);
      execSetLayoutProperties(node, a);
      return null;
    }

    case 'resize': {
      const node = resolveNode(nodeId, tempMap);
      execResize(node, a);
      return null;
    }

    case 'appendChild':
      execAppendChild(action, tempMap);
      return null;

    case 'deleteNode': {
      const node = resolveNode(nodeId, tempMap);
      execDeleteNode(node);
      return null;
    }

    default:
      throw new Error(`Unknown action method: "${method}"`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Executes a batch of LLM-generated actions inside a single undo group.
 * Individual action failures are caught and collected — execution continues.
 */
export function executeActions(actions: ActionDescriptor[]): ExecutionResult {
  const errors: string[] = [];
  const createdNodeIds: string[] = [];
  let executedCount = 0;

  const tempMap: TempNodeMap = new Map();

  figma.commitUndo(); // Close any open undo group before starting a new batch.

  // figma.batch is not part of the Plugin API; the canonical way to group
  // multiple changes into one undo step is to wrap them in a closure passed
  // to a plugin-specific undo group. The Figma Plugin API groups all
  // synchronous plugin operations between consecutive figma.commitUndo() calls
  // into a single undo step automatically. We call commitUndo() once at the
  // end to finalise the group.
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    try {
      const created = dispatchAction(action, tempMap);
      executedCount++;
      if (created) {
        createdNodeIds.push(created.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${i}] ${action.method}: ${msg}`);
      console.error(`[action-executor] action[${i}] ${action.method} failed:`, msg);
    }
  }

  // Commit finalises all the changes above as a single undoable step.
  figma.commitUndo();

  return {
    success: errors.length === 0,
    executedCount,
    errorCount: errors.length,
    errors,
    createdNodeIds,
  };
}

/**
 * Applies a single live control-change action without undo grouping.
 * These are immediate tweaks — the user dragging a slider — so they
 * should not create undo history entries.
 */
export function applyControlChange(action: ActionDescriptor, value: unknown): void {
  const tempMap: TempNodeMap = new Map();
  // Merge the live value into the action args so every method can find it.
  const merged: ActionDescriptor = {
    ...action,
    args: { ...action.args, value },
  };
  dispatchAction(merged, tempMap);
}
