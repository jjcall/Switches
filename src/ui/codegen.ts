import type { ActionDescriptor } from '../shared/message-types';
import chroma from 'chroma-js';
import { createNoise2D, createNoise3D, createNoise4D } from 'simplex-noise';
import BezierEasing from 'bezier-easing';
import { Delaunay } from 'd3-delaunay';

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

// ─── Assembled lib ────────────────────────────────────────────────────────────

const generatorLib = {
  // --- Original helpers (preserved for backward compatibility) ---
  hslToRgb,

  randomColor(): { r: number; g: number; b: number } {
    return hslToRgb(Math.random() * 360, 0.7 + Math.random() * 0.3, 0.5 + Math.random() * 0.15);
  },

  randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  distribute(count: number, min: number, max: number): number[] {
    if (count <= 1) return [min];
    const step = (max - min) / (count - 1);
    return Array.from({ length: count }, (_, i) => min + step * i);
  },

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
  const result = fn(params, generatorLib);

  if (!Array.isArray(result)) {
    throw new Error(
      `Generator must return an array of actions, got ${typeof result}`,
    );
  }

  return result as ActionDescriptor[];
}
