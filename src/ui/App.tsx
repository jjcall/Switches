import { createRoot } from 'react-dom/client';
import { useState, useEffect, useCallback, useRef } from 'react';
import '../styles/plugin.css';
import { postToMain, onMainMessage } from './messaging';
import { ChatInput } from './chat/ChatInput';
import { ChatHistory } from './chat/ChatHistory';
import type { ChatMessage } from './chat/ChatHistory';
import type { SelectionContext, UISpec, ActionDescriptor } from '../shared/message-types';
import { callClaude } from './api/claude';
import { composePrompt, parseLLMResponse } from './prompt/prompt-composer';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLUGIN_WIDTH = 300;
const MAX_HEIGHT = 600;

// ─── Shell resize ─────────────────────────────────────────────────────────────

function useShellResize() {
  useEffect(() => {
    parent.postMessage(
      { pluginMessage: { type: 'resize', width: PLUGIN_WIDTH, height: MAX_HEIGHT } },
      '*',
    );
  }, []);
}

// ─── Loading indicator ────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div className="loading-dots" aria-label="Loading">
      <span />
      <span />
      <span />
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ hasSelection }: { hasSelection: boolean }) {
  return (
    <div className="render-zone-empty">
      <svg className="render-zone-empty-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <p className="render-zone-empty-text">
        {hasSelection
          ? 'Describe what you want to build'
          : 'Select something on the canvas, then describe what you want'}
      </p>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  useShellResize();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUISpec, setCurrentUISpec] = useState<UISpec | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null);

  // Keep a ref to the latest messages so the submit callback always sees
  // current history without needing to be in its dependency array.
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  // ── Messaging ──────────────────────────────────────────────────────────────

  useEffect(() => {
    postToMain({ type: 'PLUGIN_READY' });

    return onMainMessage((msg) => {
      if (msg.type === 'SELECTION_CONTEXT') {
        setSelectionContext(msg.payload);
      } else if (msg.type === 'EXECUTION_RESULT') {
        const { errorCount, errors } = msg.payload;
        if (errorCount > 0) {
          addMessage('error', `${errorCount} action(s) failed:\n${errors.join('\n')}`);
        }
      } else if (msg.type === 'ERROR') {
        addMessage('error', msg.payload.message);
      }
    });
  // addMessage is stable (useCallback with no deps), safe to exclude
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const addMessage = useCallback((role: ChatMessage['role'], content: string) => {
    setMessages(prev => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, role, content },
    ]);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (text: string) => {
    addMessage('user', text);
    setIsLoading(true);

    // Snapshot current state at submission time.
    const selCtx = selectionContext;
    const uiSpec = currentUISpec;
    const history = messagesRef.current;

    const { system, messages: apiMessages } = composePrompt(selCtx, uiSpec, history, text);

    const result = await callClaude(apiMessages, system);

    if (!result.ok) {
      addMessage('error', result.error);
      setIsLoading(false);
      return;
    }

    const parsed = parseLLMResponse(result.text);

    if (!parsed.ok) {
      addMessage('error', parsed.error);
      setIsLoading(false);
      return;
    }

    const { actions, ui, message } = parsed.data;

    // Show any explanatory message the LLM included.
    if (message) {
      addMessage('assistant', message);
    } else {
      addMessage('assistant', `Done — ${actions.length} action(s), ${ui.controls.length} control(s) generated.`);
    }

    // Dispatch actions to the main thread for execution.
    if (actions.length > 0) {
      postToMain({
        type: 'EXECUTE_ACTIONS',
        payload: { actions: actions as ActionDescriptor[] },
      });
    }

    // Update the rendered UI spec.
    setCurrentUISpec(prev => {
      if (!prev || ui.replace) return ui;
      // Merge: replace controls by id, append new ones.
      const existingById = new Map(prev.controls.map(c => [c.id, c]));
      for (const c of ui.controls) existingById.set(c.id, c);
      return { ...prev, controls: Array.from(existingById.values()) };
    });

    setIsLoading(false);
  }, [addMessage, selectionContext, currentUISpec]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasSpec = currentUISpec !== null && currentUISpec.controls.length > 0;
  const hasSelection = selectionContext !== null && selectionContext.nodes.length > 0;

  return (
    <div className="shell">
      {/* Render zone */}
      <div className="render-zone">
        {isLoading && <LoadingDots />}
        {!isLoading && !hasSpec && <EmptyState hasSelection={hasSelection} />}
        {/* UIRenderer mounted here in Task 8 */}
      </div>

      {/* Chat area */}
      <div className="chat-area">
        <ChatHistory messages={messages} />
        <ChatInput onSubmit={handleSubmit} disabled={isLoading} />
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
