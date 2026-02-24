import { SYSTEM_PROMPT } from './system-prompt';
import type { ApiChatMessage } from '../api/claude';
import type { SelectionContext, UISpec } from '../../shared/message-types';
import type { ChatMessage } from '../chat/ChatHistory';

export interface ComposedPrompt {
  system: string;
  messages: ApiChatMessage[];
}

/**
 * Assembles the full prompt from all available context.
 *
 * Layout:
 *   system  — static system prompt (component catalog, format spec, constraints)
 *   user[0] — selection context + current UI spec (contextual preamble)
 *   ...     — prior chat turns (alternating user/assistant, errors skipped)
 *   user[N] — the new user message
 */
export function composePrompt(
  selectionContext: SelectionContext | null,
  currentUISpec: UISpec | null,
  chatHistory: ChatMessage[],
  userMessage: string,
): ComposedPrompt {
  const apiMessages: ApiChatMessage[] = [];

  // ── Contextual preamble ────────────────────────────────────────────────────
  const preambleParts: string[] = [];

  if (selectionContext && selectionContext.nodes.length > 0) {
    preambleParts.push(
      '## Current Figma selection\n```json\n' +
      JSON.stringify(selectionContext, null, 2) +
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
      JSON.stringify(currentUISpec, null, 2) +
      '\n```',
    );
  }

  if (preambleParts.length > 0) {
    apiMessages.push({ role: 'user', content: preambleParts.join('\n\n') });
    // Provide a minimal assistant acknowledgement so the history alternates
    // correctly (Claude API requires alternating user/assistant turns).
    apiMessages.push({
      role: 'assistant',
      content: 'Understood. I have the selection context and will respond with the required JSON format.',
    });
  }

  // ── Prior chat turns ───────────────────────────────────────────────────────
  // Skip error messages — they're UI-only noise, not part of the conversation.
  const conversationHistory = chatHistory.filter(m => m.role !== 'error');

  for (const msg of conversationHistory) {
    apiMessages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    });
  }

  // ── New user message ───────────────────────────────────────────────────────
  // If the last message is already from the user (e.g. preamble was skipped and
  // history ended on a user turn), we need to ensure we don't send two
  // consecutive user messages.
  const last = apiMessages[apiMessages.length - 1];
  if (last && last.role === 'user') {
    // Merge the new message into the last user turn.
    apiMessages[apiMessages.length - 1] = {
      role: 'user',
      content: last.content + '\n\n' + userMessage,
    };
  } else {
    apiMessages.push({ role: 'user', content: userMessage });
  }

  return { system: SYSTEM_PROMPT, messages: apiMessages };
}

// ─── Response parsing ─────────────────────────────────────────────────────────

export interface ParsedLLMResponse {
  actions: unknown[];
  ui: UISpec;
  message?: string;
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
  // Strip markdown code fences if present.
  let raw = text.trim();
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    raw = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try to find a JSON object in the text as a fallback.
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
    },
  };
}
