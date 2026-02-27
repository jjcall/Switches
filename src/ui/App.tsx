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
import { compileGenerator, executeGenerator, setImageData, setSelectionId } from './codegen';
import type { ImagePixelData } from './codegen';

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

/**
 * Stamps current control values into the UISpec's defaultValue fields so that
 * persisted specs restore with the user's last-applied settings, not the
 * original defaults.
 */
function specWithCurrentValues(spec: UISpec, values: Record<string, unknown>): UISpec {
  function updateControl(c: UIControl): UIControl {
    const val = values[c.id];
    const updated = val !== undefined
      ? { ...c, props: { ...c.props, defaultValue: val } }
      : c;
    if (updated.children) {
      return { ...updated, children: updated.children.map(updateControl) };
    }
    return updated;
  }
  return { ...spec, controls: spec.controls.map(updateControl) };
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
  const rootFrameIdRef = useRef<string | undefined>(undefined);

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

        // Restore plugin memory: if the selected node has stored plugin spec data,
        // parse and restore the UI controls/generator without an LLM call.
        if (msg.payload.pluginSpec) {
          try {
            const restored = JSON.parse(msg.payload.pluginSpec) as UISpec;
            setCurrentUISpec(restored);
            // The selected node IS the root frame — track it for in-place reuse.
            if (msg.payload.nodes.length > 0) {
              rootFrameIdRef.current = msg.payload.nodes[0].id;
              createdNodeIdsRef.current = [msg.payload.nodes[0].id];
            }
            addMessage('assistant', 'Restored plugin controls from selected frame.');
          } catch {
            console.warn('[app] failed to parse stored pluginSpec');
          }
        } else {
          setCurrentUISpec(null);
          rootFrameIdRef.current = undefined;
          createdNodeIdsRef.current = [];
          setMessages([]);
        }
      } else if (msg.type === 'EXECUTION_RESULT') {
        const { errorCount, errors, tempIdMap, createdNodeIds, rootFrameId } = msg.payload;
        if (errorCount > 0) {
          addMessage('error', `${errorCount} action(s) failed:\n${errors.join('\n')}`);
        }
        createdNodeIdsRef.current = createdNodeIds;
        if (rootFrameId) {
          rootFrameIdRef.current = rootFrameId;
        }
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

  const fetchImageData = useCallback((nodeId: string, maxWidth = 100): Promise<ImagePixelData> => {
    return new Promise((resolve, reject) => {
      const requestId = `img-${Date.now()}-${Math.random()}`;
      const cleanup = onMainMessage((msg) => {
        if (msg.type === 'IMAGE_DATA' && msg.payload.requestId === requestId) {
          cleanup();
          resolve({ width: msg.payload.width, height: msg.payload.height, pixels: msg.payload.pixels });
        } else if (msg.type === 'ERROR' && msg.payload.source === 'request-image-data') {
          cleanup();
          reject(new Error(msg.payload.message));
        }
      });
      postToMain({ type: 'REQUEST_IMAGE_DATA', payload: { requestId, nodeId, maxWidth } });
    });
  }, []);

  const handleApply = useCallback(async (values: Record<string, unknown>) => {
    if (!currentUISpec || currentUISpec.mode !== 'apply') return;

    const stampedSpec = specWithCurrentValues(currentUISpec, values);
    setCurrentUISpec(stampedSpec);
    const specJson = JSON.stringify(stampedSpec);

    let resolved: ActionDescriptor[];

    if (currentUISpec.generate) {
      try {
        setSelectionId(selectionContext?.nodes[0]?.id ?? null);
        if (currentUISpec.imageNodeId) {
          const maxW = currentUISpec.imageMaxWidth ?? 100;
          const imgData = await fetchImageData(currentUISpec.imageNodeId, maxW);
          setImageData(imgData);
        }
        const fn = compileGenerator(currentUISpec.generate);
        resolved = executeGenerator(fn, values);
        setImageData(null);
        setSelectionId(null);
      } catch (err) {
        setImageData(null);
        setSelectionId(null);
        addMessage('error', `Generator error: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    } else if (currentUISpec.actionTemplate?.length) {
      resolved = resolveTemplate(currentUISpec.actionTemplate, values);
    } else {
      addMessage('error', 'Apply mode requires either a generate function or an actionTemplate.');
      return;
    }

    const existingFrameId = rootFrameIdRef.current;

    if (existingFrameId) {
      const rootIdx = resolved.findIndex(
        a => a.method === 'createFrame' && !a.parentId,
      );

      if (rootIdx !== -1) {
        const rootAction = resolved[rootIdx];
        const rootTempId = rootAction.tempId;

        const cleanupActions: ActionDescriptor[] = [{
          method: 'deleteChildren',
          nodeId: existingFrameId,
          args: {},
        }];

        const rewrittenActions = resolved.slice(rootIdx + 1).map((a) => {
          const rewritten = { ...a };
          if (rootTempId) {
            if (rewritten.nodeId === rootTempId) rewritten.nodeId = existingFrameId;
            if (rewritten.parentId === rootTempId) rewritten.parentId = existingFrameId;
          }
          return rewritten;
        });

        postToMain({
          type: 'EXECUTE_ACTIONS',
          payload: {
            actions: [...cleanupActions, ...rewrittenActions],
            pluginSpec: specJson,
          },
        });
        return;
      }
    }

    const cleanupActions: ActionDescriptor[] = createdNodeIdsRef.current.map((id) => ({
      method: 'deleteNode',
      nodeId: id,
      args: {},
    }));

    postToMain({
      type: 'EXECUTE_ACTIONS',
      payload: {
        actions: [...cleanupActions, ...resolved],
        pluginSpec: specJson,
      },
    });
  }, [addMessage, currentUISpec, fetchImageData]);

  const handleDetach = useCallback(() => {
    const nodeId = rootFrameIdRef.current;
    if (nodeId) {
      postToMain({ type: 'CLEAR_PLUGIN_DATA', payload: { nodeId } });
    }
    setCurrentUISpec(null);
    rootFrameIdRef.current = undefined;
    createdNodeIdsRef.current = [];
    setMessages([]);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (text: string) => {
    if (text.trim().toLowerCase() === '/clear') {
      handleDetach();
      return;
    }

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

    // Compute the merged UISpec first so auto-execution uses the full spec.
    const mergedUi: UISpec = (() => {
      const prev = uiSpec;
      if (!prev || normalizedUi.replace) return normalizedUi;
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
    })();

    // Only reset frame tracking when the LLM is building from scratch.
    if (normalizedUi.replace) {
      rootFrameIdRef.current = undefined;
    }

    const specJson = JSON.stringify(mergedUi);
    const existingFrameId = rootFrameIdRef.current;

    // Dispatch actions to the main thread for execution.
    if (actions.length > 0) {
      postToMain({
        type: 'EXECUTE_ACTIONS',
        payload: { actions: actions as ActionDescriptor[], pluginSpec: specJson },
      });
    } else if (mergedUi.mode === 'apply' && mergedUi.generate) {
      const defaults = collectControlDefaults(mergedUi.controls);

      try {
        setSelectionId(selectionContext?.nodes[0]?.id ?? null);
        if (mergedUi.imageNodeId) {
          const maxW = mergedUi.imageMaxWidth ?? 100;
          const imgData = await fetchImageData(mergedUi.imageNodeId, maxW);
          setImageData(imgData);
        }
        const fn = compileGenerator(mergedUi.generate);
        const generated = executeGenerator(fn, defaults);
        setImageData(null);
        setSelectionId(null);

        if (existingFrameId) {
          // Reuse the existing frame: strip createFrame, deleteChildren, rewrite tempIds.
          const rootIdx = generated.findIndex(a => a.method === 'createFrame' && !a.parentId);
          if (rootIdx !== -1) {
            const rootTempId = generated[rootIdx].tempId;
            const cleanupActions: ActionDescriptor[] = [{
              method: 'deleteChildren',
              nodeId: existingFrameId,
              args: {},
            }];
            const rewrittenActions = generated.slice(rootIdx + 1).map((a) => {
              const rewritten = { ...a };
              if (rootTempId) {
                if (rewritten.nodeId === rootTempId) rewritten.nodeId = existingFrameId;
                if (rewritten.parentId === rootTempId) rewritten.parentId = existingFrameId;
              }
              return rewritten;
            });
            postToMain({
              type: 'EXECUTE_ACTIONS',
              payload: { actions: [...cleanupActions, ...rewrittenActions], pluginSpec: specJson },
            });
          } else {
            postToMain({
              type: 'EXECUTE_ACTIONS',
              payload: { actions: generated, pluginSpec: specJson },
            });
          }
        } else {
          postToMain({
            type: 'EXECUTE_ACTIONS',
            payload: { actions: generated, pluginSpec: specJson },
          });
        }
      } catch (err) {
        setImageData(null);
        setSelectionId(null);
        addMessage('error', `Generator error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (mergedUi.mode === 'apply' && mergedUi.actionTemplate?.length) {
      const defaults = collectControlDefaults(mergedUi.controls);
      const resolved = resolveTemplate(mergedUi.actionTemplate, defaults);
      postToMain({
        type: 'EXECUTE_ACTIONS',
        payload: { actions: resolved, pluginSpec: specJson },
      });
    }

    // Update the rendered UI spec with the merged result.
    setCurrentUISpec(mergedUi);

    setIsLoading(false);
  }, [addMessage, selectionContext, currentUISpec, fetchImageData, handleDetach]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleValueChange = useCallback((controlId: string, value: unknown) => {
    setCurrentUISpec(prev => {
      if (!prev) return prev;
      const updated = specWithCurrentValues(prev, { [controlId]: value });
      // Debounce re-persistence to avoid spamming on every slider tick.
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        const targetId = rootFrameIdRef.current;
        if (targetId) {
          postToMain({
            type: 'EXECUTE_ACTIONS',
            payload: { actions: [], pluginSpec: JSON.stringify(updated) },
          });
        }
      }, 500);
      return updated;
    });
  }, []);

  const hasSpec = currentUISpec !== null && currentUISpec.controls.length > 0;
  const hasSelection = selectionContext !== null && selectionContext.nodes.length > 0;

  return (
    <div className="shell">
      {/* Controls zone */}
      <div className="render-zone">
        {!hasSpec && !isLoading && <EmptyState hasSelection={hasSelection} />}
        {hasSpec && <UIRenderer spec={currentUISpec!} onApply={handleApply} onValueChange={handleValueChange} />}
      </div>

      {/* Chat area */}
      <div className="chat-area">
        <ChatHistory messages={messages} />
        <ChatInput onSubmit={handleSubmit} disabled={isLoading} isLoading={isLoading} />
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
