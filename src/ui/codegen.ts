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
