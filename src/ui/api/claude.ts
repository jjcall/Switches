// TODO: move to settings UI — do not commit a real key here.
const ANTHROPIC_API_KEY = 'sk-ant-REDACTED';

// Local CORS proxy — run `node proxy.mjs` before launching the plugin.
// The proxy forwards requests to api.anthropic.com and adds the
// Access-Control-Allow-Origin: * header that Figma's null-origin iframe needs.
const PROXY_URL = 'http://localhost:3333/v1/messages';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 16384;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMSuccess {
  ok: true;
  text: string;
}

export interface LLMError {
  ok: false;
  error: string;
}

export type LLMResult = LLMSuccess | LLMError;

// ─── API call ─────────────────────────────────────────────────────────────────

/**
 * Calls the Claude API via the local CORS proxy and returns the raw text of
 * the first content block. Never throws — failures are returned as LLMError.
 *
 * Run `node proxy.mjs` in the project root before launching the plugin.
 */
export async function callClaude(
  messages: ApiChatMessage[],
  systemPrompt: string,
): Promise<LLMResult> {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'YOUR_API_KEY_HERE') {
    return {
      ok: false,
      error: 'No API key configured. Set ANTHROPIC_API_KEY in src/ui/api/claude.ts.',
    };
  }

  let response: Response;
  try {
    response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Cannot reach proxy at ${PROXY_URL}. Run \`node proxy.mjs\` in the project root. (${msg})`,
    };
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json() as { error?: { message?: unknown } };
      const raw = body.error?.message;
      if (typeof raw === 'string') detail = raw;
      else if (raw !== undefined) detail = JSON.stringify(raw);
    } catch { /* ignore */ }
    const prefix = response.status === 429 ? 'Rate limited' : `API error ${response.status}`;
    return { ok: false, error: detail ? `${prefix}: ${detail}` : prefix };
  }

  let data: { content?: Array<{ type: string; text?: string }> };
  let rawText = '';
  try {
    rawText = await response.text();
    data = JSON.parse(rawText) as typeof data;
  } catch {
    return { ok: false, error: `Failed to parse API response as JSON. Raw: ${rawText.slice(0, 200)}` };
  }

  const textBlock = data.content?.find(b => b.type === 'text');
  if (!textBlock?.text) {
    return { ok: false, error: 'API returned no text content.' };
  }

  return { ok: true, text: textBlock.text };
}
