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

function applyInlineFillsAndStrokes(node: SceneNode, args: Args): void {
  if (Array.isArray(args.fills) && 'fills' in node) {
    (node as GeometryMixin).fills = toPaints(args.fills);
  }
  if (Array.isArray(args.strokes) && 'strokes' in node) {
    (node as GeometryMixin).strokes = toPaints(args.strokes);
    if (typeof args.strokeWeight === 'number') {
      (node as GeometryMixin).strokeWeight = args.strokeWeight;
    }
  }
}

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
  applyInlineFillsAndStrokes(node, args);
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
  applyInlineFillsAndStrokes(node, args);
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
  applyInlineFillsAndStrokes(node, args);
  const parent = await resolveParent(parentId, tempMap);
  parent.appendChild(node);
  if (tempId) tempMap.set(tempId, node);
  return node;
}

// ─── SVG arc → cubic bezier conversion ────────────────────────────────────────
// Figma's vectorPaths only supports M, L, C, Q, Z — no arc (A) commands.
// This converts SVG arcs to cubic bezier curves using the SVG spec's
// endpoint-to-center parameterization.

function arcToCubicBeziers(
  x1: number, y1: number,
  rx: number, ry: number,
  xAxisRotation: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number, y2: number,
): number[][] {
  if (rx === 0 || ry === 0) return [[x2, y2]];

  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  rx = Math.abs(rx);
  ry = Math.abs(ry);

  // Ensure radii are large enough (SVG spec F.6.6)
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
  }

  // Center parameterization (SVG spec F.6.5)
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;

  let sq = (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2);
  if (sq < 0) sq = 0;
  let root = Math.sqrt(sq);
  if (largeArcFlag === sweepFlag) root = -root;

  const cxp = (root * rx * y1p) / ry;
  const cyp = -(root * ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let cos = dot / len;
    if (cos < -1) cos = -1;
    if (cos > 1) cos = 1;
    return sign * Math.acos(cos);
  }

  let theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = vectorAngle(
    (x1p - cxp) / rx, (y1p - cyp) / ry,
    (-x1p - cxp) / rx, (-y1p - cyp) / ry,
  );

  if (sweepFlag === 0 && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweepFlag === 1 && dTheta < 0) dTheta += 2 * Math.PI;

  // Split into segments of at most PI/2
  const segments = Math.ceil(Math.abs(dTheta) / (Math.PI / 2));
  const segAngle = dTheta / segments;
  const result: number[][] = [];

  for (let i = 0; i < segments; i++) {
    const t1 = theta1 + i * segAngle;
    const t2 = theta1 + (i + 1) * segAngle;
    const alpha = (4 / 3) * Math.tan(segAngle / 4);

    const cos1 = Math.cos(t1);
    const sin1 = Math.sin(t1);
    const cos2 = Math.cos(t2);
    const sin2 = Math.sin(t2);

    const ep1x = rx * cos1;
    const ep1y = ry * sin1;
    const ep2x = rx * cos2;
    const ep2y = ry * sin2;

    const cp1x = ep1x - alpha * rx * sin1;
    const cp1y = ep1y + alpha * ry * cos1;
    const cp2x = ep2x + alpha * rx * sin2;
    const cp2y = ep2y - alpha * ry * cos2;

    result.push([
      cosPhi * cp1x - sinPhi * cp1y + cx,
      sinPhi * cp1x + cosPhi * cp1y + cy,
      cosPhi * cp2x - sinPhi * cp2y + cx,
      sinPhi * cp2x + cosPhi * cp2y + cy,
      cosPhi * ep2x - sinPhi * ep2y + cx,
      sinPhi * ep2x + cosPhi * ep2y + cy,
    ]);
  }

  return result;
}

// Parse SVG path number sequences (handles negative signs as delimiters)
function parsePathNumbers(str: string): number[] {
  const nums: number[] = [];
  const re = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    nums.push(parseFloat(m[0]));
  }
  return nums;
}

/**
 * Convert all SVG path commands to the subset Figma supports: M, L, C, Q, Z.
 * Converts: A/a → C, S/s → C, T/t → Q, H/h → L, V/v → L, and makes all
 * relative commands absolute.
 */
function convertToFigmaPath(path: string): string {
  // Pre-normalize: add spaces between letters and numbers, replace commas
  const spaced = path
    .replace(/,/g, ' ')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/([A-Za-z])([-.])/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');

  const tokens = spaced.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g);
  if (!tokens) return path;

  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  // Last control point for S/s and T/t reflection
  let lastCp2X = 0;
  let lastCp2Y = 0;
  let lastCmd = '';
  let result = '';

  const fmt = (n: number) => {
    const s = n.toFixed(4);
    return s.replace(/\.?0+$/, '') || '0';
  };

  for (const token of tokens) {
    const cmd = token[0];
    const nums = parsePathNumbers(token.slice(1));

    switch (cmd) {
      case 'M': {
        for (let i = 0; i + 1 < nums.length; i += 2) {
          curX = nums[i]; curY = nums[i + 1];
          if (i === 0) {
            startX = curX; startY = curY;
            result += `M ${fmt(curX)} ${fmt(curY)} `;
          } else {
            result += `L ${fmt(curX)} ${fmt(curY)} `;
          }
        }
        lastCp2X = curX; lastCp2Y = curY;
        break;
      }
      case 'm': {
        for (let i = 0; i + 1 < nums.length; i += 2) {
          curX += nums[i]; curY += nums[i + 1];
          if (i === 0) {
            startX = curX; startY = curY;
            result += `M ${fmt(curX)} ${fmt(curY)} `;
          } else {
            result += `L ${fmt(curX)} ${fmt(curY)} `;
          }
        }
        lastCp2X = curX; lastCp2Y = curY;
        break;
      }

      case 'L': {
        for (let i = 0; i + 1 < nums.length; i += 2) {
          curX = nums[i]; curY = nums[i + 1];
          result += `L ${fmt(curX)} ${fmt(curY)} `;
        }
        lastCp2X = curX; lastCp2Y = curY;
        break;
      }
      case 'l': {
        for (let i = 0; i + 1 < nums.length; i += 2) {
          curX += nums[i]; curY += nums[i + 1];
          result += `L ${fmt(curX)} ${fmt(curY)} `;
        }
        lastCp2X = curX; lastCp2Y = curY;
        break;
      }

      case 'H': {
        for (const n of nums) { curX = n; result += `L ${fmt(curX)} ${fmt(curY)} `; }
        lastCp2X = curX; lastCp2Y = curY;
        break;
      }
      case 'h': {
        for (const n of nums) { curX += n; result += `L ${fmt(curX)} ${fmt(curY)} `; }
        lastCp2X = curX; lastCp2Y = curY;
        break;
      }
      case 'V': {
        for (const n of nums) { curY = n; result += `L ${fmt(curX)} ${fmt(curY)} `; }
        lastCp2X = curX; lastCp2Y = curY;
        break;
      }
      case 'v': {
        for (const n of nums) { curY += n; result += `L ${fmt(curX)} ${fmt(curY)} `; }
        lastCp2X = curX; lastCp2Y = curY;
        break;
      }

      case 'C': {
        for (let i = 0; i + 5 < nums.length; i += 6) {
          lastCp2X = nums[i + 2]; lastCp2Y = nums[i + 3];
          curX = nums[i + 4]; curY = nums[i + 5];
          result += `C ${fmt(nums[i])} ${fmt(nums[i + 1])} ${fmt(lastCp2X)} ${fmt(lastCp2Y)} ${fmt(curX)} ${fmt(curY)} `;
        }
        break;
      }
      case 'c': {
        for (let i = 0; i + 5 < nums.length; i += 6) {
          const cp1x = curX + nums[i], cp1y = curY + nums[i + 1];
          const cp2x = curX + nums[i + 2], cp2y = curY + nums[i + 3];
          const ex = curX + nums[i + 4], ey = curY + nums[i + 5];
          lastCp2X = cp2x; lastCp2Y = cp2y;
          curX = ex; curY = ey;
          result += `C ${fmt(cp1x)} ${fmt(cp1y)} ${fmt(cp2x)} ${fmt(cp2y)} ${fmt(curX)} ${fmt(curY)} `;
        }
        break;
      }

      case 'S': {
        for (let i = 0; i + 3 < nums.length; i += 4) {
          // Reflect previous cp2 around current point
          const cp1x = (lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's')
            ? 2 * curX - lastCp2X : curX;
          const cp1y = (lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's')
            ? 2 * curY - lastCp2Y : curY;
          lastCp2X = nums[i]; lastCp2Y = nums[i + 1];
          curX = nums[i + 2]; curY = nums[i + 3];
          result += `C ${fmt(cp1x)} ${fmt(cp1y)} ${fmt(lastCp2X)} ${fmt(lastCp2Y)} ${fmt(curX)} ${fmt(curY)} `;
          lastCmd = 'S';
        }
        break;
      }
      case 's': {
        for (let i = 0; i + 3 < nums.length; i += 4) {
          const cp1x = (lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's')
            ? 2 * curX - lastCp2X : curX;
          const cp1y = (lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's')
            ? 2 * curY - lastCp2Y : curY;
          lastCp2X = curX + nums[i]; lastCp2Y = curY + nums[i + 1];
          curX += nums[i + 2]; curY += nums[i + 3];
          result += `C ${fmt(cp1x)} ${fmt(cp1y)} ${fmt(lastCp2X)} ${fmt(lastCp2Y)} ${fmt(curX)} ${fmt(curY)} `;
          lastCmd = 's';
        }
        break;
      }

      case 'Q': {
        for (let i = 0; i + 3 < nums.length; i += 4) {
          lastCp2X = nums[i]; lastCp2Y = nums[i + 1];
          curX = nums[i + 2]; curY = nums[i + 3];
          result += `Q ${fmt(lastCp2X)} ${fmt(lastCp2Y)} ${fmt(curX)} ${fmt(curY)} `;
        }
        break;
      }
      case 'q': {
        for (let i = 0; i + 3 < nums.length; i += 4) {
          lastCp2X = curX + nums[i]; lastCp2Y = curY + nums[i + 1];
          curX += nums[i + 2]; curY += nums[i + 3];
          result += `Q ${fmt(lastCp2X)} ${fmt(lastCp2Y)} ${fmt(curX)} ${fmt(curY)} `;
        }
        break;
      }

      case 'T': {
        for (let i = 0; i + 1 < nums.length; i += 2) {
          lastCp2X = (lastCmd === 'Q' || lastCmd === 'q' || lastCmd === 'T' || lastCmd === 't')
            ? 2 * curX - lastCp2X : curX;
          lastCp2Y = (lastCmd === 'Q' || lastCmd === 'q' || lastCmd === 'T' || lastCmd === 't')
            ? 2 * curY - lastCp2Y : curY;
          curX = nums[i]; curY = nums[i + 1];
          result += `Q ${fmt(lastCp2X)} ${fmt(lastCp2Y)} ${fmt(curX)} ${fmt(curY)} `;
          lastCmd = 'T';
        }
        break;
      }
      case 't': {
        for (let i = 0; i + 1 < nums.length; i += 2) {
          lastCp2X = (lastCmd === 'Q' || lastCmd === 'q' || lastCmd === 'T' || lastCmd === 't')
            ? 2 * curX - lastCp2X : curX;
          lastCp2Y = (lastCmd === 'Q' || lastCmd === 'q' || lastCmd === 'T' || lastCmd === 't')
            ? 2 * curY - lastCp2Y : curY;
          curX += nums[i]; curY += nums[i + 1];
          result += `Q ${fmt(lastCp2X)} ${fmt(lastCp2Y)} ${fmt(curX)} ${fmt(curY)} `;
          lastCmd = 't';
        }
        break;
      }

      case 'A':
      case 'a': {
        for (let j = 0; j + 6 < nums.length; j += 7) {
          const rx = nums[j], ry = nums[j + 1], xRot = nums[j + 2];
          const largeArc = nums[j + 3], sweep = nums[j + 4];
          let endX = nums[j + 5], endY = nums[j + 6];
          if (cmd === 'a') { endX += curX; endY += curY; }
          const curves = arcToCubicBeziers(curX, curY, rx, ry, xRot, largeArc, sweep, endX, endY);
          for (const c of curves) {
            if (c.length === 2) {
              result += `L ${fmt(c[0])} ${fmt(c[1])} `;
            } else {
              result += `C ${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])} ${fmt(c[3])} ${fmt(c[4])} ${fmt(c[5])} `;
            }
          }
          curX = endX; curY = endY;
        }
        lastCp2X = curX; lastCp2Y = curY;
        break;
      }

      case 'Z':
      case 'z': {
        result += 'Z ';
        curX = startX; curY = startY;
        lastCp2X = curX; lastCp2Y = curY;
        break;
      }

      default:
        result += token + ' ';
        break;
    }

    lastCmd = cmd;
  }

  return result.trim();
}

/**
 * Normalize an SVG path string for Figma's vectorPaths parser.
 * Converts all commands to the supported subset (M, L, C, Q, Z) with
 * absolute coordinates and proper spacing.
 */
function normalizeSvgPath(raw: string): string {
  return convertToFigmaPath(raw);
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
  applyInlineFillsAndStrokes(node, args);
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

async function execApplyPatternFill(args: Args, tempMap: TempNodeMap, tempId?: string, parentId?: string): Promise<SceneNode> {
  const sourceId = typeof args.sourceNodeId === 'string' ? args.sourceNodeId : undefined;
  if (!sourceId) throw new Error('applyPatternFill requires sourceNodeId');
  const sourceNode = await resolveNode(sourceId, tempMap);

  let node: SceneNode;
  const targetId = typeof args.targetNodeId === 'string' ? args.targetNodeId : undefined;
  if (targetId) {
    node = await resolveNode(targetId, tempMap);
  } else {
    const rect = figma.createRectangle();
    if (typeof args.x === 'number') rect.x = args.x;
    if (typeof args.y === 'number') rect.y = args.y;
    if (typeof args.width === 'number' && typeof args.height === 'number')
      rect.resize(args.width as number, args.height as number);
    if (typeof args.name === 'string') rect.name = args.name;
    const parent = await resolveParent(parentId, tempMap);
    parent.appendChild(rect);
    node = rect;
  }

  const validTileTypes: PatternPaint['tileType'][] = ['RECTANGULAR', 'HORIZONTAL_HEXAGONAL', 'VERTICAL_HEXAGONAL'];
  const tileType: PatternPaint['tileType'] =
    typeof args.tileType === 'string' && validTileTypes.includes(args.tileType as PatternPaint['tileType'])
      ? (args.tileType as PatternPaint['tileType'])
      : 'RECTANGULAR';

  const patternPaint: PatternPaint = {
    type: 'PATTERN',
    sourceNodeId: sourceNode.id,
    tileType,
    scalingFactor: typeof args.scalingFactor === 'number' ? args.scalingFactor : 1,
    spacing: {
      x: typeof args.spacingX === 'number' ? args.spacingX : 0,
      y: typeof args.spacingY === 'number' ? args.spacingY : 0,
    },
  };

  if ('setFillsAsync' in node) {
    await (node as GeometryMixin & { setFillsAsync: (fills: ReadonlyArray<Paint>) => Promise<void> }).setFillsAsync([patternPaint]);
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

  // Hex color string → solid fill.
  if (typeof args.value === 'string' && args.value.startsWith('#')) {
    const hex = args.value.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    (node as GeometryMixin).fills = [{ type: 'SOLID', color: { r, g, b }, opacity: 1 }];
    return;
  }

  // Gradient-bar stop array → GRADIENT_LINEAR fill.
  if (Array.isArray(args.value)) {
    const stops = args.value as { id?: string; position?: number; color?: string }[];
    const validStops = stops.filter(s => typeof s.color === 'string' && s.color.startsWith('#'));
    if (validStops.length >= 2) {
      const geoNode = node as GeometryMixin;
      const gradientStops: ColorStop[] = validStops.map(s => {
        const h = (s.color as string).replace('#', '');
        return {
          position: typeof s.position === 'number' ? s.position : 0,
          color: {
            r: parseInt(h.slice(0, 2), 16) / 255,
            g: parseInt(h.slice(2, 4), 16) / 255,
            b: parseInt(h.slice(4, 6), 16) / 255,
            a: 1,
          },
        };
      });
      const fills = (geoNode.fills as readonly Paint[]).map(clonePaint);
      const firstFill = fills[0] as Record<string, unknown> | undefined;
      const existingTransform = firstFill && typeof firstFill.type === 'string' && firstFill.type.startsWith('GRADIENT_')
        ? firstFill.gradientTransform as Transform
        : [[1, 0, 0], [0, 1, 0]] as unknown as Transform;
      geoNode.fills = [{
        type: 'GRADIENT_LINEAR',
        gradientTransform: existingTransform,
        gradientStops,
        opacity: 1,
      } as GradientPaint];
      return;
    }
  }

  // Multi-stop color map (from gradient color control) → update gradient stops.
  if (typeof args.value === 'object' && args.value !== null && !Array.isArray(args.value)) {
    const colorMap = args.value as Record<string, unknown>;
    const hexValues = Object.values(colorMap).filter(
      (v): v is string => typeof v === 'string' && v.startsWith('#'),
    );
    if (hexValues.length > 0) {
      const geoNode = node as GeometryMixin;
      const fills = (geoNode.fills as readonly Paint[]).map(clonePaint);
      const firstFill = fills[0] as Record<string, unknown> | undefined;

      if (firstFill && typeof firstFill.type === 'string' && firstFill.type.startsWith('GRADIENT_')) {
        const stops = firstFill.gradientStops as { position: number; color: RGBA }[] | undefined;
        if (stops) {
          for (let i = 0; i < Math.min(hexValues.length, stops.length); i++) {
            const hex = hexValues[i].replace('#', '');
            stops[i].color = {
              r: parseInt(hex.slice(0, 2), 16) / 255,
              g: parseInt(hex.slice(2, 4), 16) / 255,
              b: parseInt(hex.slice(4, 6), 16) / 255,
              a: stops[i].color.a,
            };
          }
          geoNode.fills = fills;
          return;
        }
      }

      // Fallback: no existing gradient, create one from the color stops.
      const gradientStops: ColorStop[] = hexValues.map((hex, i) => {
        const h = hex.replace('#', '');
        return {
          position: hexValues.length > 1 ? i / (hexValues.length - 1) : 0,
          color: {
            r: parseInt(h.slice(0, 2), 16) / 255,
            g: parseInt(h.slice(2, 4), 16) / 255,
            b: parseInt(h.slice(4, 6), 16) / 255,
            a: 1,
          },
        };
      });
      geoNode.fills = [{
        type: 'GRADIENT_LINEAR',
        gradientTransform: [[1, 0, 0], [0, 1, 0]],
        gradientStops,
        opacity: 1,
      } as GradientPaint];
      return;
    }
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

  // Hex color string → replace stroke color, preserving weight and align.
  if (typeof args.value === 'string' && args.value.startsWith('#')) {
    const hex = args.value.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    (node as GeometryMixin).strokes = [{ type: 'SOLID', color: { r, g, b }, opacity: 1 }];
    return;
  }

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

    // Find the Nth effect of the given type (effectIndex selects which one).
    // e.g. effectIndex=2 targets the 3rd DROP_SHADOW in the array.
    let idx = -1;
    let seen = 0;
    for (let i = 0; i < effects.length; i++) {
      if (effects[i].type === effectType) {
        if (seen === effectIndex) { idx = i; break; }
        seen++;
      }
    }

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
  const layout = node as LayoutMixin;
  const property = typeof args.property === 'string' ? args.property : null;

  if (typeof args.value === 'number' && property === 'width') {
    layout.resize(args.value, layout.height);
    return;
  }
  if (typeof args.value === 'number' && property === 'height') {
    layout.resize(layout.width, args.value);
    return;
  }
  // Uniform size: value drives both dimensions.
  if (typeof args.value === 'number') {
    layout.resize(args.value, args.value);
    return;
  }

  const w = typeof args.width === 'number' ? args.width : layout.width;
  const h = typeof args.height === 'number' ? args.height : layout.height;
  layout.resize(w, h);
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

    case 'applyPatternFill': {
      const created = await execApplyPatternFill(a, tempMap, tempId, parentId);
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
  persistNodeId?: string,
  selectNodeId?: string,
  skipCenter?: boolean,
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

  const isReapply = actions.length > 0 && actions.some(
    (a, i) => a.method === 'deleteChildren' && i < 3,
  );

  // A generator re-apply that includes an explicit resize means the generator
  // already computed the frame dimensions — skip child scaling post-processing.
  const generatorHandledSize = isReapply && actions.some(
    (a, i) => a.method === 'resize' && i < 3,
  );

  // Post-process the root frame after all children are placed.
  if (rootFrameId) {
    try {
      const rootNode = tempMap.get(rootFrameId)
        ?? await figma.getNodeByIdAsync(rootFrameId);
      if (rootNode && (rootNode.type === 'FRAME' || rootNode.type === 'COMPONENT')) {
        const frame = rootNode as FrameNode;
        if (frame.layoutMode !== 'NONE') {
          if (!isReapply) {
            frame.primaryAxisSizingMode = 'AUTO';
            frame.counterAxisSizingMode = 'AUTO';
          }
        } else if (frame.children.length > 0 && !generatorHandledSize) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const child of frame.children) {
            minX = Math.min(minX, child.x);
            minY = Math.min(minY, child.y);
            maxX = Math.max(maxX, child.x + child.width);
            maxY = Math.max(maxY, child.y + child.height);
          }
          if (!isReapply) {
            frame.resize(maxX - minX, maxY - minY);
            if (minX !== 0 || minY !== 0) {
              for (const child of frame.children) {
                child.x -= minX;
                child.y -= minY;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[action-executor] failed to post-process root frame:', err);
    }
  }

  // Persist plugin spec so it can be restored on re-selection.
  // Explicit persistNodeId takes priority, then root frame, first created node, first targeted node.
  const persistTargetId = persistNodeId
    ?? rootFrameId
    ?? (createdNodeIds.length > 0 ? createdNodeIds[0] : undefined)
    ?? (actions.length > 0 ? actions[0].nodeId : undefined);
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

  // Only reposition and scroll on first creation, not on re-apply or wrapping.
  const centerNodeId = rootFrameId ?? (createdNodeIds.length > 0 ? createdNodeIds[0] : undefined);

  if (!isReapply && !skipCenter && centerNodeId) {
    try {
      const centerNode = tempMap.get(centerNodeId)
        ?? await figma.getNodeByIdAsync(centerNodeId);
      if (centerNode && ('x' in centerNode)) {
        const vp = figma.viewport.center;
        const node = centerNode as SceneNode;
        node.x = vp.x - node.width / 2;
        node.y = vp.y - node.height / 2;
      }
    } catch (err) {
      console.warn('[action-executor] failed to center created node:', err);
    }

    const savedZoom = figma.viewport.zoom;
    const nodesToFocus: SceneNode[] = [];
    const focusNode = tempMap.get(centerNodeId)
      ?? await figma.getNodeByIdAsync(centerNodeId);
    if (focusNode) nodesToFocus.push(focusNode as SceneNode);
    if (nodesToFocus.length > 0) {
      figma.viewport.scrollAndZoomIntoView(nodesToFocus);
      figma.viewport.zoom = savedZoom;
    }
  }

  // Build a tempId → real node ID map so the iframe can rewrite control actions.
  const tempIdMap: Record<string, string> = {};
  for (const [tempId, node] of tempMap.entries()) {
    tempIdMap[tempId] = node.id;
  }

  // Programmatically select a node after execution (e.g. a wrapper frame).
  if (selectNodeId) {
    try {
      const selectNode = tempMap.get(selectNodeId)
        ?? await figma.getNodeByIdAsync(selectNodeId);
      if (selectNode) {
        figma.currentPage.selection = [selectNode as SceneNode];
      }
    } catch (err) {
      console.warn('[action-executor] failed to select node:', err);
    }
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
