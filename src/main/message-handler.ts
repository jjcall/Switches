/// <reference types="@figma/plugin-typings" />

import type {
  IframeToMainMessage,
  PluginReadyMessage,
  ControlChangeMessage,
  ExecuteActionsMessage,
  ErrorMessage,
  SelectionContextMessage,
  ExecutionResultMessage,
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
  const { controlId, value, action } = msg.payload;
  try {
    applyControlChange(action, value);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[main] control change failed for ${controlId}:`, message);
    figma.ui.postMessage({
      type: 'ERROR',
      payload: { source: 'control-change', message },
    });
  }
}

function handleExecuteActions(msg: ExecuteActionsMessage): void {
  const { actions } = msg.payload;
  const result = executeActions(actions);

  const response: ExecutionResultMessage = {
    type: 'EXECUTION_RESULT',
    payload: result,
  };
  figma.ui.postMessage(response);
}

function handleError(msg: ErrorMessage): void {
  console.error(`[main] error from iframe (${msg.payload.source}):`, msg.payload.message);
}

// ─── Outbound helpers ─────────────────────────────────────────────────────────

/** Serializes the current page selection and sends it to the iframe. */
export function sendSelectionContext(): void {
  const payload = serializeSelection(figma.currentPage.selection);
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
      default: {
        // Narrow to never to catch unhandled message types at compile time.
        const _exhaustive: never = msg;
        console.warn('[main] unhandled message type:', (_exhaustive as IframeToMainMessage).type);
      }
    }
  };
}
