import { createRoot } from 'react-dom/client';
import { useState, useEffect, useCallback, useRef } from 'react';
import '../styles/plugin.css';
import { postToMain, onMainMessage } from './messaging';
import { ChatInput } from './chat/ChatInput';
import { ChatHistory } from './chat/ChatHistory';
import type { ChatMessage } from './chat/ChatHistory';
import type { SelectionContext, UISpec, UIControl, ActionDescriptor } from '../shared/message-types';
import { callClaude } from './api/claude';
import { composePrompt, parseLLMResponse } from './prompt/prompt-composer';
import { UIRenderer } from './renderer/UIRenderer';
import { resolveTemplate, collectControlDefaults } from './template';
import { compileGenerator, executeGenerator } from './codegen';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Walks the UISpec and replaces any tempId references in control action nodeId /
 * parentId fields with real Figma node IDs using the mapping returned by the
 * executor after a batch runs.
 */
function rewriteTempIds(spec: UISpec, map: Record<string, string>): UISpec {
  function rewriteAction(a: ActionDescriptor): ActionDescriptor {
    const nodeId = a.nodeId && map[a.nodeId] ? map[a.nodeId] : a.nodeId;
    const parentId = a.parentId && map[a.parentId] ? map[a.parentId] : a.parentId;
    return { ...a, nodeId, parentId };
  }

  function rewriteControl(c: UIControl): UIControl {
    const action = c.action ? rewriteAction(c.action) : c.action;
    const actions = c.actions?.map(rewriteAction);
    const children = c.children?.map(rewriteControl);
    return { ...c, action, actions, children };
  }

  return { ...spec, controls: spec.controls.map(rewriteControl) };
}

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
  const createdNodeIdsRef = useRef<string[]>([]);

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
        const { errorCount, errors, tempIdMap, createdNodeIds } = msg.payload;
        if (errorCount > 0) {
          addMessage('error', `${errorCount} action(s) failed:\n${errors.join('\n')}`);
        }
        createdNodeIdsRef.current = createdNodeIds;
        // Rewrite tempId references in the current UI spec with real node IDs.
        if (tempIdMap && Object.keys(tempIdMap).length > 0) {
          setCurrentUISpec(prev => prev ? rewriteTempIds(prev, tempIdMap) : prev);
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

  const handleApply = useCallback((values: Record<string, unknown>) => {
    if (!currentUISpec || currentUISpec.mode !== 'apply') return;

    let resolved: ActionDescriptor[];

    if (currentUISpec.generate) {
      try {
        const fn = compileGenerator(currentUISpec.generate);
        resolved = executeGenerator(fn, values);
      } catch (err) {
        addMessage('error', `Generator error: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    } else if (currentUISpec.actionTemplate?.length) {
      resolved = resolveTemplate(currentUISpec.actionTemplate, values);
    } else {
      addMessage('error', 'Apply mode requires either a generate function or an actionTemplate.');
      return;
    }

    const cleanupActions: ActionDescriptor[] = createdNodeIdsRef.current.map((id) => ({
      method: 'deleteNode',
      nodeId: id,
      args: {},
    }));

    postToMain({
      type: 'EXECUTE_ACTIONS',
      payload: { actions: [...cleanupActions, ...resolved] },
    });
  }, [addMessage, currentUISpec]);

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

    // Log raw LLM output to Figma's plugin console for debugging.
    console.log('[llm] raw response:', result.text);

    const parsed = parseLLMResponse(result.text);

    if (!parsed.ok) {
      addMessage('error', parsed.error);
      setIsLoading(false);
      return;
    }

    console.log('[llm] parsed:', JSON.stringify(parsed.data, null, 2));

    const { actions, ui, message, generate } = parsed.data;
    const normalizedUi: UISpec = ui.mode === 'apply'
      ? {
          ...ui,
          mode: 'apply',
          generate: generate ?? ui.generate,
          actionTemplate: ui.actionTemplate ?? (generate ? undefined : (actions as ActionDescriptor[])),
        }
      : ui;

    // Show any explanatory message the LLM included.
    if (message) {
      addMessage('assistant', message);
    } else {
      const genLabel = normalizedUi.generate ? ' + generator' : '';
      addMessage('assistant', `Done — ${actions.length} action(s), ${normalizedUi.controls.length} control(s)${genLabel} generated.`);
    }

    // Dispatch actions to the main thread for execution.
    if (actions.length > 0) {
      postToMain({
        type: 'EXECUTE_ACTIONS',
        payload: { actions: actions as ActionDescriptor[] },
      });
    } else if (normalizedUi.mode === 'apply') {
      // Auto-execute on first load using generator or template with defaults.
      const defaults = collectControlDefaults(normalizedUi.controls);

      if (normalizedUi.generate) {
        try {
          const fn = compileGenerator(normalizedUi.generate);
          const generated = executeGenerator(fn, defaults);
          postToMain({
            type: 'EXECUTE_ACTIONS',
            payload: { actions: generated },
          });
        } catch (err) {
          addMessage('error', `Generator error: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (normalizedUi.actionTemplate?.length) {
        const resolved = resolveTemplate(normalizedUi.actionTemplate, defaults);
        postToMain({
          type: 'EXECUTE_ACTIONS',
          payload: { actions: resolved },
        });
      }
    }

    // Update the rendered UI spec.
    setCurrentUISpec(prev => {
      if (!prev || normalizedUi.replace) return normalizedUi;
      // Merge: replace controls by id, append new ones.
      const existingById = new Map(prev.controls.map(c => [c.id, c]));
      for (const c of normalizedUi.controls) existingById.set(c.id, c);
      return {
        ...prev,
        ...normalizedUi,
        mode: normalizedUi.mode ?? prev.mode,
        generate: normalizedUi.generate ?? prev.generate,
        actionTemplate: normalizedUi.actionTemplate ?? prev.actionTemplate,
        controls: Array.from(existingById.values()),
      };
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
        {!isLoading && hasSpec && <UIRenderer spec={currentUISpec!} onApply={handleApply} />}
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
