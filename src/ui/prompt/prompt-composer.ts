import { CORE_PROMPT, AUTO_GENERATE_ADDENDUM } from './system-prompt';
import {
  MODULE_GENERATOR_INTRO,
  MODULE_CHROMA,
  MODULE_NOISE,
  MODULE_EASING,
  MODULE_VECTORS,
  MODULE_DELAUNAY,
  MODULE_IMAGE,
  MODULE_CANVAS,
  MODULE_REACTION_DIFFUSION,
  MODULE_3D,
  MODULE_LSYSTEM,
  MODULE_QRCODE,
  MODULE_FLOWFIELD,
  MODULE_CHARTS,
  MODULE_ROUGH,
  MODULE_PATTERN,
  MODULE_CREATE_METHODS,
  MODULE_GENERATOR_RULES,
  MODULE_EXAMPLES,
  MODULE_COMPUTATIONAL,
} from './prompt-modules';
import type { ApiChatMessage } from '../api/claude';
import type { SelectionContext, UISpec } from '../../shared/message-types';
import type { ChatMessage } from '../chat/ChatHistory';

export interface ComposedPrompt {
  system: string;
  messages: ApiChatMessage[];
}

export interface ComposeOptions {
  /** When true, appends the auto-generate addendum and replaces the user
   *  message with an analysis request. */
  autoGenerate?: boolean;
}

// ─── Module selection ─────────────────────────────────────────────────────────

interface ModuleKeywords {
  module: string;
  keywords: RegExp;
}

const MODULE_KEYWORD_MAP: ModuleKeywords[] = [
  { module: 'chroma',    keywords: /\b(color|palette|gradient|saturate|desaturate|darken|lighten|hue|chroma|tint|shade|warm|cool|complementary|analogous)\b/i },
  { module: 'noise',     keywords: /\b(noise|organic|procedural|perlin|simplex|turbulence|natural|random.*pattern)\b/i },
  { module: 'easing',    keywords: /\b(easing|ease|bezier|curve.*editor|falloff|distribution|progression|taper)\b/i },
  { module: 'delaunay',  keywords: /\b(voronoi|delaunay|triangulat|mosaic|stained.?glass|tessellat)\b/i },
  { module: 'image',     keywords: /\b(halftone|dither|posterize|pixel|image|photo|bitmap|blur.*image|sharpen|vignette|glitch|mosaic|ascii.*art|color.*extract|quantiz)\b/i },
  { module: 'canvas',    keywords: /\b(renderCanvas|tile|seamless|repeating.*pattern|pattern.*fill.*canvas)\b/i },
  { module: 'rd',        keywords: /\b(turing|reaction.?diffusion|gray.?scott|morphogenesis|biological.*pattern|organic.*spots|organic.*stripes|labyrinth|coral.*pattern|fingerprint.*pattern)\b/i },
  { module: '3d',        keywords: /\b(3d|sphere|cube|torus|wireframe|rotate3d|project3d|mesh|vertices|faces|perspective|along.*path|follow.*path|on.*path|distribute.*along|samplePath|pathBounds|vector.*path)\b/i },
  { module: 'lsystem',   keywords: /\b(fractal|l.?system|tree|fern|koch|sierpinski|dragon.*curve|branch|recursive|botanical)\b/i },
  { module: 'qrcode',    keywords: /\b(qr|qrcode|barcode)\b/i },
  { module: 'flowfield', keywords: /\b(flow.*field|streamline|vector.*field|field.*line)\b/i },
  { module: 'charts',    keywords: /\b(chart|bar.*chart|pie.*chart|radar|line.*chart|graph|data.*viz|plot|histogram)\b/i },
  { module: 'rough',     keywords: /\b(rough|sketch|hand.?drawn|whiteboard|doodle|hachure)\b/i },
  { module: 'pattern',   keywords: /\b(pattern.*fill|applyPattern|tile.*pattern|patternize|hexagonal.*tile)\b/i },
  { module: 'computational', keywords: /\b(circle.*pack|pack.*circle|attractor|clifford|dejong|lorenz|metaball|blob.*merge|lava.*lamp|dla|diffusion.*aggregat|coral.*growth|frost|lightning.*branch|crystal.*growth|cellular.*automat|game.*of.*life|wolfram|rule.*30|rule.*90|rule.*110|conway|wfc|wave.*function.*collapse|truchet|tile.*generation|constraint.*tile|generative.*art|computational.*design)\b/i },
];

const GENERATOR_KEYWORDS = /\b(grid|pattern|dots|circle|generate|create.*\d|layout|arrange|distribute|carousel|randomize|gradient|spiral|animate|scatter|wavy|noise|organic|palette|color.*scale|saturate|desaturate|darken|lighten|hue.*shift|3d|sphere|cube|fractal|tree|qr|halftone|dither|posterize|flow.*field|chart|voronoi|rough|sketch|mosaic|superformula|blob|along.*path|follow.*path|on.*path|along.*line|along.*curve|turing|reaction.?diffusion|gray.?scott|morphogenesis|circle.*pack|pack.*circle|attractor|clifford|dejong|metaball|lava.*lamp|dla|diffusion.*aggregat|coral.*growth|frost|lightning.*branch|cellular.*automat|game.*of.*life|wolfram|conway|wfc|wave.*function.*collapse|truchet|generative.*art|computational.*design)\b/i;

function selectModules(
  userMessage: string,
  autoGenerate: boolean,
  selectionContext: SelectionContext | null,
): string {
  if (autoGenerate) {
    return CORE_PROMPT + '\n' + AUTO_GENERATE_ADDENDUM;
  }

  const hasVectorPaths = selectionContext?.nodes.some(
    n => n.vectorPaths && n.vectorPaths.length > 0,
  ) ?? false;

  const parts: string[] = [CORE_PROMPT];
  const needsGenerator = GENERATOR_KEYWORDS.test(userMessage) || hasVectorPaths;

  if (needsGenerator) {
    parts.push(MODULE_GENERATOR_INTRO);
    parts.push(MODULE_VECTORS);
    parts.push(MODULE_CREATE_METHODS);
  }

  const matched: Record<string, boolean> = {};
  for (const { module, keywords } of MODULE_KEYWORD_MAP) {
    if (keywords.test(userMessage)) {
      matched[module] = true;
    }
  }

  if (hasVectorPaths) matched['3d'] = true;

  if (matched['chroma'] || needsGenerator) parts.push(MODULE_CHROMA);
  if (matched['noise'])     parts.push(MODULE_NOISE);
  if (matched['easing'])    parts.push(MODULE_EASING);
  if (matched['delaunay'])  parts.push(MODULE_DELAUNAY);
  if (matched['image'])     parts.push(MODULE_IMAGE);
  if (matched['canvas'])    parts.push(MODULE_CANVAS);
  if (matched['rd'])        parts.push(MODULE_REACTION_DIFFUSION);
  if (matched['3d'])        parts.push(MODULE_3D);
  if (matched['lsystem'])   parts.push(MODULE_LSYSTEM);
  if (matched['qrcode'])    parts.push(MODULE_QRCODE);
  if (matched['flowfield']) parts.push(MODULE_FLOWFIELD);
  if (matched['charts'])    parts.push(MODULE_CHARTS);
  if (matched['rough'])     parts.push(MODULE_ROUGH);
  if (matched['pattern'])   parts.push(MODULE_PATTERN);
  if (matched['computational']) parts.push(MODULE_COMPUTATIONAL);

  if (needsGenerator) {
    parts.push(MODULE_EXAMPLES);
    parts.push(MODULE_GENERATOR_RULES);
  }

  return parts.join('\n\n');
}

// ─── Chat history management ─────────────────────────────────────────────────

const MAX_RECENT_TURNS = 4;
const HISTORY_CHAR_BUDGET = 20_000;

/**
 * Summarises an LLM assistant response for inclusion as older history.
 * Strips the raw JSON payload and keeps only the conversational message.
 */
function summariseAssistantMessage(content: string): string {
  try {
    let raw = content.trim();
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1].trim();
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const msg = typeof parsed.message === 'string' ? parsed.message : '';
      const controlCount = Array.isArray(parsed.ui?.controls) ? parsed.ui.controls.length : 0;
      const hasGen = typeof parsed.generate === 'string';
      const parts: string[] = [];
      if (msg) parts.push(msg);
      if (controlCount > 0) parts.push(`[generated plugin with ${controlCount} control${controlCount > 1 ? 's' : ''}${hasGen ? ', generator' : ''}]`);
      return parts.join(' ') || '[generated plugin response]';
    }
  } catch { /* not JSON — keep as-is */ }
  return content;
}

/**
 * Prepares chat history for inclusion in the API prompt.
 * Recent turns are kept in full; older turns are summarised.
 */
function prepareHistory(chatHistory: ChatMessage[]): ApiChatMessage[] {
  const conversation = chatHistory.filter(m => m.role !== 'error');
  if (conversation.length === 0) return [];

  const turnPairs: Array<{ user?: ChatMessage; assistant?: ChatMessage }> = [];
  let current: { user?: ChatMessage; assistant?: ChatMessage } = {};

  for (const msg of conversation) {
    if (msg.role === 'user') {
      if (current.user) turnPairs.push(current);
      current = { user: msg };
    } else {
      current.assistant = msg;
      turnPairs.push(current);
      current = {};
    }
  }
  if (current.user || current.assistant) turnPairs.push(current);

  const recentStart = Math.max(0, turnPairs.length - MAX_RECENT_TURNS);
  const result: ApiChatMessage[] = [];

  for (let i = 0; i < turnPairs.length; i++) {
    const pair = turnPairs[i];
    const isOld = i < recentStart;

    if (pair.user) {
      result.push({ role: 'user', content: pair.user.content });
    }
    if (pair.assistant) {
      const content = isOld
        ? summariseAssistantMessage(pair.assistant.content)
        : pair.assistant.content;
      result.push({ role: 'assistant', content });
    }
  }

  // Enforce total history character budget by dropping oldest turns
  let totalChars = result.reduce((sum, m) => sum + m.content.length, 0);
  while (totalChars > HISTORY_CHAR_BUDGET && result.length > 2) {
    const removed = result.shift()!;
    totalChars -= removed.content.length;
    // Ensure we don't leave an orphaned assistant message as first entry
    if (result.length > 0 && result[0].role === 'assistant') {
      totalChars -= result[0].content.length;
      result.shift();
    }
  }

  return result;
}

// ─── Prompt composition ───────────────────────────────────────────────────────

/**
 * Assembles the full prompt from all available context.
 *
 * Layout:
 *   system  — core prompt + relevant feature modules (conditionally selected)
 *   user[0] — selection context + current UI spec (contextual preamble)
 *   ...     — prior chat turns (alternating user/assistant, errors skipped)
 *   user[N] — the new user message
 */
export function composePrompt(
  selectionContext: SelectionContext | null,
  currentUISpec: UISpec | null,
  chatHistory: ChatMessage[],
  userMessage: string,
  options?: ComposeOptions,
): ComposedPrompt {
  const autoGenerate = options?.autoGenerate ?? false;
  const systemPrompt = selectModules(userMessage, autoGenerate, selectionContext);

  const apiMessages: ApiChatMessage[] = [];

  // ── Contextual preamble ────────────────────────────────────────────────────
  const preambleParts: string[] = [];

  if (selectionContext && selectionContext.nodes.length > 0) {
    preambleParts.push(
      '## Current Figma selection\n```json\n' +
      JSON.stringify(selectionContext) +
      '\n```',
    );
    if (selectionContext.truncated) {
      preambleParts.push(
        '_Note: selection context was truncated to fit the token budget._',
      );
    }
  } else {
    preambleParts.push('## Current Figma selection\nNo nodes selected.');
  }

  if (currentUISpec) {
    preambleParts.push(
      '## Current control panel spec (may be refined by this turn)\n```json\n' +
      JSON.stringify(currentUISpec) +
      '\n```',
    );
  }

  if (preambleParts.length > 0) {
    apiMessages.push({ role: 'user', content: preambleParts.join('\n\n') });
    apiMessages.push({
      role: 'assistant',
      content: 'Understood. I have the selection context and will respond with the required JSON format.',
    });
  }

  // ── Prior chat turns (with history management) ─────────────────────────────
  const historyMessages = prepareHistory(chatHistory);
  apiMessages.push(...historyMessages);

  // ── New user message ───────────────────────────────────────────────────────
  const finalMessage = autoGenerate
    ? 'Analyze the selected nodes and auto-generate the best control panel for them. ' +
      'Follow the auto-generate mode rules.'
    : userMessage;

  const last = apiMessages[apiMessages.length - 1];
  if (last && last.role === 'user') {
    apiMessages[apiMessages.length - 1] = {
      role: 'user',
      content: last.content + '\n\n' + finalMessage,
    };
  } else {
    apiMessages.push({ role: 'user', content: finalMessage });
  }

  // Pre-flight context window guard: estimate total tokens and auto-truncate if needed
  const totalChars = systemPrompt.length + apiMessages.reduce((s, m) => s + m.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);
  const TOKEN_SAFETY_LIMIT = 180_000;

  if (estimatedTokens > TOKEN_SAFETY_LIMIT) {
    // Drop oldest conversation turns until we're under the limit
    while (apiMessages.length > 4) {
      const charsBefore = apiMessages.reduce((s, m) => s + m.content.length, 0);
      apiMessages.splice(2, 1); // Remove after the preamble pair
      if (apiMessages.length > 2 && apiMessages[2].role === 'assistant') {
        apiMessages.splice(2, 1);
      }
      const charsAfter = apiMessages.reduce((s, m) => s + m.content.length, 0);
      if (charsAfter === charsBefore) break;
      const newEstimate = Math.ceil((systemPrompt.length + charsAfter) / 4);
      if (newEstimate <= TOKEN_SAFETY_LIMIT) break;
    }
  }

  return { system: systemPrompt, messages: apiMessages };
}

// ─── Response parsing ─────────────────────────────────────────────────────────

export interface ParsedLLMResponse {
  actions: unknown[];
  ui: UISpec;
  message?: string;
  /** JS function body string for generative plugins. */
  generate?: string;
}

export interface ParseSuccess {
  ok: true;
  data: ParsedLLMResponse;
}

export interface ParseError {
  ok: false;
  error: string;
}

export type ParseResult = ParseSuccess | ParseError;

/**
 * Extracts and validates the JSON object from the LLM's raw text response.
 * Handles markdown code fences and bare JSON.
 */
export function parseLLMResponse(text: string): ParseResult {
  let raw = text.trim();
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    raw = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const objMatch = raw.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        parsed = JSON.parse(objMatch[0]);
      } catch {
        return { ok: false, error: `LLM response is not valid JSON. Raw response:\n${text.slice(0, 300)}` };
      }
    } else {
      return { ok: false, error: `LLM response contained no JSON object. Raw response:\n${text.slice(0, 300)}` };
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'LLM response parsed to a non-object.' };
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.actions)) {
    return { ok: false, error: 'LLM response missing required "actions" array.' };
  }

  if (typeof obj.ui !== 'object' || obj.ui === null) {
    return { ok: false, error: 'LLM response missing required "ui" object.' };
  }

  const ui = obj.ui as Record<string, unknown>;
  if (!Array.isArray(ui.controls)) {
    return { ok: false, error: 'LLM response "ui" object is missing "controls" array.' };
  }

  return {
    ok: true,
    data: {
      actions: obj.actions,
      ui: obj.ui as UISpec,
      message: typeof obj.message === 'string' ? obj.message : undefined,
      generate: typeof obj.generate === 'string' ? obj.generate : undefined,
    },
  };
}
