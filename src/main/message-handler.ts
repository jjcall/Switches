/// <reference types="@figma/plugin-typings" />

import type {
  ActionDescriptor,
  IframeToMainMessage,
  PluginReadyMessage,
  ControlChangeMessage,
  ExecuteActionsMessage,
  ErrorMessage,
  SelectionContextMessage,
  ExecutionResultMessage,
  ClaudeRequestMessage,
  ClaudeResponseMessage,
} from '../shared/message-types';
import { serializeSelection } from './selection-serializer';
import { executeActions, applyControlChange } from './action-executor';

// Resize is sent by useAutoResize in the iframe and is not a typed protocol
// message, so we handle it separately before the typed router.
interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handlePluginReady(_msg: PluginReadyMessage): void {
  console.log('[main] iframe ready — sending selection context');
  sendSelectionContext();
}

function handleControlChange(msg: ControlChangeMessage): void {
  const { controlId, value, action, actions } = msg.payload;

  // Build the list of actions to apply: prefer actions[] over single action.
  const toApply: ActionDescriptor[] = actions?.length
    ? actions
    : action
      ? [action]
      : [];

  if (toApply.length === 0) return;

  // Apply all actions in parallel — live tweaks, no undo grouping.
  Promise.all(toApply.map(a => applyControlChange(a, value))).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[main] control change failed for ${controlId}:`, message);
    figma.ui.postMessage({
      type: 'ERROR',
      payload: { source: 'control-change', message },
    });
  });
}

function handleExecuteActions(msg: ExecuteActionsMessage): void {
  const { actions, pluginSpec } = msg.payload;
  executeActions(actions, pluginSpec).then((result) => {
    const response: ExecutionResultMessage = {
      type: 'EXECUTION_RESULT',
      payload: result,
    };
    figma.ui.postMessage(response);
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[main] executeActions threw unexpectedly:', message);
    figma.ui.postMessage({
      type: 'ERROR',
      payload: { source: 'execute-actions', message },
    });
  });
}

function handleError(msg: ErrorMessage): void {
  console.error(`[main] error from iframe (${msg.payload.source}):`, msg.payload.message);
}

async function handleClaudeRequest(msg: ClaudeRequestMessage): Promise<void> {
  const { requestId, apiKey, body } = msg.payload;
  let ok = false;
  let status = 0;
  let responseBody = '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body,
    });
    ok = response.ok;
    status = response.status;
    responseBody = await response.text();
  } catch (err) {
    // In Figma's sandbox, thrown errors may not be Error instances.
    let message = 'Unknown fetch error';
    if (err instanceof Error) {
      message = err.message;
    } else if (typeof err === 'string') {
      message = err;
    } else if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      message = typeof e.message === 'string' ? e.message : JSON.stringify(err);
    }
    responseBody = JSON.stringify({ error: { message } });
    status = 0;
  }

  const reply: ClaudeResponseMessage = {
    type: 'CLAUDE_RESPONSE',
    payload: { requestId, ok, status, body: responseBody },
  };
  figma.ui.postMessage(reply);
}

// ─── Outbound helpers ─────────────────────────────────────────────────────────

/** Serializes the current page selection and sends it to the iframe. */
export function sendSelectionContext(): void {
  const payload = serializeSelection(figma.currentPage.selection);

  // Check if any selected node carries stored plugin spec data.
  const selection = figma.currentPage.selection;
  for (const node of selection) {
    try {
      const spec = node.getPluginData('pluginSpec');
      if (spec) {
        payload.pluginSpec = spec;
        break;
      }
    } catch {
      // getPluginData not supported on this node type — skip.
    }
  }

  const message: SelectionContextMessage = {
    type: 'SELECTION_CONTEXT',
    payload,
  };
  figma.ui.postMessage(message);
}

// ─── Router ───────────────────────────────────────────────────────────────────

/**
 * Registers the main thread's message listener.
 * Call once from code.ts after showUI().
 */
export function registerMessageHandler(): void {
  figma.ui.onmessage = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') {
      console.warn('[main] received non-object message:', raw);
      return;
    }

    // Handle resize before the typed protocol router.
    const maybeResize = raw as ResizeMessage;
    if (maybeResize.type === 'resize') {
      const width = typeof maybeResize.width === 'number' ? maybeResize.width : 300;
      const height = typeof maybeResize.height === 'number' ? maybeResize.height : 400;
      figma.ui.resize(width, height);
      return;
    }

    const msg = raw as IframeToMainMessage;

    switch (msg.type) {
      case 'PLUGIN_READY':
        handlePluginReady(msg);
        break;
      case 'CONTROL_CHANGE':
        handleControlChange(msg);
        break;
      case 'EXECUTE_ACTIONS':
        handleExecuteActions(msg);
        break;
      case 'ERROR':
        handleError(msg);
        break;
      case 'CLAUDE_REQUEST':
        void handleClaudeRequest(msg);
        break;
      default: {
        // Narrow to never to catch unhandled message types at compile time.
        const _exhaustive: never = msg;
        console.warn('[main] unhandled message type:', (_exhaustive as IframeToMainMessage).type);
      }
    }
  };
}
