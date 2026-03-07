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
  RequestImageDataMessage,
  ImageDataMessage,
  ClearPluginDataMessage,
  PersistMessagesMessage,
  SetClientStorageMessage,
  DeleteClientStorageMessage,
  ClientStorageValueMessage,
} from '../shared/message-types';
import { serializeSelection } from './selection-serializer';
import { executeActions, applyControlChange } from './action-executor';
import UPNG from 'upng-js';

// Resize is sent by useAutoResize in the iframe and is not a typed protocol
// message, so we handle it separately before the typed router.
interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handlePluginReady(_msg: PluginReadyMessage): Promise<void> {
  console.log('[main] iframe ready — sending selection context');
  sendSelectionContext();

  try {
    const apiKey = await figma.clientStorage.getAsync('apiKey') as string | undefined;
    const msg: ClientStorageValueMessage = {
      type: 'CLIENT_STORAGE_VALUE',
      payload: { key: 'apiKey', value: apiKey ?? null },
    };
    figma.ui.postMessage(msg);
  } catch {
    // clientStorage unavailable — iframe will prompt for key.
  }
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
  const { actions, pluginSpec, persistNodeId, selectNodeId, skipCenter } = msg.payload;
  executeActions(actions, pluginSpec, persistNodeId, selectNodeId, skipCenter).then((result) => {
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

async function handleRequestImageData(msg: RequestImageDataMessage): Promise<void> {
  const { requestId, nodeId, maxWidth } = msg.payload;
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
      throw new Error(`Node not found or not exportable: ${nodeId}`);
    }

    const sceneNode = node as SceneNode;
    const pngBytes = await (sceneNode as ExportMixin).exportAsync({
      format: 'PNG',
      constraint: { type: 'WIDTH', value: Math.min(maxWidth, 800) },
    });

    const decoded = UPNG.decode(pngBytes.buffer);
    const rgba = new Uint8Array(UPNG.toRGBA8(decoded)[0]);
    const pixels = Array.from(rgba);

    const response: ImageDataMessage = {
      type: 'IMAGE_DATA',
      payload: { requestId, width: decoded.width, height: decoded.height, pixels },
    };
    figma.ui.postMessage(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[main] handleRequestImageData failed:', message);
    figma.ui.postMessage({
      type: 'ERROR',
      payload: { source: `request-image-data:${requestId}`, message },
    });
  }
}

async function handleSetClientStorage(msg: SetClientStorageMessage): Promise<void> {
  try {
    await figma.clientStorage.setAsync(msg.payload.key, msg.payload.value);
  } catch (err) {
    console.warn('[main] handleSetClientStorage failed:', err);
  }
}

async function handleDeleteClientStorage(msg: DeleteClientStorageMessage): Promise<void> {
  try {
    await figma.clientStorage.deleteAsync(msg.payload.key);
  } catch (err) {
    console.warn('[main] handleDeleteClientStorage failed:', err);
  }
}

async function handleClearPluginData(msg: ClearPluginDataMessage): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(msg.payload.nodeId);
    if (node && 'setPluginData' in node) {
      (node as SceneNode).setPluginData('pluginSpec', '');
      (node as SceneNode).setPluginData('pluginMessages', '');
    }
  } catch (err) {
    console.warn('[main] handleClearPluginData failed:', err);
  }
}

async function handlePersistMessages(msg: PersistMessagesMessage): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(msg.payload.nodeId);
    if (node && 'setPluginData' in node) {
      (node as SceneNode).setPluginData('pluginMessages', msg.payload.messages);
    }
  } catch (err) {
    console.warn('[main] handlePersistMessages failed:', err);
  }
}

// ─── Outbound helpers ─────────────────────────────────────────────────────────

/** Serializes the current page selection and sends it to the iframe. */
export function sendSelectionContext(): void {
  const payload = serializeSelection(figma.currentPage.selection);

  // Check if any selected node carries stored plugin data.
  const selection = figma.currentPage.selection;
  for (const node of selection) {
    try {
      const spec = node.getPluginData('pluginSpec');
      if (spec) payload.pluginSpec = spec;
      const msgs = node.getPluginData('pluginMessages');
      if (msgs) payload.pluginMessages = msgs;
      if (spec || msgs) break;
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
        void handlePluginReady(msg);
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
      case 'REQUEST_IMAGE_DATA':
        void handleRequestImageData(msg);
        break;
      case 'CLEAR_PLUGIN_DATA':
        void handleClearPluginData(msg);
        break;
      case 'PERSIST_MESSAGES':
        void handlePersistMessages(msg);
        break;
      case 'SET_CLIENT_STORAGE':
        void handleSetClientStorage(msg);
        break;
      case 'DELETE_CLIENT_STORAGE':
        void handleDeleteClientStorage(msg);
        break;
      case 'CLOSE_PLUGIN':
        figma.closePlugin();
        break;
      default: {
        // Narrow to never to catch unhandled message types at compile time.
        const _exhaustive: never = msg;
        console.warn('[main] unhandled message type:', (_exhaustive as IframeToMainMessage).type);
      }
    }
  };
}
