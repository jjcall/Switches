const PROXY_URL = 'http://localhost:3333/v1/messages';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS_GENERATOR = 16384;
const MAX_TOKENS_SIMPLE = 4096;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// ─── API key management ───────────────────────────────────────────────────────
// Figma's plugin iframe has a null origin, so localStorage is unavailable.
// The key lives in a module-level variable (survives the session) and is
// persisted across sessions via figma.clientStorage on the main thread.

let cachedApiKey: string | null = null;

export function getStoredApiKey(): string | null {
  return cachedApiKey;
}

export function setStoredApiKey(key: string): void {
  cachedApiKey = key;
}

export function clearStoredApiKey(): void {
  cachedApiKey = null;
}

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

export interface CallClaudeOptions {
  generatorLikely?: boolean;
  onPartialText?: (text: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function getRetryDelay(attempt: number, response: Response | null): number {
  if (response) {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) return seconds * 1000;
    }
  }
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── SSE stream parsing ──────────────────────────────────────────────────────

async function readStream(
  response: Response,
  onPartial?: (text: string) => void,
): Promise<LLMResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { ok: false, error: 'Streaming response has no body.' };
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string };
          error?: { message?: string };
        };

        if (event.type === 'error') {
          return { ok: false, error: event.error?.message || 'Stream error' };
        }

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
          fullText += event.delta.text;
          if (onPartial) onPartial(fullText);
        }
      } catch {
        // Skip malformed SSE events
      }
    }
  }

  if (!fullText) {
    return { ok: false, error: 'API stream returned no text content.' };
  }
  return { ok: true, text: fullText };
}

// ─── API call ─────────────────────────────────────────────────────────────────

/**
 * Calls the Claude API via the local CORS proxy with streaming, retry logic,
 * and dynamic max_tokens. Never throws — failures are returned as LLMError.
 */
export async function callClaude(
  messages: ApiChatMessage[],
  systemPrompt: string,
  options?: CallClaudeOptions,
): Promise<LLMResult> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error: 'No API key configured. Type /key YOUR_KEY to set your Anthropic API key.',
    };
  }

  const maxTokens = options?.generatorLikely ? MAX_TOKENS_GENERATOR : MAX_TOKENS_SIMPLE;
  const useStreaming = typeof options?.onPartialText === 'function';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
          temperature: 0.5,
          stream: useStreaming,
          system: systemPrompt,
          messages,
        }),
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(getRetryDelay(attempt, null));
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Cannot reach proxy at ${PROXY_URL}. Run \`node proxy.mjs\` in the project root. (${msg})`,
      };
    }

    if (!response.ok) {
      if (isRetryable(response.status) && attempt < MAX_RETRIES) {
        await sleep(getRetryDelay(attempt, response));
        continue;
      }

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

    // Streaming path
    if (useStreaming) {
      return readStream(response, options!.onPartialText);
    }

    // Non-streaming path
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

  return { ok: false, error: 'Max retries exceeded.' };
}
