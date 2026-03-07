import type { ActionDescriptor } from '../shared/message-types';
import chroma from 'chroma-js';
import { createNoise2D, createNoise3D, createNoise4D } from 'simplex-noise';
import BezierEasing from 'bezier-easing';
import { Delaunay } from 'd3-delaunay';

// @ts-ignore — paths-js uses CJS, no types
import PathsBar from 'paths-js/bar';
// @ts-ignore
import PathsPie from 'paths-js/pie';
// @ts-ignore
import PathsSmoothLine from 'paths-js/smooth-line';
// @ts-ignore
import PathsRadar from 'paths-js/radar';
// @ts-ignore
import PathsStock from 'paths-js/stock';
// @ts-ignore
import PathsWaterfall from 'paths-js/waterfall';
// @ts-ignore
import PathsSankey from 'paths-js/sankey';

// @ts-ignore — lindenmayer has no types
import LSystem from 'lindenmayer';

// @ts-ignore — qrcode-svg has no types
import QRCode from 'qrcode-svg';

import { imageDataRGBA as _stackBlurRGBA, imageDataRGB as _stackBlurRGB } from 'stackblur-canvas';

// @ts-ignore — rgbquant has no types
import RgbQuant from 'rgbquant';

import rough from 'roughjs';
import type { Options as RoughOptions } from 'roughjs/bin/core';
import type { RoughGenerator } from 'roughjs/bin/generator';

// @ts-ignore — marchingsquares has no types
import { isoLines } from 'marchingsquares';

// ─── Dithering algorithms (hand-rolled, no deps) ────────────────────────────

interface DitherKernelDef {
  ox: number[];
  oy: number[];
  weights: number[];
  divisor: number;
}

const DITHER_KERNELS: Record<string, DitherKernelDef> = {
  'floyd-steinberg': {
    ox: [1, -1, 0, 1], oy: [0, 1, 1, 1],
    weights: [7, 3, 5, 1], divisor: 16,
  },
  'atkinson': {
    ox: [1, 2, -1, 0, 1, 0], oy: [0, 0, 1, 1, 1, 2],
    weights: [1, 1, 1, 1, 1, 1], divisor: 8,
  },
  'burkes': {
    ox: [1, 2, -2, -1, 0, 1, 2], oy: [0, 0, 1, 1, 1, 1, 1],
    weights: [8, 4, 2, 4, 8, 4, 2], divisor: 32,
  },
  'jarvis': {
    ox: [1, 2, -2, -1, 0, 1, 2, -2, -1, 0, 1, 2],
    oy: [0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2],
    weights: [7, 5, 3, 5, 7, 5, 3, 1, 3, 5, 3, 1], divisor: 48,
  },
  'sierra': {
    ox: [1, 2, -2, -1, 0, 1, 2, -1, 0, 1],
    oy: [0, 0, 1, 1, 1, 1, 1, 2, 2, 2],
    weights: [5, 3, 2, 4, 5, 4, 2, 2, 3, 2], divisor: 32,
  },
  'stucki': {
    ox: [1, 2, -2, -1, 0, 1, 2, -2, -1, 0, 1, 2],
    oy: [0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2],
    weights: [8, 4, 2, 4, 8, 4, 2, 1, 2, 4, 2, 1], divisor: 42,
  },
  'threshold': {
    ox: [], oy: [], weights: [], divisor: 1,
  },
};

function ditherImageData(
  imageData: ImageData,
  algorithm: string = 'floyd-steinberg',
  threshold: number = 128,
): ImageData {
  const { width, height, data } = imageData;

  // Convert to grayscale working buffer
  const gray = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const kernel = DITHER_KERNELS[algorithm] || DITHER_KERNELS['floyd-steinberg'];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldVal = gray[idx];
      const newVal = oldVal >= threshold ? 255 : 0;
      gray[idx] = newVal;
      const err = oldVal - newVal;
      if (err === 0) continue;

      for (let k = 0; k < kernel.ox.length; k++) {
        const nx = x + kernel.ox[k];
        const ny = y + kernel.oy[k];
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          gray[ny * width + nx] += err * kernel.weights[k] / kernel.divisor;
        }
      }
    }
  }

  // Write back
  for (let i = 0; i < width * height; i++) {
    const v = gray[i] > 127 ? 255 : 0;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
  }

  return imageData;
}

// ─── Synchronous streamline computation ──────────────────────────────────────
// Inspired by @anvaka/streamlines but runs synchronously for use in generators.

interface StreamlineConfig {
  vectorField: (p: { x: number; y: number }) => { x: number; y: number } | null;
  boundingBox: { left: number; top: number; width: number; height: number };
  dSep?: number;
  dTest?: number;
  timeStep?: number;
  maxLines?: number;
  maxStepsPerLine?: number;
  seed?: { x: number; y: number };
}

function computeStreamlines(config: StreamlineConfig): { x: number; y: number }[][] {
  const bb = config.boundingBox;
  const dSep = config.dSep ?? Math.max(bb.width, bb.height) / 30;
  const dTest = config.dTest ?? dSep * 0.4;
  const timeStep = config.timeStep ?? dSep * 0.5;
  const maxLines = config.maxLines ?? 500;
  const maxSteps = config.maxStepsPerLine ?? 5000;

  const cellSize = dSep;
  const grid = new Map<string, { x: number; y: number }[]>();

  function gridKey(x: number, y: number): string {
    return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
  }

  function occupy(p: { x: number; y: number }): void {
    const k = gridKey(p.x, p.y);
    let arr = grid.get(k);
    if (!arr) { arr = []; grid.set(k, arr); }
    arr.push(p);
  }

  function isTooClose(x: number, y: number, minDist: number): boolean {
    const ci = Math.floor(x / cellSize);
    const cj = Math.floor(y / cellSize);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const k = `${ci + di},${cj + dj}`;
        const arr = grid.get(k);
        if (!arr) continue;
        for (const p of arr) {
          const dx = p.x - x; const dy = p.y - y;
          if (Math.sqrt(dx * dx + dy * dy) < minDist) return true;
        }
      }
    }
    return false;
  }

  function isOutside(x: number, y: number): boolean {
    return x < bb.left || x > bb.left + bb.width || y < bb.top || y > bb.top + bb.height;
  }

  function integrate(p: { x: number; y: number }, direction: number): { x: number; y: number } | null {
    const v = config.vectorField(p);
    if (!v || (v.x === 0 && v.y === 0)) return null;
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    if (len === 0) return null;
    return {
      x: p.x + direction * (v.x / len) * timeStep,
      y: p.y + direction * (v.y / len) * timeStep,
    };
  }

  function traceHalf(
    seed: { x: number; y: number },
    direction: number,
    localLine: { x: number; y: number }[],
  ): void {
    let cur = seed;
    for (let i = 0; i < maxSteps; i++) {
      const next = integrate(cur, direction);
      if (!next || isOutside(next.x, next.y)) break;
      if (isTooClose(next.x, next.y, dTest)) break;
      if (direction > 0) localLine.push(next);
      else localLine.unshift(next);
      occupy(next);
      cur = next;
    }
  }

  function traceLine(seed: { x: number; y: number }): { x: number; y: number }[] {
    const line: { x: number; y: number }[] = [seed];
    traceHalf(seed, 1, line);
    traceHalf(seed, -1, line);
    return line;
  }

  const lines: { x: number; y: number }[][] = [];

  // Use a deterministic local RNG so seeds don't depend on external state
  let rngState = 12345;
  function localRng(): number {
    rngState = (rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Build candidate seeds: grid with jitter
  const seedQueue: { x: number; y: number }[] = [];
  const startSeed = config.seed ?? { x: bb.left + bb.width / 2, y: bb.top + bb.height / 2 };
  seedQueue.push(startSeed);

  const seedStep = dSep * 0.8;
  for (let sy = bb.top; sy < bb.top + bb.height; sy += seedStep) {
    for (let sx = bb.left; sx < bb.left + bb.width; sx += seedStep) {
      seedQueue.push({
        x: sx + localRng() * seedStep * 0.5,
        y: sy + localRng() * seedStep * 0.5,
      });
    }
  }

  for (const seed of seedQueue) {
    if (lines.length >= maxLines) break;
    if (isTooClose(seed.x, seed.y, dSep * 0.8)) continue;
    occupy(seed);
    const line = traceLine(seed);
    if (line.length >= 5) lines.push(line);
  }

  return lines;
}

// ─── Helper library exposed to generated code as `lib` ───────────────────────

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60)       { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else              { r1 = c; b1 = x; }

  return { r: r1 + m, g: g1 + m, b: b1 + m };
}

// ─── Vector2 ──────────────────────────────────────────────────────────────────

interface Vec2 {
  x: number;
  y: number;
  add(other: Vec2 | { x: number; y: number }): Vec2;
  sub(other: Vec2 | { x: number; y: number }): Vec2;
  scale(s: number): Vec2;
  rotate(angleDeg: number): Vec2;
  length(): number;
  normalize(): Vec2;
}

function vec2(x: number, y: number): Vec2 {
  return {
    x, y,
    add(o)     { return vec2(x + o.x, y + o.y); },
    sub(o)     { return vec2(x - o.x, y - o.y); },
    scale(s)   { return vec2(x * s, y * s); },
    rotate(deg) {
      const rad = deg * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      return vec2(x * cos - y * sin, x * sin + y * cos);
    },
    length()    { return Math.sqrt(x * x + y * y); },
    normalize() {
      const len = Math.sqrt(x * x + y * y);
      return len === 0 ? vec2(0, 0) : vec2(x / len, y / len);
    },
  };
}

// ─── Pre-seeded noise instances ───────────────────────────────────────────────

const defaultNoise2D = createNoise2D();
const defaultNoise3D = createNoise3D();
const defaultNoise4D = createNoise4D();

// ─── Easing presets ───────────────────────────────────────────────────────────

const easings = {
  linear:         BezierEasing(0, 0, 1, 1),
  easeIn:         BezierEasing(0.42, 0, 1, 1),
  easeOut:        BezierEasing(0, 0, 0.58, 1),
  easeInOut:      BezierEasing(0.42, 0, 0.58, 1),
  easeInCubic:    BezierEasing(0.55, 0.055, 0.675, 0.19),
  easeOutCubic:   BezierEasing(0.215, 0.61, 0.355, 1),
  easeInOutCubic: BezierEasing(0.645, 0.045, 0.355, 1),
  easeInBack:     BezierEasing(0.6, -0.28, 0.735, 0.045),
  easeOutBack:    BezierEasing(0.175, 0.885, 0.32, 1.275),
  easeInOutBack:  BezierEasing(0.68, -0.55, 0.265, 1.55),
};

// ─── Chroma-to-Figma bridge ──────────────────────────────────────────────────

function chromaToFigma(c: chroma.Color): { r: number; g: number; b: number } {
  const [r, g, b] = c.rgb();
  return { r: r / 255, g: g / 255, b: b / 255 };
}

// ─── 3D projection helpers ───────────────────────────────────────────────────

interface Point3D { x: number; y: number; z: number }
interface Point2D { x: number; y: number }
interface Mesh3D { vertices: Point3D[]; faces: number[][] }

function rotate3D(p: Point3D, rx: number, ry: number, rz: number): Point3D {
  const toR = (d: number) => d * Math.PI / 180;
  const [ax, ay, az] = [toR(rx), toR(ry), toR(rz)];

  // Rotate around X
  let { x, y, z } = p;
  let y1 = y * Math.cos(ax) - z * Math.sin(ax);
  let z1 = y * Math.sin(ax) + z * Math.cos(ax);

  // Rotate around Y
  let x2 = x * Math.cos(ay) + z1 * Math.sin(ay);
  let z2 = -x * Math.sin(ay) + z1 * Math.cos(ay);

  // Rotate around Z
  let x3 = x2 * Math.cos(az) - y1 * Math.sin(az);
  let y3 = x2 * Math.sin(az) + y1 * Math.cos(az);

  return { x: x3, y: y3, z: z2 };
}

function project3D(p: Point3D, focalLength: number): Point2D {
  const denom = focalLength + p.z;
  if (Math.abs(denom) < 0.001) {
    const sign = denom >= 0 ? 1 : -1;
    const clampedScale = focalLength / (sign * 0.001);
    return { x: p.x * clampedScale, y: p.y * clampedScale };
  }
  const scale = focalLength / denom;
  return { x: p.x * scale, y: p.y * scale };
}

function make3DCube(size: number): Mesh3D {
  const h = size / 2;
  const vertices: Point3D[] = [
    { x: -h, y: -h, z: -h }, { x:  h, y: -h, z: -h },
    { x:  h, y:  h, z: -h }, { x: -h, y:  h, z: -h },
    { x: -h, y: -h, z:  h }, { x:  h, y: -h, z:  h },
    { x:  h, y:  h, z:  h }, { x: -h, y:  h, z:  h },
  ];
  const faces = [
    [0, 1, 2, 3], // back
    [4, 5, 6, 7], // front
    [0, 4, 7, 3], // left
    [1, 5, 6, 2], // right
    [0, 1, 5, 4], // bottom
    [3, 2, 6, 7], // top
  ];
  return { vertices, faces };
}

function make3DSphere(radius: number, segments = 12): Mesh3D {
  const vertices: Point3D[] = [];
  const faces: number[][] = [];

  for (let lat = 0; lat <= segments; lat++) {
    const theta = (lat / segments) * Math.PI;
    for (let lon = 0; lon <= segments; lon++) {
      const phi = (lon / segments) * 2 * Math.PI;
      vertices.push({
        x: radius * Math.sin(theta) * Math.cos(phi),
        y: radius * Math.cos(theta),
        z: radius * Math.sin(theta) * Math.sin(phi),
      });
    }
  }

  for (let lat = 0; lat < segments; lat++) {
    for (let lon = 0; lon < segments; lon++) {
      const a = lat * (segments + 1) + lon;
      const b = a + segments + 1;
      faces.push([a, b, b + 1, a + 1]);
    }
  }

  return { vertices, faces };
}

function make3DTorus(major: number, minor: number, segments = 16): Mesh3D {
  const vertices: Point3D[] = [];
  const faces: number[][] = [];

  for (let i = 0; i <= segments; i++) {
    const u = (i / segments) * 2 * Math.PI;
    for (let j = 0; j <= segments; j++) {
      const v = (j / segments) * 2 * Math.PI;
      vertices.push({
        x: (major + minor * Math.cos(v)) * Math.cos(u),
        y: minor * Math.sin(v),
        z: (major + minor * Math.cos(v)) * Math.sin(u),
      });
    }
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + segments + 1;
      faces.push([a, b, b + 1, a + 1]);
    }
  }

  return { vertices, faces };
}

function pointsToSvgPath(points: Point2D[], closed = true): string {
  if (points.length === 0) return '';
  const valid = points.filter(p => isFinite(p.x) && isFinite(p.y));
  if (valid.length === 0) return '';
  const parts = valid.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(3)} ${p.y.toFixed(3)}`);
  if (closed) parts.push('Z');
  return parts.join(' ');
}

// ─── SVG path sampling ────────────────────────────────────────────────────────

interface PathSample { x: number; y: number; angle: number }

interface PathSegment {
  type: 'L' | 'C' | 'Q';
  points: number[]; // [x0,y0, ...control points..., xEnd,yEnd]
}

function parseSvgPathSegments(d: string): PathSegment[][] {
  const subpaths: PathSegment[][] = [];
  let current: PathSegment[] = [];
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;

  const tokens = d.match(/[MLCQZHVSmlcqzhvs]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return subpaths;

  let i = 0;
  const num = () => parseFloat(tokens[i++]);

  while (i < tokens.length) {
    const cmd = tokens[i++];
    switch (cmd) {
      case 'M':
        if (current.length > 0) subpaths.push(current);
        current = [];
        cx = num(); cy = num();
        startX = cx; startY = cy;
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const nx = num(), ny = num();
          current.push({ type: 'L', points: [cx, cy, nx, ny] });
          cx = nx; cy = ny;
        }
        break;
      case 'm': {
        if (current.length > 0) subpaths.push(current);
        current = [];
        cx += num(); cy += num();
        startX = cx; startY = cy;
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const dx = num(), dy = num();
          const nx = cx + dx, ny = cy + dy;
          current.push({ type: 'L', points: [cx, cy, nx, ny] });
          cx = nx; cy = ny;
        }
        break;
      }
      case 'L':
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const nx = num(), ny = num();
          current.push({ type: 'L', points: [cx, cy, nx, ny] });
          cx = nx; cy = ny;
        }
        break;
      case 'l':
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const dx = num(), dy = num();
          const nx = cx + dx, ny = cy + dy;
          current.push({ type: 'L', points: [cx, cy, nx, ny] });
          cx = nx; cy = ny;
        }
        break;
      case 'H':
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const nx = num();
          current.push({ type: 'L', points: [cx, cy, nx, cy] });
          cx = nx;
        }
        break;
      case 'h':
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const dx = num();
          current.push({ type: 'L', points: [cx, cy, cx + dx, cy] });
          cx += dx;
        }
        break;
      case 'V':
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const ny = num();
          current.push({ type: 'L', points: [cx, cy, cx, ny] });
          cy = ny;
        }
        break;
      case 'v':
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const dy = num();
          current.push({ type: 'L', points: [cx, cy, cx, cy + dy] });
          cy += dy;
        }
        break;
      case 'C':
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
          current.push({ type: 'C', points: [cx, cy, x1, y1, x2, y2, x3, y3] });
          cx = x3; cy = y3;
        }
        break;
      case 'c':
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const dx1 = num(), dy1 = num(), dx2 = num(), dy2 = num(), dx3 = num(), dy3 = num();
          current.push({ type: 'C', points: [cx, cy, cx+dx1, cy+dy1, cx+dx2, cy+dy2, cx+dx3, cy+dy3] });
          cx += dx3; cy += dy3;
        }
        break;
      case 'Q':
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const x1 = num(), y1 = num(), x2 = num(), y2 = num();
          current.push({ type: 'Q', points: [cx, cy, x1, y1, x2, y2] });
          cx = x2; cy = y2;
        }
        break;
      case 'q':
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const dx1 = num(), dy1 = num(), dx2 = num(), dy2 = num();
          current.push({ type: 'Q', points: [cx, cy, cx+dx1, cy+dy1, cx+dx2, cy+dy2] });
          cx += dx2; cy += dy2;
        }
        break;
      case 'S':
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const x2 = num(), y2 = num(), x3 = num(), y3 = num();
          // Reflect previous C control point, or use current point
          let rx = cx, ry = cy;
          const prev = current[current.length - 1];
          if (prev && prev.type === 'C') {
            rx = 2 * cx - prev.points[4];
            ry = 2 * cy - prev.points[5];
          }
          current.push({ type: 'C', points: [cx, cy, rx, ry, x2, y2, x3, y3] });
          cx = x3; cy = y3;
        }
        break;
      case 's':
        while (i < tokens.length && !isNaN(parseFloat(tokens[i]))) {
          const dx2 = num(), dy2 = num(), dx3 = num(), dy3 = num();
          let rx = cx, ry = cy;
          const prev = current[current.length - 1];
          if (prev && prev.type === 'C') {
            rx = 2 * cx - prev.points[4];
            ry = 2 * cy - prev.points[5];
          }
          current.push({ type: 'C', points: [cx, cy, rx, ry, cx+dx2, cy+dy2, cx+dx3, cy+dy3] });
          cx += dx3; cy += dy3;
        }
        break;
      case 'Z':
      case 'z':
        if (cx !== startX || cy !== startY) {
          current.push({ type: 'L', points: [cx, cy, startX, startY] });
        }
        cx = startX; cy = startY;
        break;
      default:
        break;
    }
  }
  if (current.length > 0) subpaths.push(current);
  return subpaths;
}

function evalBezier2(t: number, p0: number, p1: number, p2: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

function evalBezier3(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function segmentPoint(seg: PathSegment, t: number): { x: number; y: number } {
  const p = seg.points;
  switch (seg.type) {
    case 'L':
      return { x: p[0] + (p[2] - p[0]) * t, y: p[1] + (p[3] - p[1]) * t };
    case 'Q':
      return { x: evalBezier2(t, p[0], p[2], p[4]), y: evalBezier2(t, p[1], p[3], p[5]) };
    case 'C':
      return { x: evalBezier3(t, p[0], p[2], p[4], p[6]), y: evalBezier3(t, p[1], p[3], p[5], p[7]) };
  }
}

function segmentTangent(seg: PathSegment, t: number): { dx: number; dy: number } {
  const p = seg.points;
  const EPS = 1e-6;
  switch (seg.type) {
    case 'L':
      return { dx: p[2] - p[0], dy: p[3] - p[1] };
    case 'Q': {
      const u = 1 - t;
      return {
        dx: 2 * u * (p[2] - p[0]) + 2 * t * (p[4] - p[2]),
        dy: 2 * u * (p[3] - p[1]) + 2 * t * (p[5] - p[3]),
      };
    }
    case 'C': {
      const u = 1 - t;
      let dx = 3 * u * u * (p[2]-p[0]) + 6 * u * t * (p[4]-p[2]) + 3 * t * t * (p[6]-p[4]);
      let dy = 3 * u * u * (p[3]-p[1]) + 6 * u * t * (p[5]-p[3]) + 3 * t * t * (p[7]-p[5]);
      if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) {
        const p2 = segmentPoint(seg, Math.min(t + 0.001, 1));
        const p1 = segmentPoint(seg, Math.max(t - 0.001, 0));
        dx = p2.x - p1.x; dy = p2.y - p1.y;
      }
      return { dx, dy };
    }
  }
}

const ARC_LEN_SUBDIVS = 32;

function segmentArcLength(seg: PathSegment): number {
  if (seg.type === 'L') {
    const p = seg.points;
    const dx = p[2] - p[0], dy = p[3] - p[1];
    return Math.sqrt(dx * dx + dy * dy);
  }
  let len = 0;
  let prev = segmentPoint(seg, 0);
  for (let i = 1; i <= ARC_LEN_SUBDIVS; i++) {
    const cur = segmentPoint(seg, i / ARC_LEN_SUBDIVS);
    const dx = cur.x - prev.x, dy = cur.y - prev.y;
    len += Math.sqrt(dx * dx + dy * dy);
    prev = cur;
  }
  return len;
}

function samplePath(svgPath: string, count: number): PathSample[] {
  const subpaths = parseSvgPathSegments(svgPath);
  const segments = subpaths.flat();
  if (segments.length === 0 || count < 1) return [];

  const lengths = segments.map(segmentArcLength);
  const totalLength = lengths.reduce((a, b) => a + b, 0);
  if (totalLength === 0) return [];

  const cumulative: number[] = [];
  let running = 0;
  for (const l of lengths) { running += l; cumulative.push(running); }

  const samples: PathSample[] = [];
  for (let i = 0; i < count; i++) {
    const targetDist = count === 1 ? 0 : (i / (count - 1)) * totalLength;

    let segIdx = 0;
    while (segIdx < segments.length - 1 && cumulative[segIdx] < targetDist) segIdx++;

    const segStart = segIdx === 0 ? 0 : cumulative[segIdx - 1];
    const segLen = lengths[segIdx];
    const localT = segLen > 0 ? Math.max(0, Math.min(1, (targetDist - segStart) / segLen)) : 0;

    const pt = segmentPoint(segments[segIdx], localT);
    const tan = segmentTangent(segments[segIdx], localT);
    const angle = Math.atan2(tan.dy, tan.dx) * 180 / Math.PI;

    samples.push({ x: pt.x, y: pt.y, angle });
  }

  return samples;
}

function pathBounds(svgPath: string): { x: number; y: number; width: number; height: number } {
  const subpaths = parseSvgPathSegments(svgPath);
  const segments = subpaths.flat();
  if (segments.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const seg of segments) {
    const steps = seg.type === 'L' ? 1 : ARC_LEN_SUBDIVS;
    for (let i = 0; i <= steps; i++) {
      const pt = segmentPoint(seg, i / steps);
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ─── Superformula helpers ─────────────────────────────────────────────────────

interface SuperformulaConfig {
  m: number; n1: number; n2: number; n3: number; a?: number; b?: number;
}

function superformula(theta: number, m: number, n1: number, n2: number, n3: number, a = 1, b = 1): number {
  const t1 = Math.abs(Math.cos(m * theta / 4) / a);
  const t2 = Math.abs(Math.sin(m * theta / 4) / b);
  const sum = Math.pow(t1, n2) + Math.pow(t2, n3);
  if (sum === 0) return 0;
  return Math.pow(sum, -1 / n1);
}

function superformulaPath(config: SuperformulaConfig, numPoints = 128, size = 100): string {
  const { m, n1, n2, n3, a = 1, b = 1 } = config;
  const points: Point2D[] = [];
  for (let i = 0; i < numPoints; i++) {
    const theta = (i / numPoints) * 2 * Math.PI;
    const r = superformula(theta, m, n1, n2, n3, a, b);
    points.push({
      x: size * r * Math.cos(theta),
      y: size * r * Math.sin(theta),
    });
  }
  return pointsToSvgPath(points, true);
}

// ─── Rough.js hand-drawn SVG path generation ─────────────────────────────────

interface RoughPathInfo {
  d: string;
  stroke: string;
  strokeWidth: number;
  fill?: string;
}

const _roughGenerator: RoughGenerator = rough.generator();

function roughToPaths(
  drawFn: (gen: RoughGenerator) => ReturnType<RoughGenerator['rectangle']>,
): RoughPathInfo[] {
  const drawable = drawFn(_roughGenerator);
  return _roughGenerator.toPaths(drawable) as RoughPathInfo[];
}

const roughLib = {
  generator: _roughGenerator,

  rectangle(x: number, y: number, w: number, h: number, options?: RoughOptions): RoughPathInfo[] {
    return roughToPaths((g) => g.rectangle(x, y, w, h, options));
  },
  circle(cx: number, cy: number, diameter: number, options?: RoughOptions): RoughPathInfo[] {
    return roughToPaths((g) => g.circle(cx, cy, diameter, options));
  },
  ellipse(cx: number, cy: number, w: number, h: number, options?: RoughOptions): RoughPathInfo[] {
    return roughToPaths((g) => g.ellipse(cx, cy, w, h, options));
  },
  line(x1: number, y1: number, x2: number, y2: number, options?: RoughOptions): RoughPathInfo[] {
    return roughToPaths((g) => g.line(x1, y1, x2, y2, options));
  },
  polygon(points: [number, number][], options?: RoughOptions): RoughPathInfo[] {
    return roughToPaths((g) => g.polygon(points, options));
  },
  arc(cx: number, cy: number, w: number, h: number, start: number, stop: number, closed?: boolean, options?: RoughOptions): RoughPathInfo[] {
    return roughToPaths((g) => g.arc(cx, cy, w, h, start, stop, closed, options));
  },
  curve(points: [number, number][], options?: RoughOptions): RoughPathInfo[] {
    return roughToPaths((g) => g.curve(points, options));
  },
  linearPath(points: [number, number][], options?: RoughOptions): RoughPathInfo[] {
    return roughToPaths((g) => g.linearPath(points, options));
  },
  path(svgPath: string, options?: RoughOptions): RoughPathInfo[] {
    return roughToPaths((g) => g.path(svgPath, options));
  },
};

// ─── Reaction-diffusion (Gray-Scott) ──────────────────────────────────────────

interface GrayScottOptions {
  feed?: number;
  kill?: number;
  iterations?: number;
  gridSize?: number;
  dA?: number;
  dB?: number;
}

interface GrayScottResult {
  grid: Float32Array;
  N: number;
  minB: number;
  maxB: number;
  rangeB: number;
}

// Shared simulation used by both raster and vector output paths.
function runGrayScott(options: GrayScottOptions): GrayScottResult {
  const {
    feed = 0.04,
    kill = 0.06,
    iterations = 3000,
    gridSize = 200,
    dA = 0.21,
    dB = 0.105,
  } = options;

  const N = gridSize;
  const size = N * N;

  let a = new Float32Array(size).fill(1);
  let b = new Float32Array(size).fill(0);
  let nextA = new Float32Array(size);
  let nextB = new Float32Array(size);

  for (let s = 0; s < 30; s++) {
    const sx = Math.floor(mulberry32() * N);
    const sy = Math.floor(mulberry32() * N);
    const r = 3 + Math.floor(mulberry32() * 5);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const ix = ((sx + dx) + N) % N;
          const iy = ((sy + dy) + N) % N;
          a[iy * N + ix] = 0;
          b[iy * N + ix] = 1;
        }
      }
    }
  }

  // 9-neighbor Laplacian (Pearson 1993 stencil):
  //   corners: 0.05  edges: 0.20  center: -1.0
  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < N; y++) {
      const yt = ((y - 1 + N) % N) * N;
      const yc = y * N;
      const yb = ((y + 1) % N) * N;
      for (let x = 0; x < N; x++) {
        const xl = (x - 1 + N) % N;
        const xr = (x + 1) % N;
        const av = a[yc + x];
        const bv = b[yc + x];

        const lapA =
          0.05 * (a[yt + xl] + a[yt + xr] + a[yb + xl] + a[yb + xr]) +
          0.20 * (a[yt + x]  + a[yb + x]  + a[yc + xl] + a[yc + xr]) -
          av;
        const lapB =
          0.05 * (b[yt + xl] + b[yt + xr] + b[yb + xl] + b[yb + xr]) +
          0.20 * (b[yt + x]  + b[yb + x]  + b[yc + xl] + b[yc + xr]) -
          bv;

        const abb = av * bv * bv;
        let na = av + dA * lapA - abb + feed * (1 - av);
        let nb = bv + dB * lapB + abb - (kill + feed) * bv;
        nextA[yc + x] = na < 0 ? 0 : na > 1 ? 1 : na;
        nextB[yc + x] = nb < 0 ? 0 : nb > 1 ? 1 : nb;
      }
    }
    const tmpA = a; a = nextA; nextA = tmpA;
    const tmpB = b; b = nextB; nextB = tmpB;
  }

  let minB = b[0];
  let maxB = b[0];
  for (let i = 1; i < size; i++) {
    if (b[i] < minB) minB = b[i];
    if (b[i] > maxB) maxB = b[i];
  }
  const rangeB = maxB - minB > 0 ? maxB - minB : 1;

  return { grid: b, N, minB, maxB, rangeB };
}

interface ReactionDiffusionOptions extends GrayScottOptions {
  color?: string;
  background?: string;
  threshold?: number;
}

function reactionDiffusion(
  width: number,
  height: number,
  options?: ReactionDiffusionOptions,
): number[] {
  const { color = '#000000', background = '#ffffff', threshold = 0, ...simOpts } = options || {};
  const { grid, N, minB, rangeB } = runGrayScott(simOpts);
  const size = N * N;

  const fg = chroma(color);
  const bg = chroma(background);

  return renderCanvas(width, height, (ctx) => {
    const sim = document.createElement('canvas');
    sim.width = N;
    sim.height = N;
    const sCtx = sim.getContext('2d')!;
    const img = sCtx.createImageData(N, N);
    const d = img.data;

    for (let i = 0; i < size; i++) {
      let t = (grid[i] - minB) / rangeB;
      if (threshold > 0) t = t > threshold ? 1 : 0;
      const [r, g, bl] = chroma.mix(bg, fg, t).rgb();
      const p = i << 2;
      d[p] = r; d[p + 1] = g; d[p + 2] = bl; d[p + 3] = 255;
    }
    sCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sim, 0, 0, width, height);
  });
}

// ─── Chaikin curve smoothing ──────────────────────────────────────────────────

function chaikinSmooth(pts: number[][], passes: number): number[][] {
  let result = pts;
  for (let p = 0; p < passes; p++) {
    const next: number[][] = [];
    for (let i = 0; i < result.length; i++) {
      const cur = result[i];
      const nxt = result[(i + 1) % result.length];
      next.push(
        [cur[0] * 0.75 + nxt[0] * 0.25, cur[1] * 0.75 + nxt[1] * 0.25],
        [cur[0] * 0.25 + nxt[0] * 0.75, cur[1] * 0.25 + nxt[1] * 0.75],
      );
    }
    result = next;
  }
  return result;
}

// ─── Vector reaction-diffusion (marching squares → SVG path) ─────────────────

interface ReactionDiffusionSVGOptions extends GrayScottOptions {
  threshold?: number;
  smoothing?: number;
}

function reactionDiffusionSVG(
  width: number,
  height: number,
  options?: ReactionDiffusionSVGOptions,
): string {
  const { threshold = 0.5, smoothing = 2, ...simOpts } = options || {};
  const { grid, N, minB, rangeB } = runGrayScott(simOpts);

  // Build 2D array normalized to [0,1] for marching squares
  const field: number[][] = [];
  for (let y = 0; y < N; y++) {
    const row: number[] = [];
    for (let x = 0; x < N; x++) {
      row.push((grid[y * N + x] - minB) / rangeB);
    }
    field.push(row);
  }

  const contours: number[][][] = isoLines(field, [threshold]);
  const paths = contours[0] || [];

  const sx = width / (N - 1);
  const sy = height / (N - 1);

  const pathParts: string[] = [];
  for (const ring of paths) {
    if (ring.length < 3) continue;
    // Scale from grid coords to output pixels and smooth
    const scaled: number[][] = ring.map((pt: number[]) => [pt[0] * sx, pt[1] * sy]);
    const smooth = smoothing > 0 ? chaikinSmooth(scaled, smoothing) : scaled;
    const first = smooth[0];
    const segments = [`M ${first[0].toFixed(1)} ${first[1].toFixed(1)}`];
    for (let i = 1; i < smooth.length; i++) {
      segments.push(`L ${smooth[i][0].toFixed(1)} ${smooth[i][1].toFixed(1)}`);
    }
    segments.push('Z');
    pathParts.push(segments.join(' '));
  }

  return pathParts.join(' ');
}

// ─── Shared contour-to-SVG builder ────────────────────────────────────────────

function contoursToSvg(
  field: number[][],
  width: number,
  height: number,
  cols: number,
  rows: number,
  smoothPasses: number,
): string {
  const contours: number[][][] = isoLines(field, [0.5]);
  const rings = contours[0] || [];
  const sx = width / (cols - 1);
  const sy = height / (rows - 1);

  const pathParts: string[] = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const scaled: number[][] = ring.map((pt: number[]) => [pt[0] * sx, pt[1] * sy]);
    const sm = smoothPasses > 0 ? chaikinSmooth(scaled, smoothPasses) : scaled;
    const first = sm[0];
    const segs = [`M ${first[0].toFixed(1)} ${first[1].toFixed(1)}`];
    for (let i = 1; i < sm.length; i++) {
      segs.push(`L ${sm[i][0].toFixed(1)} ${sm[i][1].toFixed(1)}`);
    }
    segs.push('Z');
    pathParts.push(segs.join(' '));
  }
  return pathParts.join(' ');
}

// ─── Circle packing ───────────────────────────────────────────────────────────

interface CirclePackOptions {
  count?: number;
  minRadius?: number;
  maxRadius?: number;
  padding?: number;
  maxAttempts?: number;
}

function circlePack(
  width: number,
  height: number,
  options?: CirclePackOptions,
): { x: number; y: number; r: number }[] {
  const {
    count = 100,
    minRadius = 2,
    maxRadius = 50,
    padding = 1,
    maxAttempts = 10000,
  } = options || {};

  const circles: { x: number; y: number; r: number }[] = [];
  const cellSize = maxRadius * 2 + padding;
  const grid = new Map<string, { x: number; y: number; r: number }[]>();

  function gk(x: number, y: number): string {
    return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
  }
  function addG(c: { x: number; y: number; r: number }): void {
    const k = gk(c.x, c.y);
    let arr = grid.get(k);
    if (!arr) { arr = []; grid.set(k, arr); }
    arr.push(c);
  }
  function overlaps(x: number, y: number, r: number): boolean {
    const ci = Math.floor(x / cellSize);
    const cj = Math.floor(y / cellSize);
    for (let di = -2; di <= 2; di++) {
      for (let dj = -2; dj <= 2; dj++) {
        const arr = grid.get(`${ci + di},${cj + dj}`);
        if (!arr) continue;
        for (const c of arr) {
          const dx = c.x - x, dy = c.y - y;
          const md = c.r + r + padding;
          if (dx * dx + dy * dy < md * md) return true;
        }
      }
    }
    return false;
  }

  let attempts = 0;
  while (circles.length < count && attempts < maxAttempts) {
    attempts++;
    const r = minRadius + mulberry32() * (maxRadius - minRadius);
    const x = r + mulberry32() * (width - 2 * r);
    const y = r + mulberry32() * (height - 2 * r);
    if (!overlaps(x, y, r)) {
      const c = { x, y, r };
      circles.push(c);
      addG(c);
    }
  }
  return circles;
}

// ─── Strange attractors ───────────────────────────────────────────────────────

interface StrangeAttractorOptions {
  type?: 'clifford' | 'dejong';
  a?: number;
  b?: number;
  c?: number;
  d?: number;
  iterations?: number;
  skip?: number;
}

function strangeAttractor(
  width: number,
  height: number,
  options?: StrangeAttractorOptions,
): string {
  const {
    type = 'clifford',
    a = -1.4, b = 1.6, c = 1.0, d = 0.7,
    iterations = 50000,
    skip = 100,
  } = options || {};

  let x = 0.1, y = 0.1;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const pts: { x: number; y: number }[] = [];

  for (let i = 0; i < iterations + skip; i++) {
    let nx: number, ny: number;
    if (type === 'dejong') {
      nx = Math.sin(a * y) - Math.cos(b * x);
      ny = Math.sin(c * x) - Math.cos(d * y);
    } else {
      nx = Math.sin(a * y) + c * Math.cos(a * x);
      ny = Math.sin(b * x) + d * Math.cos(b * y);
    }
    x = nx; y = ny;
    if (i >= skip) {
      pts.push({ x, y });
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const margin = 10;
  const sw = width - 2 * margin, sh = height - 2 * margin;

  const segments: string[] = [];
  let prevSx = -Infinity, prevSy = -Infinity;
  let inPath = false;

  for (const pt of pts) {
    const sx = margin + ((pt.x - minX) / rangeX) * sw;
    const sy = margin + ((pt.y - minY) / rangeY) * sh;
    const dx = sx - prevSx, dy = sy - prevSy;
    if (dx * dx + dy * dy < 0.25) continue;
    segments.push(`${inPath ? 'L' : 'M'} ${sx.toFixed(1)} ${sy.toFixed(1)}`);
    inPath = true;
    prevSx = sx; prevSy = sy;
  }
  return segments.join(' ');
}

// ─── Metaballs ────────────────────────────────────────────────────────────────

interface MetaballsOptions {
  count?: number;
  minRadius?: number;
  maxRadius?: number;
  gridSize?: number;
  smoothing?: number;
}

function metaballs(
  width: number,
  height: number,
  options?: MetaballsOptions,
): string {
  const {
    count = 5,
    minRadius = 30,
    maxRadius = 80,
    gridSize = 100,
    smoothing = 2,
  } = options || {};

  const N = gridSize;
  const scale = width / N;

  const blobs: { cx: number; cy: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const r = (minRadius + mulberry32() * (maxRadius - minRadius)) / scale;
    blobs.push({
      cx: r + mulberry32() * (N - 2 * r),
      cy: r + mulberry32() * (N - 2 * r),
      r,
    });
  }

  const field: number[][] = [];
  for (let y = 0; y < N; y++) {
    const row: number[] = [];
    for (let x = 0; x < N; x++) {
      let val = 0;
      for (const bl of blobs) {
        const dx = x - bl.cx, dy = y - bl.cy;
        const distSq = dx * dx + dy * dy;
        val += (bl.r * bl.r) / (distSq || 0.001);
      }
      row.push(val);
    }
    field.push(row);
  }

  const contours: number[][][] = isoLines(field, [1.0]);
  const rings = contours[0] || [];
  const sx = width / (N - 1);
  const sy = height / (N - 1);

  const pathParts: string[] = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const scaled: number[][] = ring.map((pt: number[]) => [pt[0] * sx, pt[1] * sy]);
    const sm = smoothing > 0 ? chaikinSmooth(scaled, smoothing) : scaled;
    const first = sm[0];
    const segs = [`M ${first[0].toFixed(1)} ${first[1].toFixed(1)}`];
    for (let i = 1; i < sm.length; i++) {
      segs.push(`L ${sm[i][0].toFixed(1)} ${sm[i][1].toFixed(1)}`);
    }
    segs.push('Z');
    pathParts.push(segs.join(' '));
  }
  return pathParts.join(' ');
}

// ─── Diffusion-Limited Aggregation (DLA) ──────────────────────────────────────

interface DlaOptions {
  count?: number;
  stepSize?: number;
  stickDistance?: number;
}

function dla(
  width: number,
  height: number,
  options?: DlaOptions,
): { x: number; y: number; parent: number }[] {
  const {
    count = 200,
    stepSize = 1,
    stickDistance = 3,
  } = options || {};

  const particles: { x: number; y: number; parent: number }[] = [];
  particles.push({ x: width / 2, y: height / 2, parent: -1 });

  const cellSize = stickDistance * 2;
  const grid = new Map<string, number[]>();

  function gk(x: number, y: number): string {
    return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
  }
  function addG(idx: number): void {
    const k = gk(particles[idx].x, particles[idx].y);
    let arr = grid.get(k);
    if (!arr) { arr = []; grid.set(k, arr); }
    arr.push(idx);
  }
  addG(0);

  function findNearest(x: number, y: number): number {
    const ci = Math.floor(x / cellSize), cj = Math.floor(y / cellSize);
    let bestDist = Infinity, bestIdx = -1;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const arr = grid.get(`${ci + di},${cj + dj}`);
        if (!arr) continue;
        for (const idx of arr) {
          const p = particles[idx];
          const dx = p.x - x, dy = p.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
        }
      }
    }
    return bestDist <= stickDistance ? bestIdx : -1;
  }

  const maxWalkSteps = 5000;
  const margin = stickDistance * 2;

  while (particles.length < count) {
    const side = Math.floor(mulberry32() * 4);
    let wx: number, wy: number;
    if (side === 0) { wx = mulberry32() * width; wy = margin; }
    else if (side === 1) { wx = mulberry32() * width; wy = height - margin; }
    else if (side === 2) { wx = margin; wy = mulberry32() * height; }
    else { wx = width - margin; wy = mulberry32() * height; }

    for (let s = 0; s < maxWalkSteps; s++) {
      const angle = mulberry32() * Math.PI * 2;
      wx += Math.cos(angle) * stepSize;
      wy += Math.sin(angle) * stepSize;
      if (wx < 0 || wx > width || wy < 0 || wy > height) break;

      const nearest = findNearest(wx, wy);
      if (nearest >= 0) {
        const idx = particles.length;
        particles.push({ x: wx, y: wy, parent: nearest });
        addG(idx);
        break;
      }
    }
  }
  return particles;
}

// ─── Cellular Automata ────────────────────────────────────────────────────────

interface CellularAutomataOptions {
  type?: 'life' | 'wolfram';
  rule?: number;
  gridSize?: number;
  steps?: number;
  fillRatio?: number;
  surviveMin?: number;
  surviveMax?: number;
  birthMin?: number;
  birthMax?: number;
  smooth?: boolean;
  smoothing?: number;
}

function cellularAutomata(
  width: number,
  height: number,
  options?: CellularAutomataOptions,
): string {
  const {
    type = 'life',
    rule = 30,
    gridSize = 80,
    steps = 50,
    fillRatio = 0.4,
    surviveMin = 2,
    surviveMax = 3,
    birthMin = 3,
    birthMax = 3,
    smoothing = 2,
  } = options || {};

  const useSmooth = options?.smooth ?? (type === 'life');

  if (type === 'wolfram') {
    const cols = gridSize;
    const rows = steps > 0 ? steps : gridSize;
    const grid = new Uint8Array(rows * cols);
    grid[Math.floor(cols / 2)] = 1;

    for (let y = 1; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const left = x > 0 ? grid[(y - 1) * cols + x - 1] : 0;
        const center = grid[(y - 1) * cols + x];
        const right = x < cols - 1 ? grid[(y - 1) * cols + x + 1] : 0;
        const pattern = (left << 2) | (center << 1) | right;
        grid[y * cols + x] = (rule >> pattern) & 1;
      }
    }

    if (useSmooth) {
      const field: number[][] = [];
      for (let y = 0; y < rows; y++) {
        const row: number[] = [];
        for (let x = 0; x < cols; x++) row.push(grid[y * cols + x]);
        field.push(row);
      }
      return contoursToSvg(field, width, height, cols, rows, smoothing);
    }
    return cellsToRectSvg(grid, cols, rows, width, height);
  }

  // Game of Life
  const N = gridSize;
  let grid = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) grid[i] = mulberry32() < fillRatio ? 1 : 0;

  const next = new Uint8Array(N * N);
  for (let step = 0; step < steps; step++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            neighbors += grid[((y + dy + N) % N) * N + ((x + dx + N) % N)];
          }
        }
        const alive = grid[y * N + x];
        next[y * N + x] = alive
          ? (neighbors >= surviveMin && neighbors <= surviveMax ? 1 : 0)
          : (neighbors >= birthMin && neighbors <= birthMax ? 1 : 0);
      }
    }
    grid.set(next);
  }

  if (useSmooth) {
    const field: number[][] = [];
    for (let y = 0; y < N; y++) {
      const row: number[] = [];
      for (let x = 0; x < N; x++) row.push(grid[y * N + x]);
      field.push(row);
    }
    return contoursToSvg(field, width, height, N, N, smoothing);
  }
  return cellsToRectSvg(grid, N, N, width, height);
}

function cellsToRectSvg(
  grid: Uint8Array,
  cols: number,
  rows: number,
  width: number,
  height: number,
): string {
  const cw = width / cols;
  const ch = height / rows;
  const parts: string[] = [];

  for (let y = 0; y < rows; y++) {
    let runStart = -1;
    for (let x = 0; x <= cols; x++) {
      const alive = x < cols ? grid[y * cols + x] : 0;
      if (alive && runStart < 0) {
        runStart = x;
      } else if (!alive && runStart >= 0) {
        const rx = runStart * cw;
        const ry = y * ch;
        const rw = (x - runStart) * cw;
        parts.push(`M ${rx.toFixed(1)} ${ry.toFixed(1)} h ${rw.toFixed(1)} v ${ch.toFixed(1)} h ${(-rw).toFixed(1)} Z`);
        runStart = -1;
      }
    }
  }
  return parts.join(' ');
}

// ─── Wave Function Collapse ───────────────────────────────────────────────────

interface WfcTileDef {
  edges: [string, string, string, string]; // [top, right, bottom, left]
}

const WFC_TILES: Record<string, WfcTileDef[]> = {
  truchet: [
    { edges: ['a', 'a', 'a', 'a'] },
    { edges: ['a', 'a', 'a', 'a'] },
  ],
  lines: [
    { edges: ['0', '0', '0', '0'] },
    { edges: ['0', '1', '0', '1'] },
    { edges: ['1', '0', '1', '0'] },
    { edges: ['1', '1', '0', '0'] },
    { edges: ['0', '1', '1', '0'] },
    { edges: ['0', '0', '1', '1'] },
    { edges: ['1', '0', '0', '1'] },
    { edges: ['1', '1', '1', '1'] },
  ],
  arcs: [
    { edges: ['0', '0', '0', '0'] },
    { edges: ['a', 'a', '0', '0'] },
    { edges: ['0', 'a', 'a', '0'] },
    { edges: ['0', '0', 'a', 'a'] },
    { edges: ['a', '0', '0', 'a'] },
    { edges: ['a', '0', 'a', '0'] },
    { edges: ['0', 'a', '0', 'a'] },
  ],
};

function wfcTileSvg(
  set: string,
  tileIdx: number,
  ox: number,
  oy: number,
  ts: number,
): string {
  const h = ts / 2;
  const mx = ox + h, my = oy + h;
  const r = ox + ts, b = oy + ts;
  const f = (n: number) => n.toFixed(1);

  if (set === 'truchet') {
    if (tileIdx === 0) {
      return `M ${f(mx)} ${f(oy)} A ${f(h)} ${f(h)} 0 0 0 ${f(ox)} ${f(my)} M ${f(r)} ${f(my)} A ${f(h)} ${f(h)} 0 0 0 ${f(mx)} ${f(b)}`;
    }
    return `M ${f(mx)} ${f(oy)} A ${f(h)} ${f(h)} 0 0 1 ${f(r)} ${f(my)} M ${f(ox)} ${f(my)} A ${f(h)} ${f(h)} 0 0 1 ${f(mx)} ${f(b)}`;
  }

  if (set === 'lines') {
    switch (tileIdx) {
      case 0: return '';
      case 1: return `M ${f(ox)} ${f(my)} L ${f(r)} ${f(my)}`;
      case 2: return `M ${f(mx)} ${f(oy)} L ${f(mx)} ${f(b)}`;
      case 3: return `M ${f(mx)} ${f(oy)} L ${f(mx)} ${f(my)} L ${f(r)} ${f(my)}`;
      case 4: return `M ${f(r)} ${f(my)} L ${f(mx)} ${f(my)} L ${f(mx)} ${f(b)}`;
      case 5: return `M ${f(mx)} ${f(b)} L ${f(mx)} ${f(my)} L ${f(ox)} ${f(my)}`;
      case 6: return `M ${f(ox)} ${f(my)} L ${f(mx)} ${f(my)} L ${f(mx)} ${f(oy)}`;
      case 7: return `M ${f(mx)} ${f(oy)} L ${f(mx)} ${f(b)} M ${f(ox)} ${f(my)} L ${f(r)} ${f(my)}`;
      default: return '';
    }
  }

  // arcs
  switch (tileIdx) {
    case 0: return '';
    case 1: return `M ${f(mx)} ${f(oy)} Q ${f(mx)} ${f(my)} ${f(r)} ${f(my)}`;
    case 2: return `M ${f(r)} ${f(my)} Q ${f(mx)} ${f(my)} ${f(mx)} ${f(b)}`;
    case 3: return `M ${f(mx)} ${f(b)} Q ${f(mx)} ${f(my)} ${f(ox)} ${f(my)}`;
    case 4: return `M ${f(ox)} ${f(my)} Q ${f(mx)} ${f(my)} ${f(mx)} ${f(oy)}`;
    case 5: return `M ${f(mx)} ${f(oy)} L ${f(mx)} ${f(b)}`;
    case 6: return `M ${f(ox)} ${f(my)} L ${f(r)} ${f(my)}`;
    default: return '';
  }
}

interface WfcOptions {
  tileSet?: 'truchet' | 'lines' | 'arcs';
  cols?: number;
  rows?: number;
  tileSize?: number;
  maxRetries?: number;
}

function waveFunctionCollapse(
  width: number,
  height: number,
  options?: WfcOptions,
): string {
  const {
    tileSet = 'truchet',
    maxRetries = 10,
  } = options || {};

  const tiles = WFC_TILES[tileSet] || WFC_TILES.truchet;

  let cols: number, rows: number, ts: number;
  if (options?.cols && options?.rows) {
    cols = options.cols;
    rows = options.rows;
    ts = Math.min(width / cols, height / rows);
  } else if (options?.tileSize) {
    ts = options.tileSize;
    cols = Math.max(1, Math.floor(width / ts));
    rows = Math.max(1, Math.floor(height / ts));
  } else {
    cols = 10; rows = 10;
    ts = Math.min(width / cols, height / rows);
  }

  const oppEdge = [2, 3, 0, 1];
  const dCol = [0, 1, 0, -1];
  const dRow = [-1, 0, 1, 0];
  const total = cols * rows;

  for (let retry = 0; retry < maxRetries; retry++) {
    const possible: boolean[][] = [];
    const collapsed: number[] = new Array(total).fill(-1);
    for (let i = 0; i < total; i++) possible.push(new Array(tiles.length).fill(true));

    function entropy(idx: number): number {
      if (collapsed[idx] >= 0) return Infinity;
      let c = 0;
      for (let t = 0; t < tiles.length; t++) if (possible[idx][t]) c++;
      return c;
    }

    function propagate(idx: number): boolean {
      const stack = [idx];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        const cr = Math.floor(cur / cols), cc = cur % cols;
        for (let dir = 0; dir < 4; dir++) {
          const nr = cr + dRow[dir], nc = cc + dCol[dir];
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const nIdx = nr * cols + nc;
          if (collapsed[nIdx] >= 0) continue;

          const validEdges: Record<string, boolean> = {};
          for (let t = 0; t < tiles.length; t++) {
            if (possible[cur][t]) validEdges[tiles[t].edges[dir]] = true;
          }

          let changed = false;
          for (let t = 0; t < tiles.length; t++) {
            if (possible[nIdx][t] && !validEdges[tiles[t].edges[oppEdge[dir]]]) {
              possible[nIdx][t] = false;
              changed = true;
            }
          }
          if (changed) {
            if (entropy(nIdx) === 0) return false;
            stack.push(nIdx);
          }
        }
      }
      return true;
    }

    let ok = true;
    for (let step = 0; step < total; step++) {
      let minE = Infinity, minIdx = -1;
      for (let i = 0; i < total; i++) {
        const e = entropy(i);
        if (e < minE) { minE = e; minIdx = i; }
      }
      if (minIdx < 0 || minE === Infinity) break;
      if (minE === 0) { ok = false; break; }

      const valid: number[] = [];
      for (let t = 0; t < tiles.length; t++) if (possible[minIdx][t]) valid.push(t);
      const chosen = valid[Math.floor(mulberry32() * valid.length)];
      collapsed[minIdx] = chosen;
      for (let t = 0; t < tiles.length; t++) possible[minIdx][t] = (t === chosen);

      if (!propagate(minIdx)) { ok = false; break; }
    }

    if (ok) {
      const pathParts: string[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ti = collapsed[r * cols + c];
          if (ti < 0) continue;
          const svg = wfcTileSvg(tileSet, ti, c * ts, r * ts, ts);
          if (svg) pathParts.push(svg);
        }
      }
      return pathParts.join(' ');
    }
  }
  return '';
}

// ─── Canvas rendering helper (for pattern tiles, no source image needed) ──────

function renderCanvas(
  width: number,
  height: number,
  fn: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void,
): number[] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  fn(ctx, canvas);
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Image data types & helpers ───────────────────────────────────────────────

export interface ImagePixelData {
  width: number;
  height: number;
  pixels: number[];
}

function getPixel(data: ImagePixelData, x: number, y: number): { r: number; g: number; b: number; a: number } {
  const cx = Math.max(0, Math.min(data.width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(data.height - 1, Math.round(y)));
  const i = (cy * data.width + cx) * 4;
  return { r: data.pixels[i], g: data.pixels[i + 1], b: data.pixels[i + 2], a: data.pixels[i + 3] };
}

function getBrightness(data: ImagePixelData, x: number, y: number): number {
  const p = getPixel(data, x, y);
  return (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255;
}

interface SampleCell {
  r: number; g: number; b: number; a: number;
  brightness: number;
  srcX: number; srcY: number;
}

function sampleGrid(data: ImagePixelData, cols: number, rows: number): SampleCell[][] {
  const grid: SampleCell[][] = [];
  for (let row = 0; row < rows; row++) {
    const rowArr: SampleCell[] = [];
    const srcY = (row + 0.5) * (data.height / rows);
    for (let col = 0; col < cols; col++) {
      const srcX = (col + 0.5) * (data.width / cols);
      const p = getPixel(data, srcX, srcY);
      const brightness = (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255;
      rowArr.push({ ...p, brightness, srcX, srcY });
    }
    grid.push(rowArr);
  }
  return grid;
}

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────

let _seed = 42;
let _rngState = _seed;

function mulberry32(): number {
  _rngState |= 0;
  _rngState = (_rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function resetRng(): void {
  _rngState = _seed;
}

// ─── Assembled lib ────────────────────────────────────────────────────────────

const generatorLib = {
  // --- Original helpers (preserved for backward compatibility) ---
  hslToRgb,

  /** Current seed value. Stable across re-runs; changes on lib.reseed(). */
  get seed(): number { return _seed; },

  /**
   * Seeded random number in [0, 1). Produces the same sequence on every
   * generator run, so layouts (Voronoi, scatter, etc.) stay stable when
   * the user tweaks a color or slider. Use instead of Math.random().
   */
  random(): number { return mulberry32(); },

  /** Reset to a new random seed. Call from a "Randomize" button handler. */
  reseed(newSeed?: number): void {
    _seed = newSeed ?? Math.floor(Math.random() * 2147483647);
    _rngState = _seed;
  },

  randomColor(): { r: number; g: number; b: number } {
    return hslToRgb(mulberry32() * 360, 0.7 + mulberry32() * 0.3, 0.5 + mulberry32() * 0.15);
  },

  randomInt(min: number, max: number): number {
    return Math.floor(mulberry32() * (max - min + 1)) + min;
  },

  lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  },

  clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  },

  hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 };
  },

  // --- Color: chroma-js ---
  chroma,
  chromaToFigma,

  // --- Noise: simplex-noise ---
  noise: {
    noise2D: defaultNoise2D,
    noise3D: defaultNoise3D,
    noise4D: defaultNoise4D,
  },
  createNoise2D,
  createNoise3D,
  createNoise4D,

  // --- Easing: bezier-easing ---
  easing: BezierEasing,
  easings,

  // --- Geometry: d3-delaunay ---
  Delaunay,

  // --- Vector / math ---
  vec2,

  polarToXY(angleDeg: number, radius: number): { x: number; y: number } {
    const rad = angleDeg * Math.PI / 180;
    return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
  },

  degToRad(deg: number): number {
    return deg * Math.PI / 180;
  },

  radToDeg(rad: number): number {
    return rad * 180 / Math.PI;
  },

  mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
  },

  shuffle<T>(array: T[]): T[] {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(mulberry32() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  distribute(count: number, min: number, max: number): number[] {
    if (count <= 1) return [min];
    const step = (max - min) / (count - 1);
    return Array.from({ length: count }, (_, i) => min + step * i);
  },

  // --- 3D projection ---
  rotate3D,
  project3D,
  cube: (size: number) => make3DCube(size),
  sphere: (radius: number, segments?: number) => make3DSphere(radius, segments),
  torus: (major: number, minor: number, segments?: number) => make3DTorus(major, minor, segments),
  pointsToSvgPath,

  // --- SVG path sampling ---
  samplePath,
  pathBounds,

  // --- Superformula organic shapes ---
  superformula,
  superformulaPath,

  // --- L-Systems: lindenmayer ---
  LSystem,

  // --- QR codes: qrcode-svg ---
  QRCode,

  // --- Flow fields: synchronous streamline computation ---
  computeStreamlines,

  // --- Bitmap blur: stackblur-canvas ---
  stackBlur(imageData: ImageData, radius: number): ImageData {
    _stackBlurRGBA(imageData, 0, 0, imageData.width, imageData.height, Math.round(radius));
    return imageData;
  },
  stackBlurRGB(imageData: ImageData, radius: number): ImageData {
    _stackBlurRGB(imageData, 0, 0, imageData.width, imageData.height, Math.round(radius));
    return imageData;
  },

  // --- Dithering: built-in error diffusion ---
  dither: ditherImageData,
  ditherAlgorithms: Object.keys(DITHER_KERNELS),

  // --- Color quantization: rgbquant ---
  RgbQuant,

  // --- Hand-drawn sketchy graphics: roughjs ---
  rough: roughLib,

  // --- Charts: paths-js ---
  charts: {
    Bar: PathsBar,
    Pie: PathsPie,
    SmoothLine: PathsSmoothLine,
    Radar: PathsRadar,
    Stock: PathsStock,
    Waterfall: PathsWaterfall,
    Sankey: PathsSankey,
  },

  // --- Reaction-diffusion (Turing patterns) ---
  reactionDiffusion,
  reactionDiffusionSVG,

  // --- Computational design helpers ---
  circlePack,
  strangeAttractor,
  metaballs,
  dla,
  cellularAutomata,
  waveFunctionCollapse,

  // --- Canvas rendering (blank canvas, for pattern tiles etc.) ---
  renderCanvas,

  // --- Currently selected node ID (populated before generator runs) ---
  selectionId: null as string | null,

  // --- Image pixel data (populated before generator runs when imageNodeId is set) ---
  imageData: null as ImagePixelData | null,

  getPixel(x: number, y: number): { r: number; g: number; b: number; a: number } {
    if (!generatorLib.imageData) throw new Error('No image data loaded. Set imageNodeId on the UISpec.');
    return getPixel(generatorLib.imageData, x, y);
  },

  getBrightness(x: number, y: number): number {
    if (!generatorLib.imageData) throw new Error('No image data loaded. Set imageNodeId on the UISpec.');
    return getBrightness(generatorLib.imageData, x, y);
  },

  sampleGrid(cols: number, rows: number): SampleCell[][] {
    if (!generatorLib.imageData) throw new Error('No image data loaded. Set imageNodeId on the UISpec.');
    return sampleGrid(generatorLib.imageData, cols, rows);
  },

  // --- Bitmap image processing (Canvas2D) ---

  toImageData(): ImageData {
    if (!generatorLib.imageData) throw new Error('No image data loaded. Set imageNodeId on the UISpec.');
    const { width, height, pixels } = generatorLib.imageData;
    const clamped = new Uint8ClampedArray(pixels);
    return new ImageData(clamped, width, height);
  },

  processImage(fn: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void): number[] {
    if (!generatorLib.imageData) throw new Error('No image data loaded. Set imageNodeId on the UISpec.');
    const { width, height, pixels } = generatorLib.imageData;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const imgData = new ImageData(new Uint8ClampedArray(pixels), width, height);
    ctx.putImageData(imgData, 0, 0);

    fn(ctx, canvas);

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },
};

/**
 * Inject pixel data into the lib before running an image-processing generator.
 * Call with null to clear after execution.
 */
export function setImageData(data: ImagePixelData | null): void {
  generatorLib.imageData = data;
}

/**
 * Set the currently selected node ID on lib.selectionId.
 * Call before running the generator so "patternize this node" flows work.
 */
export function setSelectionId(id: string | null): void {
  generatorLib.selectionId = id;
}

export type GeneratorLib = typeof generatorLib;

// ─── Compiler ─────────────────────────────────────────────────────────────────

type GeneratorFn = (params: Record<string, unknown>, lib: GeneratorLib) => ActionDescriptor[];

/**
 * Compiles an LLM-generated JS function body string into a callable function.
 * The generated code receives two arguments: `params` (control values) and
 * `lib` (helper utilities like hslToRgb, randomColor, etc.).
 */
export function compileGenerator(code: string): GeneratorFn {
  let body = code.trim();

  // If the LLM wrapped it in `function generate(params, lib) { ... }`,
  // extract just the body.
  const fnMatch = body.match(
    /^function\s+\w*\s*\(\s*(\w+)\s*(?:,\s*(\w+)\s*)?\)\s*\{([\s\S]*)\}\s*$/,
  );
  if (fnMatch) {
    const paramName = fnMatch[1];
    const libName = fnMatch[2] || 'lib';
    const innerBody = fnMatch[3];
    const aliases: string[] = [];
    if (paramName !== 'params') aliases.push(`const params = ${paramName};`);
    if (libName !== 'lib') aliases.push(`const lib = ${libName};`);
    body = aliases.length > 0 ? aliases.join('\n') + '\n' + innerBody : innerBody;
  }

  // eslint-disable-next-line no-new-func
  const fn = new Function('params', 'lib', body) as GeneratorFn;
  return fn;
}

// ─── Executor ─────────────────────────────────────────────────────────────────

/**
 * Runs a compiled generator with the given control values and returns
 * the resulting ActionDescriptor array. Throws with a readable message
 * if execution fails.
 */
export function executeGenerator(
  fn: GeneratorFn,
  params: Record<string, unknown>,
): ActionDescriptor[] {
  resetRng();
  const result = fn(params, generatorLib);

  if (!Array.isArray(result)) {
    throw new Error(
      `Generator must return an array of actions, got ${typeof result}`,
    );
  }

  return result as ActionDescriptor[];
}
