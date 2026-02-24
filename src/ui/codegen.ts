import type { ActionDescriptor } from '../shared/message-types';

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

const generatorLib = {
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
};

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
    // Re-alias if the LLM used different parameter names
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
