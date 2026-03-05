import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { motion } from 'motion/react';
import { postToMain } from '../messaging';
import {
  Slider,
  Toggle,
  Select,
  ColorSwatch,
  TextInput,
  NumberInput,
  SegmentedControl,
  AngleWheel,
  ControlCard,
  XYPad,
  RangeSlider,
  GradientBar,
  CurveEditor,
} from '../components';
import { PreviewCanvas } from '../components/PreviewCanvas';
import { CubePreview } from '../components/CubePreview';
import type { UIControl, UISpec, ActionDescriptor } from '../../shared/message-types';
import { collectControlDefaults } from '../template';
import { compileGenerator, executeGenerator } from '../codegen';

// ─── Synced state hook ────────────────────────────────────────────────────────

/**
 * Like useState, but resyncs to `externalValue` whenever it changes.
 * Prevents stale internal state when the UISpec is updated by the LLM.
 * Uses JSON comparison for objects so reconstructed-but-equal values
 * don't trigger spurious resets (e.g. multi-stop color defaults).
 */
function useSyncedState<T>(externalValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [val, setVal] = useState<T>(externalValue);
  const prevExternal = useRef(externalValue);
  useEffect(() => {
    const prev = prevExternal.current;
    const changed = typeof prev === 'object' && prev !== null
      ? JSON.stringify(prev) !== JSON.stringify(externalValue)
      : prev !== externalValue;
    if (changed) {
      prevExternal.current = externalValue;
      setVal(externalValue);
    }
  }, [externalValue]);
  return [val, setVal];
}

// ─── Control renderer ─────────────────────────────────────────────────────────

type ControlValues = Record<string, unknown>;

interface ControlProps {
  control: UIControl;
  currentValue?: unknown;
  onControlChange: (controlId: string, value: unknown, action: ActionDescriptor | undefined, actions: ActionDescriptor[] | undefined) => void;
  onControlValueChange: (controlId: string, value: unknown) => void;
}

function ControlRenderer({ control, currentValue, onControlChange, onControlValueChange }: ControlProps) {
  const { id, type, label = '', props = {}, action } = control;

  const onChange = useCallback(
    (value: unknown) => {
      onControlValueChange(id, value);
      onControlChange(id, value, action, control.actions);
    },
    [id, action, control.actions, onControlChange, onControlValueChange],
  );

  switch (type) {
    case 'slider': {
      const defaultVal = typeof props.defaultValue === 'number' ? props.defaultValue
        : typeof props.min === 'number' ? props.min : 0;
      const [val, setVal] = useSyncedState<number>(defaultVal);
      return (
        <Slider
          label={label}
          value={val}
          min={typeof props.min === 'number' ? props.min : 0}
          max={typeof props.max === 'number' ? props.max : 1}
          step={typeof props.step === 'number' ? props.step : 0.01}
          onChange={(v) => { setVal(v); onChange(v); }}
        />
      );
    }

    case 'toggle': {
      const [val, setVal] = useSyncedState<boolean>(props.defaultValue === true);
      return (
        <Toggle
          label={label}
          checked={val}
          onChange={(v) => { setVal(v); onChange(v); }}
        />
      );
    }

    case 'number': {
      const defaultVal = typeof props.defaultValue === 'number' ? props.defaultValue
        : typeof props.min === 'number' ? props.min : 0;
      const [val, setVal] = useSyncedState<number>(defaultVal);
      return (
        <NumberInput
          label={label}
          value={val}
          min={typeof props.min === 'number' ? props.min : undefined}
          max={typeof props.max === 'number' ? props.max : undefined}
          step={typeof props.step === 'number' ? props.step : 1}
          onChange={(v) => { setVal(v); onChange(v); }}
        />
      );
    }

    case 'select': {
      const options = Array.isArray(props.options)
        ? (props.options as string[])
        : ['Option A', 'Option B'];
      const [val, setVal] = useSyncedState<string>(
        typeof props.defaultValue === 'string' ? props.defaultValue : options[0] ?? '',
      );
      return (
        <Select
          label={label}
          value={val}
          options={options}
          onChange={(v) => { setVal(v); onChange(v); }}
        />
      );
    }

    case 'segmented': {
      type Opt = { value: string; label: string };
      const options: Opt[] = Array.isArray(props.options)
        ? (props.options as Opt[])
        : [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
      const [val, setVal] = useSyncedState<string>(
        typeof props.defaultValue === 'string' ? props.defaultValue : (options[0]?.value ?? ''),
      );
      return (
        <SegmentedControl
          options={options}
          value={val}
          onChange={(v) => { setVal(v as string); onChange(v); }}
        />
      );
    }

    case 'color': {
      const colorStops = Array.isArray(props.colors) ? props.colors as { id: string; label: string; defaultValue?: string }[] : null;

      if (colorStops && colorStops.length > 0) {
        const defaults: Record<string, string> = {};
        for (const stop of colorStops) {
          defaults[stop.id] = stop.defaultValue ?? '#000000';
        }
        const [val, setVal] = useSyncedState<Record<string, string>>(defaults);
        return (
          <ColorSwatch
            label={label}
            value={val}
            colors={colorStops}
            onChange={(v) => { setVal(v as Record<string, string>); onChange(v); }}
          />
        );
      }

      const [val, setVal] = useSyncedState<string>(
        typeof props.defaultValue === 'string' ? props.defaultValue : '#000000',
      );
      return (
        <ColorSwatch
          label={label}
          value={val}
          onChange={(v) => { setVal(v as string); onChange(v); }}
        />
      );
    }

    case 'text': {
      const [val, setVal] = useSyncedState<string>(
        typeof props.defaultValue === 'string' ? props.defaultValue : '',
      );
      return (
        <TextInput
          label={label}
          value={val}
          placeholder={typeof props.placeholder === 'string' ? props.placeholder : undefined}
          onChange={(v) => { setVal(v); onChange(v); }}
        />
      );
    }

    case 'dial': {
      const [val, setVal] = useSyncedState<number>(
        typeof props.defaultValue === 'number' ? props.defaultValue : 0,
      );
      return (
        <AngleWheel
          label={label}
          value={val}
          min={typeof props.min === 'number' ? props.min : -180}
          max={typeof props.max === 'number' ? props.max : 180}
          step={typeof props.step === 'number' ? props.step : 1}
          onChange={(v) => { setVal(v); onChange(v); }}
        />
      );
    }

    case 'xy-pad': {
      const dv = (typeof props.defaultValue === 'object' && props.defaultValue !== null)
        ? props.defaultValue as { x?: number; y?: number }
        : {};
      const defaultXY = { x: dv.x ?? 0, y: dv.y ?? 0 };
      const cv = (typeof currentValue === 'object' && currentValue !== null && 'x' in (currentValue as object))
        ? currentValue as { x: number; y: number } : null;
      const [val, setVal] = useSyncedState<{ x: number; y: number }>(cv ?? defaultXY);
      return (
        <XYPad
          label={label}
          value={val}
          minX={typeof props.minX === 'number' ? props.minX : -100}
          maxX={typeof props.maxX === 'number' ? props.maxX : 100}
          minY={typeof props.minY === 'number' ? props.minY : -100}
          maxY={typeof props.maxY === 'number' ? props.maxY : 100}
          stepX={typeof props.stepX === 'number' ? props.stepX : 1}
          stepY={typeof props.stepY === 'number' ? props.stepY : 1}
          onChange={(v) => { setVal(v); onChange(v); }}
        />
      );
    }

    case 'range': {
      const dv = (typeof props.defaultValue === 'object' && props.defaultValue !== null)
        ? props.defaultValue as { low?: number; high?: number }
        : {};
      const lo = dv.low ?? (typeof props.min === 'number' ? props.min : 0);
      const hi = dv.high ?? (typeof props.max === 'number' ? props.max : 1);
      const defaultRange = { low: lo, high: hi };
      const cv = (typeof currentValue === 'object' && currentValue !== null && 'low' in (currentValue as object))
        ? currentValue as { low: number; high: number } : null;
      const [val, setVal] = useSyncedState<{ low: number; high: number }>(cv ?? defaultRange);
      return (
        <RangeSlider
          label={label}
          value={val}
          min={typeof props.min === 'number' ? props.min : 0}
          max={typeof props.max === 'number' ? props.max : 1}
          step={typeof props.step === 'number' ? props.step : 0.01}
          onChange={(v) => { setVal(v); onChange(v); }}
        />
      );
    }

    case 'gradient-bar': {
      type Stop = { id: string; position: number; color: string };
      const defaultStops: Stop[] = Array.isArray(props.stops)
        ? (props.stops as Stop[])
        : [{ id: 'stop0', position: 0, color: '#000000' }, { id: 'stop1', position: 1, color: '#ffffff' }];
      const initialStops = (Array.isArray(currentValue) ? currentValue as Stop[] : null) ?? defaultStops;
      const [val, setVal] = useSyncedState<Stop[]>(initialStops);
      return (
        <GradientBar
          label={label}
          value={val}
          minStops={typeof props.minStops === 'number' ? props.minStops : 2}
          maxStops={typeof props.maxStops === 'number' ? props.maxStops : 8}
          onChange={(v) => { setVal(v); onChange(v); }}
        />
      );
    }

    case 'curve': {
      const dv = Array.isArray(props.defaultValue)
        ? props.defaultValue as [number, number, number, number]
        : [0.25, 0.1, 0.25, 1.0] as [number, number, number, number];
      const initialCurve = (Array.isArray(currentValue) && currentValue.length === 4
        ? currentValue as [number, number, number, number] : null) ?? dv;
      const [val, setVal] = useSyncedState<[number, number, number, number]>(initialCurve);
      return (
        <CurveEditor
          label={label}
          value={val}
          onChange={(v) => { setVal(v); onChange(v); }}
        />
      );
    }

    case 'button':
      return (
        <div className="dialkit-control-card">
          <button
            className="dialkit-button dialkit-button--secondary"
            onClick={() => onChange(null)}
          >
            {label}
          </button>
        </div>
      );

    default:
      return (
        <div style={{ fontSize: 10, color: 'rgba(255,80,80,0.7)', padding: '4px 8px' }}>
          Unknown control type: {type}
        </div>
      );
  }
}

// ─── Dial control detection ──────────────────────────────────────────────────

interface DialControlIds {
  rx: string;
  ry: string;
  rz?: string;
}

function findDialControls(controls: UIControl[]): DialControlIds | null {
  const dialControls = controls.filter(c => c.type === 'dial');
  if (dialControls.length < 2) return null;

  const rxPatterns = ['rx', 'rotateX', 'rotate_x', 'rotatex', 'angleX', 'angle_x'];
  const ryPatterns = ['ry', 'rotateY', 'rotate_y', 'rotatey', 'angleY', 'angle_y'];
  const rzPatterns = ['rz', 'rotateZ', 'rotate_z', 'rotatez', 'angleZ', 'angle_z'];

  const match = (id: string, patterns: string[]) =>
    patterns.some(p => id.toLowerCase() === p.toLowerCase());

  const rxCtrl = dialControls.find(c => match(c.id, rxPatterns));
  const ryCtrl = dialControls.find(c => match(c.id, ryPatterns));
  const rzCtrl = dialControls.find(c => match(c.id, rzPatterns));

  if (!rxCtrl || !ryCtrl) {
    return null;
  }

  return { rx: rxCtrl.id, ry: ryCtrl.id, rz: rzCtrl?.id };
}

// ─── Render grouping (dials paired into rows, max 2 per row) ─────────────────

type RenderItem =
  | { kind: 'single'; control: UIControl }
  | { kind: 'dial-row'; controls: UIControl[] };

function groupControls(controls: UIControl[], cubeDialIds: Set<string> | null): RenderItem[] {
  const filtered = cubeDialIds
    ? controls.filter(c => !cubeDialIds.has(c.id))
    : controls;

  // Collect all dials and pair them (max 2 per row)
  const allDials = filtered.filter(c => c.type === 'dial');
  const dialRows: UIControl[][] = [];
  for (let i = 0; i < allDials.length; i += 2) {
    dialRows.push(allDials.slice(i, i + 2));
  }

  // Build render list: place each dial-row at the position of its first dial
  const items: RenderItem[] = [];
  let nextDialRow = 0;
  const dialIdSet = new Set(allDials.map(d => d.id));

  for (const control of filtered) {
    if (control.type !== 'dial') {
      items.push({ kind: 'single', control });
    } else if (dialIdSet.has(control.id)) {
      const row = dialRows[nextDialRow];
      if (row && row[0].id === control.id) {
        if (row.length === 1) {
          items.push({ kind: 'single', control: row[0] });
        } else {
          items.push({ kind: 'dial-row', controls: row });
        }
        nextDialRow++;
      }
    }
  }

  return items;
}

// ─── UIRenderer ───────────────────────────────────────────────────────────────

interface UIRendererProps {
  spec: UISpec;
  onApply?: (values: Record<string, unknown>) => void;
  onValueChange?: (controlId: string, value: unknown) => void;
  animateEntrance?: boolean;
  disabled?: boolean;
}

export function UIRenderer({ spec, onApply, onValueChange, animateEntrance = true, disabled = false }: UIRendererProps) {
  const hasGenerator = !!spec.generate;
  const [controlValues, setControlValues] = useState<ControlValues>(() => collectControlDefaults(spec.controls));
  const [previewActions, setPreviewActions] = useState<ActionDescriptor[] | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlValuesRef = useRef<ControlValues>(controlValues);
  controlValuesRef.current = controlValues;

  const AUTO_APPLY_DELAY = 400;

  const dialIds = findDialControls(spec.controls);
  const hasCubePreview = hasGenerator && !spec.imageNodeId && !!dialIds;
  const hasPreview = hasCubePreview;

  const cubeDialIdSet = hasCubePreview && dialIds
    ? new Set([dialIds.rx, dialIds.ry, ...(dialIds.rz ? [dialIds.rz] : [])])
    : null;

  // Only reset control values when the control structure changes (IDs/types),
  // NOT when defaultValues are stamped by auto-apply. This prevents the
  // auto-apply → stampSpec → useEffect → reset-to-defaults race condition.
  const controlStructureKey = spec.controls
    .map(c => `${c.id}:${c.type}`)
    .join(',');
  useEffect(() => {
    setControlValues(collectControlDefaults(spec.controls));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlStructureKey]);

  // Run initial preview on mount when a generator is present (non-cube preview)
  useEffect(() => {
    if (!hasPreview || hasCubePreview || !spec.generate) return;
    try {
      const fn = compileGenerator(spec.generate);
      const actions = executeGenerator(fn, controlValuesRef.current);
      setPreviewActions(actions);
    } catch {
      setPreviewActions(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.generate, hasPreview, hasCubePreview]);

  const runPreview = useCallback(() => {
    if (!hasPreview || hasCubePreview || !spec.generate) return;
    try {
      const fn = compileGenerator(spec.generate);
      const actions = executeGenerator(fn, controlValuesRef.current);
      setPreviewActions(actions);
    } catch {
      setPreviewActions(null);
    }
  }, [hasPreview, hasCubePreview, spec.generate]);

  const handleControlChange = useCallback(
    (controlId: string, value: unknown, action: ActionDescriptor | undefined, actions: ActionDescriptor[] | undefined) => {
      if (disabled) return;
      // When a generator is present, all updates go through auto-apply
      // (generator re-execution). Skip the live CONTROL_CHANGE to avoid
      // spurious errors from actions targeting the wrong node.
      if (hasGenerator) return;
      if (!action && !actions?.length) return;
      postToMain({
        type: 'CONTROL_CHANGE',
        payload: { controlId, value, action, actions },
      });
    },
    [hasGenerator, disabled],
  );

  const scheduleAutoApply = useCallback(() => {
    if (disabled) return;
    if (!hasGenerator || !onApply) return;
    if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    applyTimerRef.current = setTimeout(() => {
      onApply(controlValuesRef.current);
    }, AUTO_APPLY_DELAY);
  }, [hasGenerator, onApply, AUTO_APPLY_DELAY, disabled]);

  const handleControlValueChange = useCallback((controlId: string, value: unknown) => {
    setControlValues(prev => {
      const next = { ...prev, [controlId]: value };
      controlValuesRef.current = next;
      return next;
    });
    onValueChange?.(controlId, value);

    if (hasPreview && !hasCubePreview) {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(runPreview, 80);
    }

    scheduleAutoApply();
  }, [onValueChange, hasPreview, hasCubePreview, runPreview, scheduleAutoApply]);

  const handleCubeRotate = useCallback((newRx: number, newRy: number) => {
    if (!dialIds) return;
    setControlValues(prev => {
      const next = { ...prev, [dialIds.rx]: newRx, [dialIds.ry]: newRy };
      controlValuesRef.current = next;
      return next;
    });
    onValueChange?.(dialIds.rx, newRx);
    onValueChange?.(dialIds.ry, newRy);
    scheduleAutoApply();
  }, [dialIds, onValueChange, scheduleAutoApply]);

  if (!spec.controls || spec.controls.length === 0) return null;

  const isConnected = (control: UIControl) =>
    hasGenerator || !!control.action || !!(control.actions?.length);
  const renderItems = groupControls(spec.controls, cubeDialIdSet);

  const renderControl = (control: UIControl) => {
    if (control.type === 'button') {
      return (
        <ControlRenderer
          key={control.id}
          control={control}
          currentValue={controlValues[control.id]}
          onControlChange={handleControlChange}
          onControlValueChange={handleControlValueChange}
        />
      );
    }

    return (
      <ControlCard key={control.id} label={control.label ?? ''} connected={isConnected(control)}>
        <ControlRenderer
          control={control}
          currentValue={controlValues[control.id]}
          onControlChange={handleControlChange}
          onControlValueChange={handleControlValueChange}
        />
      </ControlCard>
    );
  };

  const SKELETON_STAGGER = 0.25;
  const SKELETON_DURATION = 0.35;
  const skeletonTotal = renderItems.length * SKELETON_STAGGER + SKELETON_DURATION;
  const CONTENT_DELAY = skeletonTotal + 0.05;
  const CONTENT_STAGGER = 0.04;

  if (!animateEntrance) {
    return (
      <div
        className={`ui-renderer${disabled ? ' ui-renderer--disabled' : ''}`}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {hasCubePreview && dialIds && (
          <CubePreview
            rx={(controlValues[dialIds.rx] as number) ?? 0}
            ry={(controlValues[dialIds.ry] as number) ?? 0}
            rz={dialIds.rz ? ((controlValues[dialIds.rz] as number) ?? 0) : 0}
            onRotate={handleCubeRotate}
          />
        )}
        {renderItems.map((item, idx) => {
          const content = item.kind === 'single'
            ? renderControl(item.control)
            : (
              <div key={`dial-row-${idx}`} className="dialkit-control-row">
                {item.controls.map(control => renderControl(control))}
              </div>
            );
          return (
            <div key={item.kind === 'single' ? item.control.id : `dial-row-${idx}`}>
              {content}
            </div>
          );
        })}
        {hasPreview && !hasCubePreview && previewActions && previewActions.length > 0 && (
          <PreviewCanvas actions={previewActions} />
        )}
      </div>
    );
  }

  return (
    <motion.div
      className={`ui-renderer${disabled ? ' ui-renderer--disabled' : ''}`}
      style={{ display: 'flex', flexDirection: 'column' }}
      initial="skeleton"
      animate="visible"
      variants={{
        skeleton: {},
        visible: {
          transition: {
            staggerChildren: SKELETON_STAGGER,
          },
        },
      }}
    >
      {hasCubePreview && dialIds && (
        <CubePreview
          rx={(controlValues[dialIds.rx] as number) ?? 0}
          ry={(controlValues[dialIds.ry] as number) ?? 0}
          rz={dialIds.rz ? ((controlValues[dialIds.rz] as number) ?? 0) : 0}
          onRotate={handleCubeRotate}
        />
      )}
      {renderItems.map((item, idx) => {
        const content = item.kind === 'single'
          ? renderControl(item.control)
          : (
            <div key={`dial-row-${idx}`} className="dialkit-control-row">
              {item.controls.map(control => renderControl(control))}
            </div>
          );
        const contentDelay = CONTENT_DELAY + idx * CONTENT_STAGGER;
        const isDialRow = item.kind === 'dial-row';
        return (
          <motion.div
            key={isDialRow ? `dial-row-${idx}` : item.control.id}
            className={`ui-enter-card ${isDialRow ? 'ui-enter-card--dial-row' : ''}`}
            variants={{
              skeleton: { opacity: 1 },
              visible: { opacity: 1 },
            }}
          >
            <motion.div
              className="ui-enter-skeleton"
              variants={{
                skeleton: { clipPath: 'inset(0 100% 0 0)' },
                visible: {
                  clipPath: 'inset(0 0% 0 0)',
                  transition: { duration: SKELETON_DURATION, ease: [0.16, 1, 0.3, 1] },
                },
              }}
            />
            <motion.div
              className="ui-enter-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.3,
                delay: contentDelay,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {content}
            </motion.div>
          </motion.div>
        );
      })}
      {hasPreview && !hasCubePreview && previewActions && previewActions.length > 0 && (
        <PreviewCanvas actions={previewActions} />
      )}
    </motion.div>
  );
}
