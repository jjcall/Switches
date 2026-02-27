/// <reference types="@figma/plugin-typings" />

import type { ActionDescriptor, ExecutionResult } from '../shared/message-types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

// Maps tempId strings assigned by the LLM to real nodes created in this batch.
type TempNodeMap = Map<string, SceneNode>;

// ─── Node resolution ──────────────────────────────────────────────────────────

/**
 * Resolves a nodeId to a SceneNode, checking the tempId map first (for nodes
 * created earlier in the same batch), then falling back to figma.getNodeByIdAsync().
 */
async function resolveNode(
  nodeId: string | undefined,
  tempMap: TempNodeMap,
): Promise<SceneNode> {
  if (!nodeId) throw new Error('No nodeId provided.');

  const temp = tempMap.get(nodeId);
  if (temp) return temp;

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (node.type === 'DOCUMENT' || node.type === 'PAGE') {
    throw new Error(`Cannot target document or page node: ${nodeId}`);
  }
  return node as SceneNode;
}

/**
 * Resolves a parentId to a container node.
 */
async function resolveParent(
  parentId: string | undefined,
  tempMap: TempNodeMap,
): Promise<FrameNode | GroupNode | PageNode | ComponentNode | SectionNode> {
  if (!parentId) return figma.currentPage;
  const node = tempMap.get(parentId) ?? await figma.getNodeByIdAsync(parentId);
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
      const color = toRGBA(effect.color);
      if (typeof effect.opacity === 'number') {
        color.a = effect.opacity;
      }
      const base = {
        type: type as 'DROP_SHADOW',
        color,
        offset: {
          x: typeof offsetRaw?.x === 'number' ? offsetRaw.x : 0,
          y: typeof offsetRaw?.y === 'number' ? offsetRaw.y : 4,
        },
        radius: typeof effect.radius === 'number' ? effect.radius : 8,
        spread: typeof effect.spread === 'number' ? effect.spread : 0,
        visible: effect.visible !== false,
        blendMode: 'NORMAL' as const,
      };
      if (type === 'DROP_SHADOW') {
        return { ...base, showShadowBehindNode: false } as DropShadowEffect;
      }
      return base as InnerShadowEffect;
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

async function execCreateRectangle(args: Args, tempMap: TempNodeMap, tempId?: string, parentId?: string): Promise<SceneNode> {
  const node = figma.createRectangle();
  if (typeof args.x === 'number') node.x = args.x;
  if (typeof args.y === 'number') node.y = args.y;
  if (typeof args.width === 'number' && typeof args.height === 'number') {
    node.resize(args.width as number, args.height as number);
  }
  if (typeof args.cornerRadius === 'number') {
    node.cornerRadius = args.cornerRadius;
  }
  if (typeof args.name === 'string') node.name = args.name;
  const parent = await resolveParent(parentId, tempMap);
  parent.appendChild(node);
  if (tempId) tempMap.set(tempId, node);
  return node;
}

async function execCreateFrame(args: Args, tempMap: TempNodeMap, tempId?: string, parentId?: string): Promise<SceneNode> {
  const node = figma.createFrame();
  if (typeof args.x === 'number') node.x = args.x;
  if (typeof args.y === 'number') node.y = args.y;
  if (typeof args.width === 'number' && typeof args.height === 'number') {
    node.resize(args.width as number, args.height as number);
  }
  if (typeof args.name === 'string') node.name = args.name;
  const parent = await resolveParent(parentId, tempMap);
  parent.appendChild(node);
  if (tempId) tempMap.set(tempId, node);
  return node;
}

async function execCreateEllipse(args: Args, tempMap: TempNodeMap, tempId?: string, parentId?: string): Promise<SceneNode> {
  const node = figma.createEllipse();
  if (typeof args.x === 'number') node.x = args.x;
  if (typeof args.y === 'number') node.y = args.y;
  if (typeof args.width === 'number' && typeof args.height === 'number') {
    node.resize(args.width as number, args.height as number);
  }
  if (typeof args.name === 'string') node.name = args.name;
  const parent = await resolveParent(parentId, tempMap);
  parent.appendChild(node);
  if (tempId) tempMap.set(tempId, node);
  return node;
}

/**
 * Normalize an SVG path string for Figma's vectorPaths parser, which requires
 * spaces between command letters and their numeric arguments.
 * d3-delaunay outputs paths like "M438.39,285.86L292.27,297.97Z" —
 * this converts to "M 438.39 285.86 L 292.27 297.97 Z".
 */
function normalizeSvgPath(raw: string): string {
  return raw
    .replace(/,/g, ' ')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])(-)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

async function execCreateVector(args: Args, tempMap: TempNodeMap, tempId?: string, parentId?: string): Promise<SceneNode> {
  const node = figma.createVector();
  if (typeof args.data === 'string') {
    node.vectorPaths = [{
      windingRule: (typeof args.windingRule === 'string' ? args.windingRule : 'NONZERO') as VectorPaths[number]['windingRule'],
      data: normalizeSvgPath(args.data),
    }];
  }
  if (typeof args.x === 'number') node.x = args.x;
  if (typeof args.y === 'number') node.y = args.y;
  if (typeof args.name === 'string') node.name = args.name;
  const parent = await resolveParent(parentId, tempMap);
  parent.appendChild(node);
  if (tempId) tempMap.set(tempId, node);
  return node;
}

async function execApplyImageFill(args: Args, tempMap: TempNodeMap, tempId?: string, parentId?: string): Promise<SceneNode> {
  const bytes = args.imageBytes as number[];
  const uint8 = new Uint8Array(bytes);
  const image = figma.createImage(uint8);

  let node: SceneNode;
  const targetId = typeof args.targetNodeId === 'string' ? args.targetNodeId : undefined;
  if (targetId) {
    node = await resolveNode(targetId, tempMap);
  } else {
    const rect = figma.createRectangle();
    if (typeof args.x === 'number') rect.x = args.x;
    if (typeof args.y === 'number') rect.y = args.y;
    if (typeof args.width === 'number' && typeof args.height === 'number') {
      rect.resize(args.width as number, args.height as number);
    }
    if (typeof args.name === 'string') rect.name = args.name;
    const parent = await resolveParent(parentId, tempMap);
    parent.appendChild(rect);
    node = rect;
  }

  if ('fills' in node) {
    const scaleMode = (typeof args.scaleMode === 'string' ? args.scaleMode : 'FILL') as ImagePaint['scaleMode'];
    (node as GeometryMixin).fills = [{
      type: 'IMAGE',
      scaleMode,
      imageHash: image.hash,
    } as ImagePaint];
  }

  if (tempId) tempMap.set(tempId, node);
  return node;
}

async function execCreateText(args: Args, tempMap: TempNodeMap, tempId?: string, parentId?: string): Promise<SceneNode> {
  const node = figma.createText();
  await figma.loadFontAsync(node.fontName as FontName);
  if (typeof args.x === 'number') node.x = args.x;
  if (typeof args.y === 'number') node.y = args.y;
  if (typeof args.fontSize === 'number') node.fontSize = args.fontSize;
  if (typeof args.characters === 'string') node.characters = args.characters;
  const parent = await resolveParent(parentId, tempMap);
  parent.appendChild(node);
  if (tempId) tempMap.set(tempId, node);
  return node;
}

const TEXT_PROPS_REQUIRING_FONT = new Set([
  'fontSize', 'letterSpacing', 'lineHeight', 'fontName', 'textCase',
  'textDecoration', 'characters', 'paragraphSpacing', 'paragraphIndent',
  'textAlignHorizontal', 'textAlignVertical', 'textAutoResize',
]);

async function loadNodeFonts(node: SceneNode): Promise<void> {
  if (node.type !== 'TEXT') return;
  const textNode = node as TextNode;
  const fontName = textNode.fontName;
  if (fontName !== figma.mixed) {
    await figma.loadFontAsync(fontName);
  } else {
    const len = textNode.characters.length;
    const loaded = new Set<string>();
    for (let i = 0; i < len; i++) {
      const fn = textNode.getRangeFontName(i, i + 1) as FontName;
      const key = `${fn.family}::${fn.style}`;
      if (!loaded.has(key)) {
        loaded.add(key);
        await figma.loadFontAsync(fn);
      }
    }
  }
}

async function execSetProperty(node: SceneNode, args: Args): Promise<void> {
  const prop = String(args.property ?? '');
  if (!prop) throw new Error('setProperty requires a "property" arg.');

  const value = 'value' in args ? args.value : undefined;
  if (value === undefined) throw new Error(`setProperty: no "value" provided for property "${prop}".`);

  if (TEXT_PROPS_REQUIRING_FONT.has(prop) && node.type === 'TEXT') {
    await loadNodeFonts(node);
  }

  const coerced = coercePropertyValue(prop, value);
  (node as unknown as Record<string, unknown>)[prop] = coerced;
}

/** Figma expects certain text properties as {value, unit} objects, not bare numbers. */
function coercePropertyValue(prop: string, value: unknown): unknown {
  if (typeof value !== 'number') return value;

  switch (prop) {
    case 'letterSpacing':
      return { value, unit: 'PIXELS' };
    case 'lineHeight':
      return { value, unit: 'PIXELS' };
    case 'paragraphSpacing':
    case 'paragraphIndent':
      return value;
    default:
      return value;
  }
}

/** Deep-clone a Figma paint so all nested objects (color, gradientStops, etc.) are mutable. */
function clonePaint(paint: Paint): Paint {
  const clone = { ...paint } as Record<string, unknown>;
  if (clone.color && typeof clone.color === 'object') {
    clone.color = { ...(clone.color as object) };
  }
  if (Array.isArray(clone.gradientStops)) {
    clone.gradientStops = (clone.gradientStops as unknown[]).map(s => {
      const stop = { ...(s as Record<string, unknown>) };
      if (stop.color && typeof stop.color === 'object') stop.color = { ...(stop.color as object) };
      return stop;
    });
  }
  return clone as unknown as Paint;
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

  // Numeric value: treat as grayscale lightness (0–1) applied to the first fill.
  // Also handles property-specific patches like "color" or "opacity".
  if (typeof args.value === 'number') {
    const geoNode = node as GeometryMixin;
    const property = typeof args.property === 'string' ? args.property : null;

    if (property === 'opacity') {
      const fills = (geoNode.fills as readonly Paint[]).map(clonePaint);
      if (fills.length > 0) {
        (fills[0] as Record<string, unknown>).opacity = args.value;
        geoNode.fills = fills;
      }
      return;
    }

    // "color" property with a number, or bare numeric value → grayscale.
    const v = args.value as number;
    const clamped = Math.max(0, Math.min(1, v));
    const fills = (geoNode.fills as readonly Paint[]).map(clonePaint);
    if (fills.length > 0 && (fills[0] as SolidPaint).type === 'SOLID') {
      (fills[0] as SolidPaint).color = { r: clamped, g: clamped, b: clamped };
      geoNode.fills = fills;
    } else {
      geoNode.fills = [{ type: 'SOLID', color: { r: clamped, g: clamped, b: clamped }, opacity: 1 }];
    }
    return;
  }

  // Property-patch: modify a single property on the first fill without replacing the array.
  const property = typeof args.property === 'string' ? args.property : null;
  if (property !== null && 'value' in args) {
    const geoNode = node as GeometryMixin;
    const fills = (geoNode.fills as readonly Paint[]).map(clonePaint);
    if (fills.length > 0) {
      const fill = fills[0] as Record<string, unknown>;
      if (property === 'color' && typeof args.value === 'object' && args.value !== null) {
        fill.color = { ...(fill.color as object), ...(args.value as object) };
      } else {
        fill[property] = args.value;
      }
      geoNode.fills = fills;
    }
    return;
  }

  const rawFills = args.fills ?? (Array.isArray(args.value) ? args.value : undefined);
  (node as GeometryMixin).fills = toPaints(rawFills);
}

function execSetStroke(node: SceneNode, args: Args): void {
  if (!('strokes' in node)) throw new Error(`Node type ${node.type} does not support strokes.`);

  // Property-patch: modify a single property on the first stroke or the stroke itself.
  const property = typeof args.property === 'string' ? args.property : null;
  if (property !== null && 'value' in args) {
    const geoNode = node as GeometryMixin;
    // strokeWeight and strokeAlign live on the node, not inside the stroke paint.
    if (property === 'strokeWeight' || property === 'weight') {
      geoNode.strokeWeight = args.value as number;
      return;
    }
    if (property === 'strokeAlign' || property === 'align') {
      geoNode.strokeAlign = args.value as StrokeAlign;
      return;
    }
    // Patch the first stroke paint's property (e.g. opacity).
    const strokes = (geoNode.strokes as readonly Paint[]).map(clonePaint);
    if (strokes.length > 0) {
      (strokes[0] as Record<string, unknown>)[property] = args.value;
      geoNode.strokes = strokes;
    }
    return;
  }

  const rawStrokes = args.strokes ?? (Array.isArray(args.value) ? args.value : []);
  (node as GeometryMixin).strokes = toPaints(rawStrokes);
  if (typeof args.weight === 'number') {
    (node as GeometryMixin).strokeWeight = args.weight;
  }
  if (typeof args.align === 'string') {
    (node as GeometryMixin).strokeAlign = args.align as StrokeAlign;
  }
}

function makeDefaultEffect(type: string): Effect {
  if (type === 'DROP_SHADOW' || type === 'INNER_SHADOW') {
    const base = {
      type: type as 'DROP_SHADOW',
      color: { r: 0, g: 0, b: 0, a: 0.25 },
      offset: { x: 0, y: 4 },
      radius: 8,
      spread: 0,
      visible: true,
      blendMode: 'NORMAL' as const,
    };
    if (type === 'DROP_SHADOW') {
      return { ...base, showShadowBehindNode: false } as DropShadowEffect;
    }
    return base as InnerShadowEffect;
  }
  return {
    type: (type === 'BACKGROUND_BLUR' ? 'BACKGROUND_BLUR' : 'LAYER_BLUR') as 'LAYER_BLUR',
    radius: 8,
    visible: true,
  } as BlurEffect;
}

function execSetEffect(node: SceneNode, args: Args): void {
  if (!('effects' in node)) throw new Error(`Node type ${node.type} does not support effects.`);

  // Full replacement: args.effects is an array of effect objects.
  if (args.effects !== undefined) {
    (node as BlendMixin).effects = toEffects(args.effects);
    return;
  }

  // Array value — treat as full replacement.
  if (Array.isArray(args.value)) {
    (node as BlendMixin).effects = toEffects(args.value);
    return;
  }

  // Live control-change: patch a single property on an effect of the specified type.
  // Args: { property, effectType, effectIndex? }
  const property = typeof args.property === 'string' ? args.property : null;
  if (property !== null && 'value' in args) {
    const blendNode = node as BlendMixin;
    const effectType = typeof args.effectType === 'string' ? args.effectType : 'DROP_SHADOW';
    const effectIndex = typeof args.effectIndex === 'number' ? args.effectIndex : 0;

    // Deep-clone the effects array so Figma's frozen objects can be mutated.
    const effects: Effect[] = blendNode.effects.map(e => {
      const clone = { ...e } as Record<string, unknown>;
      // Deep-clone sub-objects that we may need to patch.
      if (clone.offset && typeof clone.offset === 'object') {
        clone.offset = { ...(clone.offset as object) };
      }
      if (clone.color && typeof clone.color === 'object') {
        clone.color = { ...(clone.color as object) };
      }
      return clone as unknown as Effect;
    });

    // Find target effect by type, falling back to effectIndex.
    let idx = effects.findIndex(e => e.type === effectType);
    if (idx < 0) idx = effectIndex;

    // If effect still not found, create a sensible default of the requested type.
    if (idx < 0 || idx >= effects.length) {
      const defaultEffect = makeDefaultEffect(effectType);
      effects.push(defaultEffect);
      idx = effects.length - 1;
    }

    // Patch the property.
    const target = effects[idx] as Record<string, unknown>;
    if (property === 'offsetX') {
      (target.offset as { x: number; y: number }).x = args.value as number;
    } else if (property === 'offsetY') {
      (target.offset as { x: number; y: number }).y = args.value as number;
    } else if (property === 'opacity') {
      // Figma effects don't have a top-level opacity; map to color.a.
      (target.color as { r: number; g: number; b: number; a: number }).a = args.value as number;
    } else {
      target[property] = args.value;
    }

    blendNode.effects = effects as readonly Effect[];
    return;
  }

  // Fallback: no-op (don't wipe existing effects).
  console.warn('[setEffect] could not determine update intent from args:', args);
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
  if (typeof args.layoutWrap === 'string') frame.layoutWrap = args.layoutWrap as 'NO_WRAP' | 'WRAP';
  if (typeof args.primaryAxisSizingMode === 'string') frame.primaryAxisSizingMode = args.primaryAxisSizingMode as 'FIXED' | 'AUTO';
  if (typeof args.counterAxisSizingMode === 'string') frame.counterAxisSizingMode = args.counterAxisSizingMode as 'FIXED' | 'AUTO';
  if (typeof args.itemSpacing === 'number') frame.itemSpacing = args.itemSpacing;
  if (typeof args.counterAxisSpacing === 'number') frame.counterAxisSpacing = args.counterAxisSpacing;
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

async function execAppendChild(action: ActionDescriptor, tempMap: TempNodeMap): Promise<void> {
  const child = await resolveNode(action.nodeId, tempMap);
  const parent = await resolveParent(action.parentId, tempMap);
  parent.appendChild(child);
}

function execDeleteNode(node: SceneNode): void {
  node.remove();
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

let lastCreatedNode: SceneNode | null = null;

async function dispatchAction(action: ActionDescriptor, tempMap: TempNodeMap): Promise<SceneNode | null> {
  const { method, args, tempId } = action;
  let { nodeId, parentId } = action;
  const a = (args ?? {}) as Args;

  // __prev refers to the most recently created node in this batch.
  if (nodeId === '__prev' && lastCreatedNode) nodeId = lastCreatedNode.id;
  if (parentId === '__prev' && lastCreatedNode) parentId = lastCreatedNode.id;

  switch (method) {
    case 'createRectangle': {
      const created = await execCreateRectangle(a, tempMap, tempId, parentId);
      lastCreatedNode = created;
      return created;
    }

    case 'createFrame': {
      const created = await execCreateFrame(a, tempMap, tempId, parentId);
      lastCreatedNode = created;
      return created;
    }

    case 'createEllipse': {
      const created = await execCreateEllipse(a, tempMap, tempId, parentId);
      lastCreatedNode = created;
      return created;
    }

    case 'createVector': {
      const created = await execCreateVector(a, tempMap, tempId, parentId);
      lastCreatedNode = created;
      return created;
    }

    case 'applyImageFill': {
      const created = await execApplyImageFill(a, tempMap, tempId, parentId);
      lastCreatedNode = created;
      return created;
    }

    case 'createText': {
      const created = await execCreateText(a, tempMap, tempId, parentId);
      lastCreatedNode = created;
      return created;
    }

    case 'setProperty': {
      const node = await resolveNode(nodeId, tempMap);
      await execSetProperty(node, a);
      return null;
    }

    case 'setFill': {
      const node = await resolveNode(nodeId, tempMap);
      execSetFill(node, a);
      return null;
    }

    case 'setStroke': {
      const node = await resolveNode(nodeId, tempMap);
      execSetStroke(node, a);
      return null;
    }

    case 'setEffect': {
      const node = await resolveNode(nodeId, tempMap);
      execSetEffect(node, a);
      return null;
    }

    case 'setCornerRadius': {
      const node = await resolveNode(nodeId, tempMap);
      execSetCornerRadius(node, a);
      return null;
    }

    case 'setLayoutProperties': {
      const node = await resolveNode(nodeId, tempMap);
      execSetLayoutProperties(node, a);
      return null;
    }

    case 'resize': {
      const node = await resolveNode(nodeId, tempMap);
      execResize(node, a);
      return null;
    }

    case 'appendChild':
      await execAppendChild(action, tempMap);
      return null;

    case 'deleteNode': {
      try {
        const node = await resolveNode(nodeId, tempMap);
        execDeleteNode(node);
      } catch {
        // Node already removed (e.g. parent was deleted first) — ignore.
      }
      return null;
    }

    case 'deleteChildren': {
      const node = await resolveNode(nodeId, tempMap);
      if ('children' in node) {
        const parent = node as FrameNode;
        for (let ci = parent.children.length - 1; ci >= 0; ci--) {
          parent.children[ci].remove();
        }
      }
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
 *
 * When pluginSpec is provided, it is persisted on the first top-level frame
 * created in the batch via setPluginData, enabling plugin memory.
 */
export async function executeActions(
  actions: ActionDescriptor[],
  pluginSpec?: string,
): Promise<ExecutionResult> {
  const errors: string[] = [];
  const createdNodeIds: string[] = [];
  let executedCount = 0;
  let rootFrameId: string | undefined;

  const tempMap: TempNodeMap = new Map();
  lastCreatedNode = null;

  figma.commitUndo();

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    try {
      const created = await dispatchAction(action, tempMap);
      executedCount++;
      if (created && !action.parentId) {
        createdNodeIds.push(created.id);
        if (!rootFrameId && created.type === 'FRAME') {
          rootFrameId = created.id;
        }
      }
      // Track the frame targeted by deleteChildren as root for reuse scenarios.
      if (action.method === 'deleteChildren' && action.nodeId && !rootFrameId) {
        rootFrameId = action.nodeId;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${i}] ${action.method}: ${msg}`);
      console.error(`[action-executor] action[${i}] ${action.method} failed:`, msg);
    }
  }

  // Resize the root frame to hug its contents after all children are placed.
  if (rootFrameId) {
    try {
      const rootNode = tempMap.get(rootFrameId)
        ?? await figma.getNodeByIdAsync(rootFrameId);
      if (rootNode && (rootNode.type === 'FRAME' || rootNode.type === 'COMPONENT')) {
        const frame = rootNode as FrameNode;
        if (frame.layoutMode !== 'NONE') {
          frame.primaryAxisSizingMode = 'AUTO';
          frame.counterAxisSizingMode = 'AUTO';
        } else if (frame.children.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const child of frame.children) {
            minX = Math.min(minX, child.x);
            minY = Math.min(minY, child.y);
            maxX = Math.max(maxX, child.x + child.width);
            maxY = Math.max(maxY, child.y + child.height);
          }
          frame.resize(maxX - minX, maxY - minY);
          if (minX !== 0 || minY !== 0) {
            for (const child of frame.children) {
              child.x -= minX;
              child.y -= minY;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[action-executor] failed to resize root frame:', err);
    }
  }

  // Persist plugin spec so it can be restored on re-selection.
  // Prefer the root frame; fall back to the first targeted node (live mode).
  const persistTargetId = rootFrameId ?? (actions.length > 0 ? actions[0].nodeId : undefined);
  if (pluginSpec && persistTargetId) {
    try {
      const targetNode = tempMap.get(persistTargetId)
        ?? await figma.getNodeByIdAsync(persistTargetId);
      if (targetNode && 'setPluginData' in targetNode) {
        (targetNode as SceneNode).setPluginData('pluginSpec', pluginSpec);
      }
    } catch (err) {
      console.warn('[action-executor] failed to persist pluginSpec:', err);
    }
  }

  figma.commitUndo();

  // Pan & zoom the viewport to show newly created content.
  const nodesToFocus: SceneNode[] = [];
  if (rootFrameId) {
    const root = tempMap.get(rootFrameId)
      ?? await figma.getNodeByIdAsync(rootFrameId);
    if (root) nodesToFocus.push(root as SceneNode);
  } else {
    for (const id of createdNodeIds) {
      const node = tempMap.get(id) ?? await figma.getNodeByIdAsync(id);
      if (node) nodesToFocus.push(node as SceneNode);
    }
  }
  if (nodesToFocus.length > 0) {
    figma.viewport.scrollAndZoomIntoView(nodesToFocus);
    figma.viewport.zoom = figma.viewport.zoom * 0.85;
  }

  // Build a tempId → real node ID map so the iframe can rewrite control actions.
  const tempIdMap: Record<string, string> = {};
  for (const [tempId, node] of tempMap.entries()) {
    tempIdMap[tempId] = node.id;
  }

  return {
    success: errors.length === 0,
    executedCount,
    errorCount: errors.length,
    errors,
    createdNodeIds,
    tempIdMap,
    rootFrameId,
  };
}

/**
 * Applies a single live control-change action without undo grouping.
 * Supports args.scale and args.offset for linear value transforms:
 *   actual = value * scale + offset
 *
 * Safety: if a setEffect action accidentally carries a full "effects" array
 * (which would wipe all existing effects), we strip it and force the patch
 * path by keeping only the patch-form args. This prevents LLM mistakes from
 * creating duplicate shadows.
 */
export async function applyControlChange(action: ActionDescriptor, value: unknown): Promise<void> {
  const tempMap: TempNodeMap = new Map();

  // Apply linear transform if scale/offset are specified.
  let effectiveValue = value;
  if (typeof value === 'number') {
    const scale = typeof action.args.scale === 'number' ? action.args.scale : 1;
    const offset = typeof action.args.offset === 'number' ? action.args.offset : 0;
    effectiveValue = value * scale + offset;
  }

  let mergedArgs = { ...action.args, value: effectiveValue };

  // Guard: setEffect control actions must use the property-patch form.
  // If the LLM mistakenly included an "effects" array, remove it so we fall
  // into the patch path (which reads and mutates the existing effects array).
  if (action.method === 'setEffect' && Array.isArray(mergedArgs.effects)) {
    console.warn('[applyControlChange] stripping "effects" array from control setEffect — use property patch form instead.');
    const { effects: _removed, ...patchArgs } = mergedArgs as typeof mergedArgs & { effects: unknown };
    mergedArgs = patchArgs as typeof mergedArgs;
  }

  const merged: ActionDescriptor = {
    ...action,
    args: mergedArgs,
  };
  await dispatchAction(merged, tempMap);
}
