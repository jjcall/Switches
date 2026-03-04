import { createRoot } from 'react-dom/client';
import { useState, useEffect, useCallback, useRef } from 'react';
import '../styles/plugin.css';
import { postToMain, onMainMessage } from './messaging';
import { ChatInput } from './chat/ChatInput';
import { ChatHistory } from './chat/ChatHistory';
import type { ChatMessage } from './chat/ChatHistory';
import type { SelectionContext, UISpec, UIControl, ActionDescriptor } from '../shared/message-types';
import { callClaude, getStoredApiKey, setStoredApiKey, clearStoredApiKey } from './api/claude';
import { composePrompt, parseLLMResponse } from './prompt/prompt-composer';
import { UIRenderer } from './renderer/UIRenderer';
import { resolveTemplate, collectControlDefaults } from './template';
import { compileGenerator, executeGenerator, setImageData, setSelectionId } from './codegen';
import type { ImagePixelData } from './codegen';
import { GridLoader } from './components/GridLoader';
import { getRandomVerb } from './components/LoadingVerbs';
import { motion, AnimatePresence } from 'motion/react';

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

/** Real Figma node IDs look like "123:456". Anything else is a stale tempId. */
const FIGMA_ID_RE = /^\d+:\d+$/;

/**
 * Replaces any stale tempId-style nodeId/parentId references in control actions
 * with the real node ID. Called on restore so specs persisted before the
 * re-persist fix still work.
 */
function fixStaleTempIds(spec: UISpec, realNodeId: string): UISpec {
  let changed = false;

  function fixAction(a: ActionDescriptor): ActionDescriptor {
    let nodeId = a.nodeId;
    let parentId = a.parentId;
    if (nodeId && !FIGMA_ID_RE.test(nodeId)) {
      nodeId = realNodeId;
      changed = true;
    }
    if (parentId && !FIGMA_ID_RE.test(parentId)) {
      parentId = realNodeId;
      changed = true;
    }
    return { ...a, nodeId, parentId };
  }

  function fixControl(c: UIControl): UIControl {
    const action = c.action ? fixAction(c.action) : c.action;
    const actions = c.actions?.map(fixAction);
    const children = c.children?.map(fixControl);
    return { ...c, action, actions, children };
  }

  const fixed = { ...spec, controls: spec.controls.map(fixControl) };
  return changed ? fixed : spec;
}

/**
 * Flattens multi-stop color values into top-level params so the generator can
 * read them directly (e.g. params.warm instead of params.gradient.warm).
 * The original nested value is preserved alongside the flattened keys.
 */
function flattenColorStops(values: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...values };
  for (const [, val] of Object.entries(values)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const rec = val as Record<string, unknown>;
      const allStrings = Object.values(rec).every(
        v => typeof v === 'string' && v.startsWith('#'),
      );
      if (allStrings && Object.keys(rec).length > 0) {
        for (const [stopId, stopVal] of Object.entries(rec)) {
          if (!(stopId in flat)) flat[stopId] = stopVal;
        }
      }
    }
  }
  return flat;
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

const PLUGIN_WIDTH = 260;
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

function BadgeStack({ count, label }: { count: number; label: string }) {
  if (count <= 1) {
    return <span className="render-zone-layer-badge">{label}</span>;
  }

  const depth = Math.min(count, 3);

  return (
    <div className="badge-stack">
      <span className="render-zone-layer-badge badge-top">{label}</span>
      {depth >= 2 && (
        <span className="render-zone-layer-badge badge-shadow badge-shadow-2" />
      )}
      {depth >= 3 && (
        <span className="render-zone-layer-badge badge-shadow badge-shadow-3" />
      )}
    </div>
  );
}

function EmptyState({ selectionName, selectionCount, loaderState, loadingVerb }: {
  selectionName: string | null;
  selectionCount: number;
  loaderState: 'idle' | 'loading' | 'success';
  loadingVerb: string | null;
}) {
  const isLoading = loaderState === 'loading';
  const hasSelection = selectionCount > 0;
  const badgeLabel = selectionCount > 1
    ? `${selectionCount} items selected`
    : selectionName;

  const stateKey = isLoading ? 'loading' : hasSelection ? 'selected' : 'empty';

  return (
    <div className="render-zone-empty">
      <GridLoader state={loaderState} size={24} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={stateKey}
          className="render-zone-empty-info"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {isLoading ? (
            <p className="render-zone-loading-text">{loadingVerb}...</p>
          ) : (
            <>
              {badgeLabel && (
                <BadgeStack count={selectionCount} label={badgeLabel} />
              )}
              <p className="render-zone-empty-text">
                {hasSelection ? (
                  <>
                    What do you want to create?
                    <br />
                    Type <span className="render-zone-hint-cmd">/gen</span> if you want auto controls
                  </>
                ) : (
                  'Select something on the canvas, then describe what you want'
                )}
              </p>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  useShellResize();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUISpec, setCurrentUISpec] = useState<UISpec | null>(null);
  const [animateEntrance, setAnimateEntrance] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loaderState, setLoaderState] = useState<'idle' | 'loading' | 'success'>('idle');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [loadingVerb, setLoadingVerb] = useState<string | null>(null);
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null);
  const [mockSelectionName, setMockSelectionName] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const createdNodeIdsRef = useRef<string[]>([]);
  const rootFrameIdRef = useRef<string | undefined>(undefined);
  const suppressSelectionResetRef = useRef(false);

  // Keep refs to the latest values so callbacks always see the current state
  // without needing to be in their dependency arrays.
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const currentUISpecRef = useRef<UISpec | null>(currentUISpec);
  currentUISpecRef.current = currentUISpec;
  const selectionContextRef = useRef<SelectionContext | null>(selectionContext);
  selectionContextRef.current = selectionContext;

  // ── Messaging ──────────────────────────────────────────────────────────────

  useEffect(() => {
    postToMain({ type: 'PLUGIN_READY' });

    return onMainMessage((msg) => {
      if (msg.type === 'SELECTION_CONTEXT') {
        setSelectionContext(msg.payload);

        // During wrapping, suppress auto-reset so we don't wipe UI mid-flow.
        if (suppressSelectionResetRef.current) return;

        // Restore plugin memory: if the selected node has stored plugin spec data,
        // parse and restore the UI controls/generator without an LLM call.
        if (msg.payload.pluginSpec) {
          try {
            let restored = JSON.parse(msg.payload.pluginSpec) as UISpec;
            // The selected node IS the root — track it for in-place reuse.
            const nodeId = msg.payload.nodes[0]?.id;
            if (nodeId) {
              restored = fixStaleTempIds(restored, nodeId);
              rootFrameIdRef.current = nodeId;
              createdNodeIdsRef.current = [nodeId];
            }
            setAnimateEntrance(false);
            setCurrentUISpec(restored);
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
        } else if (!rootFrameIdRef.current && createdNodeIds.length > 0) {
          rootFrameIdRef.current = createdNodeIds[0];
        }
        // Rewrite tempId references in the current UI spec with real node IDs,
        // then re-persist so restored specs use real IDs instead of tempIds.
        if (tempIdMap && Object.keys(tempIdMap).length > 0) {
          setCurrentUISpec(prev => {
            if (!prev) return prev;
            const rewritten = rewriteTempIds(prev, tempIdMap);
            const targetId = rootFrameId ?? rootFrameIdRef.current;
            if (targetId) {
              postToMain({
                type: 'EXECUTE_ACTIONS',
                payload: { actions: [], pluginSpec: JSON.stringify(rewritten), persistNodeId: targetId },
              });
            }
            return rewritten;
          });
        }
      } else if (msg.type === 'CLIENT_STORAGE_VALUE') {
        if (msg.payload.key === 'apiKey' && msg.payload.value) {
          setStoredApiKey(msg.payload.value);
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
        } else if (msg.type === 'ERROR' && msg.payload.source === `request-image-data:${requestId}`) {
          cleanup();
          reject(new Error(msg.payload.message));
        }
      });
      postToMain({ type: 'REQUEST_IMAGE_DATA', payload: { requestId, nodeId, maxWidth } });
    });
  }, []);

  const executeAndWait = useCallback((payload: {
    actions: ActionDescriptor[];
    pluginSpec?: string;
    persistNodeId?: string;
    selectNodeId?: string;
    skipCenter?: boolean;
  }): Promise<{ tempIdMap?: Record<string, string>; rootFrameId?: string; createdNodeIds: string[] }> => {
    return new Promise((resolve, reject) => {
      const cleanup = onMainMessage((msg) => {
        if (msg.type === 'EXECUTION_RESULT') {
          cleanup();
          if (msg.payload.errorCount > 0) {
            reject(new Error(msg.payload.errors.join('\n')));
          } else {
            resolve(msg.payload);
          }
        } else if (msg.type === 'ERROR') {
          cleanup();
          reject(new Error(msg.payload.message));
        }
      });
      postToMain({ type: 'EXECUTE_ACTIONS', payload });
    });
  }, []);

  const awaitSelectionContext = useCallback((): Promise<SelectionContext> => {
    return new Promise((resolve) => {
      const cleanup = onMainMessage((msg) => {
        if (msg.type === 'SELECTION_CONTEXT') {
          cleanup();
          resolve(msg.payload);
        }
      });
    });
  }, []);

  const handleApply = useCallback(async (values: Record<string, unknown>) => {
    const spec = currentUISpecRef.current;
    if (!spec) return;
    if (!spec.generate && !spec.actionTemplate?.length) return;

    const stampedSpec = specWithCurrentValues(spec, values);
    setCurrentUISpec(stampedSpec);
    const specJson = JSON.stringify(stampedSpec);

    let resolved: ActionDescriptor[];

    if (spec.generate) {
      try {
        const genParams = flattenColorStops(values);
        setSelectionId(selectionContextRef.current?.nodes[0]?.id ?? null);
        if (spec.imageNodeId) {
          const maxW = spec.imageMaxWidth ?? 100;
          const imgData = await fetchImageData(spec.imageNodeId, maxW);
          setImageData(imgData);
        }
        const fn = compileGenerator(spec.generate);
        resolved = executeGenerator(fn, genParams);
        setImageData(null);
        setSelectionId(null);
      } catch (err) {
        setImageData(null);
        setSelectionId(null);
        addMessage('error', `Generator error: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    } else if (spec.actionTemplate?.length) {
      resolved = resolveTemplate(spec.actionTemplate, values);
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

        const rootFramePropertyMethods = new Set([
          'setFill', 'setStroke', 'setProperty', 'setEffect', 'setCornerRadius',
        ]);
        const rewrittenActions = resolved.slice(rootIdx + 1)
          .filter((a) => {
            if (rootTempId && a.nodeId === rootTempId && rootFramePropertyMethods.has(a.method)) {
              return false;
            }
            return true;
          })
          .map((a) => {
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
  // Uses refs (currentUISpecRef, selectionContextRef) for stable callback identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMessage, fetchImageData]);

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



  const handleFocusChange = useCallback((focused: boolean) => {
    setIsInputFocused(focused);
  }, []);

  const finishLoading = useCallback((success: boolean) => {
    setIsLoading(false);
    setLoadingVerb(null);
    if (success) {
      setLoaderState('success');
      setTimeout(() => {
        setLoaderState(prev => prev === 'success' ? 'idle' : prev);
      }, 2000);
    } else {
      setLoaderState('idle');
    }
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (text: string) => {
    const cmd = text.trim().toLowerCase();

    if (cmd === '/clear') {
      handleDetach();
      setMockSelectionName(null);
      return;
    }

    if (cmd.startsWith('/remove ')) {
      const controlId = cmd.slice(8).trim();
      setCurrentUISpec(prev => {
        if (!prev) return prev;
        const match = prev.controls.find(c => c.id === controlId);
        if (!match) {
          addMessage('error', `No control with id "${controlId}". Current controls: ${prev.controls.map(c => c.id).join(', ')}`);
          return prev;
        }
        const updated = {
          ...prev,
          controls: prev.controls.filter(c => c.id !== controlId),
        };
        const targetId = rootFrameIdRef.current;
        if (targetId) {
          postToMain({
            type: 'EXECUTE_ACTIONS',
            payload: { actions: [], pluginSpec: JSON.stringify(updated), persistNodeId: targetId },
          });
        }
        addMessage('assistant', `Removed control "${match.label || controlId}".`);
        return updated;
      });
      return;
    }

    // ── API key management ──────────────────────────────────────────────────
    if (cmd === '/key' || cmd === '/key status') {
      const hasKey = !!getStoredApiKey();
      addMessage('assistant', hasKey ? 'API key is set.' : 'No API key configured. Type /key YOUR_KEY to set one.');
      return;
    }
    if (cmd === '/key clear') {
      clearStoredApiKey();
      postToMain({ type: 'DELETE_CLIENT_STORAGE', payload: { key: 'apiKey' } });
      addMessage('assistant', 'API key cleared.');
      return;
    }
    if (text.trim().startsWith('/key ') && !cmd.startsWith('/key status') && !cmd.startsWith('/key clear')) {
      const key = text.trim().slice(5).trim();
      if (!key.startsWith('sk-')) {
        addMessage('error', 'Invalid key format — Anthropic keys start with "sk-".');
        return;
      }
      setStoredApiKey(key);
      postToMain({ type: 'SET_CLIENT_STORAGE', payload: { key: 'apiKey', value: key } });
      addMessage('assistant', 'API key saved.');
      return;
    }

    // ── Debug commands ──────────────────────────────────────────────────────
    if (cmd.startsWith('/state ')) {
      const state = cmd.slice(7).trim();
      // Clear any running demo timers
      demoTimersRef.current.forEach(clearTimeout);
      demoTimersRef.current = [];

      switch (state) {
        case 'idle':
          setCurrentUISpec(null);
          setMockSelectionName(null);
          setIsLoading(false);
          setLoadingVerb(null);
          setLoaderState('idle');
          addMessage('assistant', 'State → idle');
          break;
        case 'loading':
          setCurrentUISpec(null);
          setMockSelectionName('Button Primary');
          setLoaderState('loading');
          setLoadingVerb(getRandomVerb());
          addMessage('assistant', 'State → loading');
          break;
        case 'success':
          setCurrentUISpec(null);
          setIsLoading(false);
          setLoadingVerb(null);
          finishLoading(true);
          addMessage('assistant', 'State → success');
          break;
        default:
          addMessage('error', `Unknown state "${state}". Use: idle, loading, success`);
      }
      return;
    }

    if (cmd === '/loader') {
      demoTimersRef.current.forEach(clearTimeout);
      demoTimersRef.current = [];
      addMessage('assistant', 'Demo: idle → loading → success → idle');

      // idle
      setMockSelectionName(null);
      setIsLoading(false);
      setLoadingVerb(null);
      setLoaderState('idle');

      // → loading after 1s
      demoTimersRef.current.push(setTimeout(() => {
        setMockSelectionName('Button Primary');
        setLoaderState('loading');
        setLoadingVerb(getRandomVerb());
      }, 1000));

      // → success after 3s
      demoTimersRef.current.push(setTimeout(() => {
        setLoadingVerb(null);
        setLoaderState('success');
      }, 3000));

      // → back to idle after 5s (2s success animation)
      demoTimersRef.current.push(setTimeout(() => {
        setLoaderState('idle');
      }, 5000));

      return;
    }

    if (cmd === '/demo' || cmd.startsWith('/demo ')) {
      const sub = cmd.slice(5).trim();
      demoTimersRef.current.forEach(clearTimeout);
      demoTimersRef.current = [];

      const demoSpecs: Record<string, { label: string; spec: UISpec }> = {
        '': {
          label: 'All Controls',
          spec: {
            mode: 'live',
            controls: [
              { id: 'dial-a', type: 'dial', label: 'Rotation X', props: { min: -180, max: 180, step: 1, defaultValue: 0 } },
              { id: 'slider', type: 'slider', label: 'Opacity', props: { min: 0, max: 100, step: 1, defaultValue: 73 } },
              { id: 'toggle', type: 'toggle', label: 'Visible', props: { defaultValue: true } },
              { id: 'select', type: 'select', label: 'Blend Mode', props: { options: ['Off', 'Multiply', 'Screen', 'Overlay'], defaultValue: 'Off' } },
            ],
          },
        },
        'full': {
          label: 'All Controls',
          spec: {
            mode: 'live',
            controls: [
              { id: 'dial-a', type: 'dial', label: 'Rotation X', props: { min: -180, max: 180, step: 1, defaultValue: 0 } },
              { id: 'dial-b', type: 'dial', label: 'Rotation Y', props: { min: -180, max: 180, step: 1, defaultValue: 34 } },
              { id: 'slider', type: 'slider', label: 'Opacity', props: { min: 0, max: 100, step: 1, defaultValue: 73 } },
              { id: 'select', type: 'select', label: 'Blend Mode', props: { options: ['Off', 'Multiply', 'Screen', 'Overlay'], defaultValue: 'Off' } },
              { id: 'toggle', type: 'toggle', label: 'Visible', props: { defaultValue: true } },
              { id: 'segmented', type: 'segmented', label: 'Alignment', props: { options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], defaultValue: 'center' } },
              { id: 'color', type: 'color', label: 'Fill Color', props: { defaultValue: '#3B82F6' } },
            ],
          },
        },
      };

      const entry = demoSpecs[sub] ?? demoSpecs[''];
      addMessage('assistant', `Demo: loading → success → ${entry.label}`);

      // Start in loading
      setCurrentUISpec(null);
      setMockSelectionName('Button Primary');
      setLoaderState('loading');
      setLoadingVerb(getRandomVerb());

      // → success after 2s
      demoTimersRef.current.push(setTimeout(() => {
        setLoadingVerb(null);
        setLoaderState('success');
      }, 2000));

      // → show UI after success animation completes (2s + 2s)
      demoTimersRef.current.push(setTimeout(() => {
        setIsLoading(false);
        setLoaderState('idle');
        setAnimateEntrance(true);
        setCurrentUISpec(entry.spec);
      }, 4000));

      return;
    }

    if (cmd === '/ui' || cmd.startsWith('/ui ')) {
      const sub = cmd.slice(3).trim();

      const mockControls: Record<string, { label: string; spec: UISpec }> = {
        '': {
          label: 'All Controls',
          spec: {
            mode: 'live',
            controls: [
              { id: 'dial-a', type: 'dial', label: 'Rotation X', props: { min: -180, max: 180, step: 1, defaultValue: 0 } },
              { id: 'dial-b', type: 'dial', label: 'Rotation Y', props: { min: -180, max: 180, step: 1, defaultValue: 34 } },
              { id: 'dial-full', type: 'dial', label: 'Angle', props: { min: -180, max: 180, step: 1, defaultValue: 0 } },
              { id: 'slider', type: 'slider', label: 'Opacity', props: { min: 0, max: 100, step: 1, defaultValue: 73 } },
              { id: 'select', type: 'select', label: 'Blend Mode', props: { options: ['Off', 'Multiply', 'Screen', 'Overlay'], defaultValue: 'Off' } },
              { id: 'toggle', type: 'toggle', label: 'Visible', props: { defaultValue: true } },
              { id: 'segmented', type: 'segmented', label: 'Alignment', props: { options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], defaultValue: 'center' } },
              { id: 'number', type: 'number', label: 'Border Radius', props: { min: 0, max: 100, step: 1, defaultValue: 8 } },
              { id: 'color', type: 'color', label: 'Fill Color', props: { defaultValue: '#3B82F6' } },
              { id: 'text', type: 'text', label: 'Layer Name', props: { placeholder: 'Enter a name…', defaultValue: '' } },
              { id: 'button', type: 'button', label: 'Randomize' },
              { id: 'xy-pad', type: 'xy-pad', label: 'Shadow Offset', props: { minX: -50, maxX: 50, minY: -50, maxY: 50, stepX: 1, stepY: 1, defaultValue: { x: -20, y: 15 } } },
              { id: 'range', type: 'range', label: 'Size Range', props: { min: 4, max: 48, step: 1, defaultValue: { low: 8, high: 24 } } },
              { id: 'gradient', type: 'gradient-bar', label: 'Gradient', props: { stops: [{ id: 's0', position: 0, color: '#af2626' }, { id: 's1', position: 1, color: '#878787' }] } },
              { id: 'curve', type: 'curve', label: 'Falloff Curve', props: { defaultValue: [0.42, 0, 0.58, 1] } },
            ],
          },
        },
        'dials': {
          label: 'Dials',
          spec: {
            mode: 'live',
            controls: [
              { id: 'dial-a', type: 'dial', label: 'Rotation X', props: { min: -180, max: 180, step: 1, defaultValue: -45 } },
              { id: 'dial-b', type: 'dial', label: 'Rotation Y', props: { min: -180, max: 180, step: 1, defaultValue: 34 } },
              { id: 'dial-c', type: 'dial', label: 'Skew', props: { min: -90, max: 90, step: 1, defaultValue: 0 } },
            ],
          },
        },
        'slider': {
          label: 'Sliders',
          spec: {
            mode: 'live',
            controls: [
              { id: 'sl-opacity', type: 'slider', label: 'Opacity', props: { min: 0, max: 100, step: 1, defaultValue: 73 } },
              { id: 'sl-blur', type: 'slider', label: 'Blur', props: { min: 0, max: 50, step: 0.5, defaultValue: 4 } },
              { id: 'sl-spread', type: 'slider', label: 'Spread', props: { min: -20, max: 20, step: 1, defaultValue: 0 } },
            ],
          },
        },
        '3d': {
          label: '3D Cube',
          spec: {
            mode: 'apply',
            generate: 'const rx = params.rx ?? 0; const ry = params.ry ?? 0; const rz = params.rz ?? 0; return [];',
            controls: [
              { id: 'rx', type: 'dial', label: 'Rotate X', props: { min: -180, max: 180, step: 1, defaultValue: 25 } },
              { id: 'ry', type: 'dial', label: 'Rotate Y', props: { min: -180, max: 180, step: 1, defaultValue: -35 } },
              { id: 'rz', type: 'dial', label: 'Rotate Z', props: { min: -180, max: 180, step: 1, defaultValue: 0 } },
              { id: 'scale', type: 'slider', label: 'Scale', props: { min: 0.1, max: 3, step: 0.1, defaultValue: 1 } },
            ],
          },
        },
        'toggle': {
          label: 'Toggle',
          spec: {
            mode: 'live',
            controls: [
              { id: 'tg-visible', type: 'toggle', label: 'Visible', props: { defaultValue: true } },
              { id: 'tg-clip', type: 'toggle', label: 'Clip Content', props: { defaultValue: false } },
              { id: 'tg-lock', type: 'toggle', label: 'Lock Aspect', props: { defaultValue: true } },
            ],
          },
        },
        'select': {
          label: 'Select',
          spec: {
            mode: 'live',
            controls: [
              { id: 'sel-blend', type: 'select', label: 'Blend Mode', props: { options: ['Normal', 'Multiply', 'Screen', 'Overlay', 'Darken', 'Lighten'], defaultValue: 'Normal' } },
              { id: 'sel-font', type: 'select', label: 'Font Weight', props: { options: ['Light', 'Regular', 'Medium', 'Bold', 'Black'], defaultValue: 'Regular' } },
            ],
          },
        },
        'segmented': {
          label: 'Segmented',
          spec: {
            mode: 'live',
            controls: [
              { id: 'seg-align', type: 'segmented', label: 'Alignment', props: { options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], defaultValue: 'center' } },
              { id: 'seg-size', type: 'segmented', label: 'Size', props: { options: [{ value: 'sm', label: 'S' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'L' }, { value: 'xl', label: 'XL' }], defaultValue: 'md' } },
            ],
          },
        },
        'number': {
          label: 'Number',
          spec: {
            mode: 'live',
            controls: [
              { id: 'num-radius', type: 'number', label: 'Border Radius', props: { min: 0, max: 100, step: 1, defaultValue: 8 } },
              { id: 'num-spacing', type: 'number', label: 'Spacing', props: { min: 0, max: 64, step: 1, defaultValue: 16 } },
            ],
          },
        },
        'color': {
          label: 'Color',
          spec: {
            mode: 'live',
            controls: [
              { id: 'col-fill', type: 'color', label: 'Fill Color', props: { defaultValue: '#3B82F6' } },
              { id: 'col-multi', type: 'color', label: 'Gradient', props: { colors: [{ id: 'start', label: 'Start', defaultValue: '#3B82F6' }, { id: 'end', label: 'End', defaultValue: '#8B5CF6' }] } },
            ],
          },
        },
        'text': {
          label: 'Text',
          spec: {
            mode: 'live',
            controls: [
              { id: 'txt-name', type: 'text', label: 'Layer Name', props: { placeholder: 'Enter a name…', defaultValue: '' } },
              { id: 'txt-desc', type: 'text', label: 'Description', props: { placeholder: 'Add a description…', defaultValue: 'A sample description' } },
            ],
          },
        },
        'button': {
          label: 'Button',
          spec: {
            mode: 'live',
            controls: [
              { id: 'btn-random', type: 'button', label: 'Randomize' },
              { id: 'btn-reset', type: 'button', label: 'Reset' },
            ],
          },
        },
        'xy': {
          label: 'XY Pad',
          spec: {
            mode: 'live',
            controls: [
              { id: 'xy-shadow', type: 'xy-pad', label: 'Shadow Offset', props: { minX: -50, maxX: 50, minY: -50, maxY: 50, stepX: 1, stepY: 1, defaultValue: { x: -20, y: 15 } } },
              { id: 'xy-origin', type: 'xy-pad', label: 'Transform Origin', props: { minX: 0, maxX: 100, minY: 0, maxY: 100, stepX: 1, stepY: 1, defaultValue: { x: 50, y: 50 } } },
            ],
          },
        },
        'range': {
          label: 'Range Slider',
          spec: {
            mode: 'live',
            controls: [
              { id: 'rng-size', type: 'range', label: 'Size Range', props: { min: 4, max: 48, step: 1, defaultValue: { low: 8, high: 24 } } },
              { id: 'rng-opacity', type: 'range', label: 'Opacity Range', props: { min: 0, max: 1, step: 0.01, defaultValue: { low: 0.3, high: 0.9 } } },
            ],
          },
        },
        'gradient': {
          label: 'Gradient Bar',
          spec: {
            mode: 'live',
            controls: [
              { id: 'grad-sunset', type: 'gradient-bar', label: 'Sunset Gradient', props: { stops: [{ id: 's0', position: 0, color: '#FF6B35' }, { id: 's1', position: 0.5, color: '#F7C948' }, { id: 's2', position: 1, color: '#9B5DE5' }] } },
              { id: 'grad-simple', type: 'gradient-bar', label: 'Simple Gradient', props: { stops: [{ id: 's0', position: 0, color: '#af2626' }, { id: 's1', position: 1, color: '#878787' }] } },
            ],
          },
        },
        'curve': {
          label: 'Curve Editor',
          spec: {
            mode: 'live',
            controls: [
              { id: 'crv-falloff', type: 'curve', label: 'Size Falloff', props: { defaultValue: [0.42, 0, 0.58, 1] } },
              { id: 'crv-ease', type: 'curve', label: 'Distribution', props: { defaultValue: [0.25, 0.1, 0.25, 1.0] } },
            ],
          },
        },
      };

      const entry = mockControls[sub];
      if (!entry) {
        const keys = Object.keys(mockControls).filter(k => k !== '').join(', ');
        addMessage('error', `Unknown: /ui ${sub}. Options: ${keys}`);
        return;
      }

      setAnimateEntrance(true);
      setCurrentUISpec(entry.spec);
      setMockSelectionName(entry.label);
      setLoaderState('idle');
      addMessage('assistant', `Loaded ${entry.label}`);
      return;
    }

    if (cmd === '/history clear') {
      setMessages([]);
      return;
    }

    if (cmd === '/history') {
      setMessages([]);
      const samples: { role: ChatMessage['role']; content: string }[] = [
        { role: 'user', content: 'Make the button corners more rounded and change the label to "Get Started"' },
        { role: 'assistant', content: 'Updated corner radius to 12px and changed label to "Get Started"' },
        { role: 'user', content: 'Now change the background to a gradient from blue to purple' },
        { role: 'assistant', content: 'Applied linear gradient from #3B82F6 to #8B5CF6 on the button fill' },
        { role: 'error', content: 'Could not apply effect: selected layer is locked or hidden' },
        { role: 'user', content: 'Swap the icon to a chevron-right and reduce padding to 8px on all sides' },
      ];
      samples.forEach((s, i) => {
        setTimeout(() => addMessage(s.role, s.content), i * 400);
      });
      return;
    }
    // ── End debug commands ───────────────────────────────────────────────────

    // ── Auto-generate controls from selection ────────────────────────────────
    const isAutoGenerate = cmd === '/gen' || cmd === '/generate' || cmd === '/auto';

    if (isAutoGenerate) {
      if (!selectionContext || selectionContext.nodes.length === 0) {
        addMessage('error', 'Select one or more layers on the canvas first, then type /gen.');
        return;
      }
      addMessage('user', '/gen');
    } else {
      addMessage('user', text);
    }

    setIsLoading(true);
    setLoaderState('loading');
    setLoadingVerb(getRandomVerb());

    // Snapshot current state at submission time.
    let selCtx = selectionContext;
    const uiSpec = currentUISpec;
    const history = messagesRef.current;

    // When auto-generating for 2+ nodes, wrap them in a frame first so we have
    // a single owner node for the controls and the LLM sees them as a group.
    let wrapperFrameId: string | undefined;
    if (isAutoGenerate && selCtx && selCtx.nodes.length >= 2) {
      try {
        const wrapperTempId = `__wrapper_${Date.now()}`;
        const wrapActions: ActionDescriptor[] = [
          {
            method: 'createFrame',
            tempId: wrapperTempId,
            args: { name: 'Auto-Controls Group', fills: [] },
          },
          ...selCtx.nodes.map(n => ({
            method: 'appendChild' as const,
            nodeId: n.id,
            parentId: wrapperTempId,
            args: {},
          })),
        ];

        suppressSelectionResetRef.current = true;

        const wrapResult = await executeAndWait({
          actions: wrapActions,
          selectNodeId: wrapperTempId,
          skipCenter: true,
        });

        const realFrameId = wrapResult.tempIdMap?.[wrapperTempId] ?? wrapResult.rootFrameId;
        if (realFrameId) {
          wrapperFrameId = realFrameId;
          rootFrameIdRef.current = realFrameId;
          createdNodeIdsRef.current = [realFrameId];

          // Wait for the fresh SELECTION_CONTEXT with the wrapper frame as root.
          selCtx = await awaitSelectionContext();
          setSelectionContext(selCtx);
        }
      } catch (err) {
        console.warn('[app] wrapping failed, proceeding with original selection:', err);
      } finally {
        suppressSelectionResetRef.current = false;
      }
    }

    const { system, messages: apiMessages } = composePrompt(
      selCtx, uiSpec, history, text,
      isAutoGenerate ? { autoGenerate: true } : undefined,
    );

    const result = await callClaude(apiMessages, system);

    if (!result.ok) {
      addMessage('error', result.error);
      finishLoading(false);
      return;
    }

    // Log raw LLM output to Figma's plugin console for debugging.
    console.log('[llm] raw response:', result.text);

    const parsed = parseLLMResponse(result.text);

    if (!parsed.ok) {
      addMessage('error', parsed.error);
      finishLoading(false);
      return;
    }

    console.log('[llm] parsed:', JSON.stringify(parsed.data, null, 2));

    const { actions, ui, message, generate } = parsed.data;
    const normalizedUi: UISpec = {
      ...ui,
      generate: generate ?? ui.generate,
      actionTemplate: ui.actionTemplate ?? (generate ? undefined : undefined),
    };

    if (message) {
      addMessage('assistant', message);
    } else if (isAutoGenerate) {
      addMessage('assistant', `Auto-generated ${normalizedUi.controls.length} control(s) from selection.`);
    } else {
      const genLabel = normalizedUi.generate ? ' + generator' : '';
      addMessage('assistant', `Done — ${actions.length} action(s), ${normalizedUi.controls.length} control(s)${genLabel} generated.`);
    }

    // Compute the merged UISpec first so auto-execution uses the full spec.
    const mergedUi: UISpec = (() => {
      const prev = uiSpec;
      if (!prev || normalizedUi.replace) return normalizedUi;
      const existingById = new Map(prev.controls.map(c => [c.id, c]));
      // Remove explicitly listed controls before merging.
      if (normalizedUi.removeControls?.length) {
        for (const id of normalizedUi.removeControls) existingById.delete(id);
      }
      for (const c of normalizedUi.controls) existingById.set(c.id, c);
      const merged = {
        ...prev,
        ...normalizedUi,
        generate: normalizedUi.generate ?? prev.generate,
        actionTemplate: normalizedUi.actionTemplate ?? prev.actionTemplate,
        controls: Array.from(existingById.values()),
      };
      delete merged.removeControls;
      return merged;
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
        payload: {
          actions: actions as ActionDescriptor[],
          pluginSpec: specJson,
          persistNodeId: wrapperFrameId,
        },
      });
    } else if (mergedUi.generate) {
      const defaults = flattenColorStops(collectControlDefaults(mergedUi.controls));

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
            const rootFramePropertyMethods = new Set([
              'setFill', 'setStroke', 'setProperty', 'setEffect', 'setCornerRadius',
            ]);
            const rewrittenActions = generated.slice(rootIdx + 1)
              .filter((a) => {
                if (rootTempId && a.nodeId === rootTempId && rootFramePropertyMethods.has(a.method)) {
                  return false;
                }
                return true;
              })
              .map((a) => {
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
    } else if (mergedUi.actionTemplate?.length) {
      const defaults = collectControlDefaults(mergedUi.controls);
      const resolved = resolveTemplate(mergedUi.actionTemplate, defaults);
      postToMain({
        type: 'EXECUTE_ACTIONS',
        payload: { actions: resolved, pluginSpec: specJson },
      });
    } else if (mergedUi.controls.length > 0) {
      // Controls-only spec (e.g. auto-generate with direct actions on existing nodes).
      // Persist to the wrapper frame if we created one, else the first selected node.
      const targetId = wrapperFrameId ?? selCtx?.nodes[0]?.id;
      if (targetId) {
        rootFrameIdRef.current = targetId;
        createdNodeIdsRef.current = [targetId];
        postToMain({
          type: 'EXECUTE_ACTIONS',
          payload: { actions: [], pluginSpec: specJson, persistNodeId: targetId },
        });
      }
    }

    // Update the rendered UI spec with the merged result.
    setAnimateEntrance(true);
    setCurrentUISpec(mergedUi);

    finishLoading(true);
  }, [addMessage, selectionContext, currentUISpec, fetchImageData, handleDetach, finishLoading, executeAndWait, awaitSelectionContext]);

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
            payload: { actions: [], pluginSpec: JSON.stringify(updated), persistNodeId: targetId },
          });
        }
      }, 500);
      return updated;
    });
  }, []);

  const hasSpec = currentUISpec !== null && currentUISpec.controls.length > 0;

  return (
    <div className="shell">
      {/* Controls zone */}
      <div className="render-zone">
        {animateEntrance ? (
          <AnimatePresence mode="wait">
            {!hasSpec && (
              <motion.div
                key="empty"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                style={{ flex: 1, display: 'flex' }}
              >
                <EmptyState selectionName={mockSelectionName ?? (selectionContext?.nodes[0]?.name ?? null)} selectionCount={selectionContext?.nodes.length ?? 0} loaderState={loaderState} loadingVerb={loadingVerb} />
              </motion.div>
            )}
            {hasSpec && (
              <motion.div
                key="ui"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex', flexDirection: 'column', flex: 1 }}
              >
                <UIRenderer spec={currentUISpec!} onApply={handleApply} onValueChange={handleValueChange} animateEntrance disabled={isLoading} />
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <>
            {!hasSpec && (
              <div style={{ flex: 1, display: 'flex' }}>
                <EmptyState selectionName={mockSelectionName ?? (selectionContext?.nodes[0]?.name ?? null)} selectionCount={selectionContext?.nodes.length ?? 0} loaderState={loaderState} loadingVerb={loadingVerb} />
              </div>
            )}
            {hasSpec && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <UIRenderer spec={currentUISpec!} onApply={handleApply} onValueChange={handleValueChange} animateEntrance={false} disabled={isLoading} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Chat area */}
      <div className="chat-area">
        <ChatInput
          onSubmit={handleSubmit}
          disabled={isLoading}
          isLoading={isLoading && hasSpec}
          loadingVerb={loadingVerb}
          onFocusChange={handleFocusChange}
          hasSelection={!!selectionContext && selectionContext.nodes.length > 0}
          historyOpen={historyOpen}
          onHistoryToggle={() => setHistoryOpen(prev => !prev)}
        />
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
