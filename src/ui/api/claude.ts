// TODO: move to settings UI — do not commit a real key here.
const ANTHROPIC_API_KEY = 'sk-ant-REDACTED';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 4096;

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
 * Calls the Claude API and returns the raw text of the first content block.
 * Never throws — all failures are returned as LLMError so callers can surface
 * them in the chat without try/catch at every call site.
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
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages,
      }),
    });
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    return { ok: false, error: `Network error: ${msg}` };
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json() as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      // ignore parse failure
    }
    const rateLimited = response.status === 429;
    const prefix = rateLimited ? 'Rate limited' : `API error ${response.status}`;
    return { ok: false, error: detail ? `${prefix}: ${detail}` : prefix };
  }

  let data: { content?: Array<{ type: string; text?: string }> };
  try {
    data = await response.json() as typeof data;
  } catch {
    return { ok: false, error: 'Failed to parse API response as JSON.' };
  }

  const textBlock = data.content?.find(b => b.type === 'text');
  if (!textBlock?.text) {
    return { ok: false, error: 'API returned no text content.' };
  }

  return { ok: true, text: textBlock.text };
}
