import type {
  IframeToMainMessage,
  MainToIframeMessage,
} from '../shared/message-types';

/**
 * Sends a typed message from the iframe to the main thread.
 * Wraps the message in the `{ pluginMessage: ... }` envelope Figma expects.
 */
export function postToMain(message: IframeToMainMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

/**
 * Registers a listener for messages arriving from the main thread.
 * Returns a cleanup function that removes the listener.
 *
 * Usage:
 *   const cleanup = onMainMessage((msg) => { ... });
 *   // later:
 *   cleanup();
 */
export function onMainMessage(
  callback: (message: MainToIframeMessage) => void,
): () => void {
  const handler = (event: MessageEvent) => {
    // Figma wraps main-thread messages in event.data.pluginMessage.
    const raw: unknown = event.data?.pluginMessage;
    if (!raw || typeof raw !== 'object') return;
    callback(raw as MainToIframeMessage);
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
