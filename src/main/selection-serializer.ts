/// <reference types="@figma/plugin-typings" />

import type {
  SelectionContext,
  NodeDescriptor,
  FillDescriptor,
  StrokeDescriptor,
  EffectDescriptor,
  ChildSummary,
  ReactionDescriptor,
  SolidFill,
  GradientFill,
  ImageFill,
  ShadowEffect,
  BlurEffect,
} from '../shared/message-types';

// Approximate character budget before we start truncating children arrays.
// ~3000 tokens × ~4 chars/token = 12000 chars. Raised from 8000 to support
// richer multi-node context for auto-generate control inference.
const CHAR_BUDGET = 12000;

// ─── Fill extraction ──────────────────────────────────────────────────────────

function serializeFills(node: SceneNode): FillDescriptor[] {
  if (!('fills' in node) || node.fills === figma.mixed) return [];
  const fills = node.fills as readonly Paint[];

  return fills.map((paint): FillDescriptor => {
    if (paint.type === 'SOLID') {
      const p = paint as SolidPaint;
      const result: SolidFill = {
        type: 'SOLID',
        color: { r: p.color.r, g: p.color.g, b: p.color.b },
        opacity: p.opacity ?? 1,
      };
      return result;
    }

    if (
      paint.type === 'GRADIENT_LINEAR' ||
      paint.type === 'GRADIENT_RADIAL' ||
      paint.type === 'GRADIENT_ANGULAR' ||
      paint.type === 'GRADIENT_DIAMOND'
    ) {
      const p = paint as GradientPaint;
      const result: GradientFill = {
        type: p.type,
        gradientStops: p.gradientStops.map(s => ({
          position: s.position,
          color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
        })),
        opacity: p.opacity ?? 1,
      };
      return result;
    }

    // IMAGE and VIDEO
    const p = paint as ImagePaint;
    const result: ImageFill = {
      type: 'IMAGE',
      imageHash: p.imageHash ?? null,
      opacity: p.opacity ?? 1,
    };
    return result;
  });
}

// ─── Stroke extraction ────────────────────────────────────────────────────────

function serializeStrokes(node: SceneNode): StrokeDescriptor[] {
  if (!('strokes' in node)) return [];
  const strokes = node.strokes as readonly Paint[];
  const weight = 'strokeWeight' in node && node.strokeWeight !== figma.mixed
    ? (node.strokeWeight as number)
    : 1;
  const alignment = 'strokeAlign' in node
    ? (node.strokeAlign as StrokeDescriptor['alignment'])
    : 'CENTER';

  return strokes
    .filter((p): p is SolidPaint => p.type === 'SOLID')
    .map(p => ({
      color: { r: p.color.r, g: p.color.g, b: p.color.b },
      opacity: p.opacity ?? 1,
      weight,
      alignment,
    }));
}

// ─── Effect extraction ────────────────────────────────────────────────────────

function serializeEffects(node: SceneNode): EffectDescriptor[] {
  if (!('effects' in node)) return [];
  const effects = node.effects as readonly Effect[];

  return effects.map((e): EffectDescriptor => {
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      const shadow = e as DropShadowEffect | InnerShadowEffect;
      const result: ShadowEffect = {
        type: e.type,
        color: {
          r: shadow.color.r,
          g: shadow.color.g,
          b: shadow.color.b,
          a: shadow.color.a,
        },
        offset: { x: shadow.offset.x, y: shadow.offset.y },
        radius: shadow.radius,
        spread: 'spread' in shadow ? shadow.spread : undefined,
        visible: shadow.visible,
      };
      return result;
    }

    // LAYER_BLUR or BACKGROUND_BLUR
    const blur = e as BlurEffect;
    const result: BlurEffect = {
      type: blur.type,
      radius: blur.radius,
      visible: blur.visible,
    };
    return result;
  });
}

// ─── Reaction extraction ──────────────────────────────────────────────────────

function serializeReactions(node: SceneNode): ReactionDescriptor[] | undefined {
  if (!('reactions' in node)) return undefined;
  const reactions = (node as ComponentNode | FrameNode | InstanceNode).reactions;
  if (!reactions || reactions.length === 0) return undefined;

  return reactions.map(r => {
    const trigger = r.trigger ? r.trigger.type : 'NONE';
    let actionType = 'NONE';
    let destinationId: string | null = null;

    if (r.action) {
      actionType = r.action.type;
      if (r.action.type === 'NODE' && 'destinationId' in r.action) {
        destinationId = (r.action as { destinationId: string | null }).destinationId;
      }
    }

    return { trigger, actionType, destinationId };
  });
}

// ─── Text node extraction ─────────────────────────────────────────────────────

function serializeTextProps(node: TextNode): Partial<NodeDescriptor> {
  const fontSize = node.fontSize !== figma.mixed ? node.fontSize : undefined;
  const fontName = node.fontName !== figma.mixed
    ? { family: node.fontName.family, style: node.fontName.style }
    : undefined;
  const lineHeight = node.lineHeight !== figma.mixed
    ? node.lineHeight
    : undefined;
  const letterSpacing = node.letterSpacing !== figma.mixed
    ? node.letterSpacing
    : undefined;

  return {
    fontSize,
    fontName,
    textAlignHorizontal: node.textAlignHorizontal,
    textAlignVertical: node.textAlignVertical,
    characters: node.characters.slice(0, 100),
    lineHeight: lineHeight
      ? { unit: lineHeight.unit, value: 'value' in lineHeight ? lineHeight.value : undefined }
      : undefined,
    letterSpacing: letterSpacing
      ? { unit: letterSpacing.unit, value: letterSpacing.value }
      : undefined,
  };
}

// ─── Children extraction (one level deep) ────────────────────────────────────

function serializeChildren(node: SceneNode): { childCount: number; children?: ChildSummary[] } {
  if (!('children' in node)) return { childCount: 0 };
  const children = (node as ChildrenMixin).children;
  return {
    childCount: children.length,
    children: children.map(c => ({ id: c.id, type: c.type, name: c.name })),
  };
}

// ─── Single node serialization ────────────────────────────────────────────────

function serializeNode(node: SceneNode): NodeDescriptor {
  const { childCount, children } = serializeChildren(node);

  const base: NodeDescriptor = {
    id: node.id,
    type: node.type,
    name: node.name,
    x: 'x' in node ? node.x : 0,
    y: 'y' in node ? node.y : 0,
    width: 'width' in node ? node.width : 0,
    height: 'height' in node ? node.height : 0,
    rotation: 'rotation' in node ? node.rotation : 0,
    opacity: 'opacity' in node ? node.opacity : 1,
    visible: 'visible' in node ? node.visible : true,
    fills: serializeFills(node),
    strokes: serializeStrokes(node),
    effects: serializeEffects(node),
    parentId: node.parent ? node.parent.id : null,
    parentName: node.parent ? node.parent.name : null,
    childCount,
    children,
  };

  if (node.type === 'TEXT') {
    Object.assign(base, serializeTextProps(node as TextNode));
  }

  const reactions = serializeReactions(node);
  if (reactions && reactions.length > 0) {
    base.reactions = reactions;
  }

  return base;
}

// ─── Truncation ───────────────────────────────────────────────────────────────

/**
 * If the serialized JSON would exceed CHAR_BUDGET, progressively truncate
 * children arrays across all nodes until it fits, adding a summary suffix
 * like "…and 12 more children".
 */
function applyTruncation(nodes: NodeDescriptor[]): { nodes: NodeDescriptor[]; truncated: boolean } {
  const roughSize = JSON.stringify(nodes).length;
  if (roughSize <= CHAR_BUDGET) return { nodes, truncated: false };

  // First pass: truncate each node's children to a smaller set with a summary.
  const truncated = nodes.map(node => {
    if (!node.children || node.children.length === 0) return node;

    // Keep first 5 children, summarise the rest.
    const MAX_CHILDREN = 5;
    if (node.children.length <= MAX_CHILDREN) return node;

    const kept = node.children.slice(0, MAX_CHILDREN);
    const omitted = node.children.length - MAX_CHILDREN;
    const summary: ChildSummary = {
      id: '__truncated__',
      type: 'SUMMARY',
      name: `…and ${omitted} more children`,
    };

    return { ...node, children: [...kept, summary] };
  });

  // Second pass: if still over budget, drop children entirely.
  if (JSON.stringify(truncated).length > CHAR_BUDGET) {
    return {
      nodes: truncated.map(n => ({ ...n, children: undefined })),
      truncated: true,
    };
  }

  return { nodes: truncated, truncated: true };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Serializes the given SceneNodes into a SelectionContext suitable for
 * inclusion in an LLM prompt.
 */
export function serializeSelection(nodes: readonly SceneNode[]): SelectionContext {
  if (nodes.length === 0) {
    return { nodes: [], truncated: false };
  }

  const serialized = nodes.map(serializeNode);
  const { nodes: final, truncated } = applyTruncation(serialized);

  return { nodes: final, truncated };
}
