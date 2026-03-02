import { useState, useCallback, useEffect, useRef } from 'react';
import { postToMain } from '../messaging';
import {
  Slider,
  Toggle,
  Select,
  Section,
  ColorSwatch,
  TextInput,
  NumberInput,
  SegmentedControl,
  AngleWheel,
  ControlCard,
} from '../components';
import { PreviewCanvas } from '../components/PreviewCanvas';
import { CubePreview } from '../components/CubePreview';
import type { UIControl, UISpec, ActionDescriptor } from '../../shared/message-types';
import { collectControlDefaults } from '../template';
import { compileGenerator, executeGenerator } from '../codegen';

// ─── Control renderer ─────────────────────────────────────────────────────────

type ControlMode = 'live' | 'apply';
type ControlValues = Record<string, unknown>;

interface ControlProps {
  control: UIControl;
  mode: ControlMode;
  onControlChange: (controlId: string, value: unknown, action: ActionDescriptor | undefined, actions: ActionDescriptor[] | undefined) => void;
  onControlValueChange: (controlId: string, value: unknown) => void;
}

function ControlRenderer({ control, mode, onControlChange, onControlValueChange }: ControlProps) {
  const { id, type, label = '', props = {}, action } = control;

  const onChange = useCallback(
    (value: unknown) => {
      onControlValueChange(id, value);
      if (mode === 'live') {
        onControlChange(id, value, action, control.actions);
      }
    },
    [id, action, control.actions, mode, onControlChange, onControlValueChange],
  );

  switch (type) {
    case 'slider': {
      const [val, setVal] = useState<number>(
        typeof props.defaultValue === 'number' ? props.defaultValue
          : typeof props.min === 'number' ? props.min : 0,
      );
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
      const [val, setVal] = useState<boolean>(props.defaultValue === true);
      return (
        <Toggle
          label={label}
          checked={val}
          onChange={(v) => { setVal(v); onChange(v); }}
        />
      );
    }

    case 'number': {
      const [val, setVal] = useState<number>(
        typeof props.defaultValue === 'number' ? props.defaultValue
          : typeof props.min === 'number' ? props.min : 0,
      );
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
      const [val, setVal] = useState<string>(
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
      const [val, setVal] = useState<string>(
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
        const [val, setVal] = useState<Record<string, string>>(defaults);
        return (
          <ColorSwatch
            label={label}
            value={val}
            colors={colorStops}
            onChange={(v) => { setVal(v as Record<string, string>); onChange(v); }}
          />
        );
      }

      const [val, setVal] = useState<string>(
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
      const [val, setVal] = useState<string>(
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
      const [val, setVal] = useState<number>(
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

    case 'button':
      return (
        <button
          className="dialkit-button dialkit-button--secondary"
          onClick={() => onChange(null)}
        >
          {label}
        </button>
      );

    case 'section': {
      const children = control.children ?? [];
      return (
        <Section
          title={label}
          defaultOpen={props.defaultOpen !== false}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {children.map(child => (
              <ControlRenderer
                key={child.id}
                control={child}
                mode={mode}
                onControlChange={onControlChange}
                onControlValueChange={onControlValueChange}
              />
            ))}
          </div>
        </Section>
      );
    }

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
    // Fallback: use first two dial controls as rx/ry
    return { rx: dialControls[0].id, ry: dialControls[1].id, rz: dialControls[2]?.id };
  }

  return { rx: rxCtrl.id, ry: ryCtrl.id, rz: rzCtrl?.id };
}

// ─── Render grouping (consecutive dials → rows) ─────────────────────────────

type RenderItem =
  | { kind: 'single'; control: UIControl }
  | { kind: 'dial-row'; controls: UIControl[] };

function groupControls(controls: UIControl[], cubeDialIds: Set<string> | null): RenderItem[] {
  const items: RenderItem[] = [];
  let dialBuffer: UIControl[] = [];

  const flushDials = () => {
    if (dialBuffer.length === 0) return;
    if (dialBuffer.length === 1) {
      items.push({ kind: 'single', control: dialBuffer[0] });
    } else {
      items.push({ kind: 'dial-row', controls: [...dialBuffer] });
    }
    dialBuffer = [];
  };

  for (const control of controls) {
    // Skip dial controls consumed by CubePreview
    if (cubeDialIds && cubeDialIds.has(control.id)) continue;

    if (control.type === 'dial') {
      dialBuffer.push(control);
    } else {
      flushDials();
      items.push({ kind: 'single', control });
    }
  }
  flushDials();
  return items;
}

// ─── UIRenderer ───────────────────────────────────────────────────────────────

interface UIRendererProps {
  spec: UISpec;
  onApply?: (values: Record<string, unknown>) => void;
  onValueChange?: (controlId: string, value: unknown) => void;
}

export function UIRenderer({ spec, onApply, onValueChange }: UIRendererProps) {
  const mode: ControlMode = spec.mode === 'apply' ? 'apply' : 'live';
  const [controlValues, setControlValues] = useState<ControlValues>(() => collectControlDefaults(spec.controls));
  const [previewActions, setPreviewActions] = useState<ActionDescriptor[] | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlValuesRef = useRef<ControlValues>(controlValues);
  controlValuesRef.current = controlValues;

  const dialIds = findDialControls(spec.controls);
  const hasCubePreview = mode === 'apply' && !!spec.generate && !spec.imageNodeId && !!dialIds;
  const hasPreview = hasCubePreview;

  const cubeDialIdSet = hasCubePreview && dialIds
    ? new Set([dialIds.rx, dialIds.ry, ...(dialIds.rz ? [dialIds.rz] : [])])
    : null;

  useEffect(() => {
    setControlValues(collectControlDefaults(spec.controls));
  }, [spec]);

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
      if (!action && !actions?.length) return;
      postToMain({
        type: 'CONTROL_CHANGE',
        payload: { controlId, value, action, actions },
      });
    },
    [],
  );

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
  }, [onValueChange, hasPreview, hasCubePreview, runPreview]);

  const handleCubeRotate = useCallback((newRx: number, newRy: number) => {
    if (!dialIds) return;
    setControlValues(prev => {
      const next = { ...prev, [dialIds.rx]: newRx, [dialIds.ry]: newRy };
      controlValuesRef.current = next;
      return next;
    });
    onValueChange?.(dialIds.rx, newRx);
    onValueChange?.(dialIds.ry, newRy);
  }, [dialIds, onValueChange]);

  if (!spec.controls || spec.controls.length === 0) return null;

  const isConnected = (control: UIControl) => !!control.action || !!(control.actions?.length);
  const renderItems = groupControls(spec.controls, cubeDialIdSet);

  const renderControl = (control: UIControl) => {
    // Section and button don't get ControlCard wrapper
    if (control.type === 'section' || control.type === 'button') {
      return (
        <ControlRenderer
          key={control.id}
          control={control}
          mode={mode}
          onControlChange={handleControlChange}
          onControlValueChange={handleControlValueChange}
        />
      );
    }

    return (
      <ControlCard key={control.id} label={control.label ?? ''} connected={isConnected(control)}>
        <ControlRenderer
          control={control}
          mode={mode}
          onControlChange={handleControlChange}
          onControlValueChange={handleControlValueChange}
        />
      </ControlCard>
    );
  };

  return (
    <div className="ui-renderer" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {hasCubePreview && dialIds && (
        <CubePreview
          rx={(controlValues[dialIds.rx] as number) ?? 0}
          ry={(controlValues[dialIds.ry] as number) ?? 0}
          rz={dialIds.rz ? ((controlValues[dialIds.rz] as number) ?? 0) : 0}
          onRotate={handleCubeRotate}
        />
      )}
      {renderItems.map((item, idx) => {
        if (item.kind === 'single') {
          return renderControl(item.control);
        }
        // dial-row: multiple dials side by side
        return (
          <div key={`dial-row-${idx}`} className="dialkit-control-row">
            {item.controls.map(control => renderControl(control))}
          </div>
        );
      })}
      {hasPreview && !hasCubePreview && previewActions && previewActions.length > 0 && (
        <PreviewCanvas actions={previewActions} />
      )}
      {mode === 'apply' && onApply && (
        <button
          className="dialkit-button"
          onClick={() => onApply(controlValues)}
        >
          Apply changes
        </button>
      )}
    </div>
  );
}
