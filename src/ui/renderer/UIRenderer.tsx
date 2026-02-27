import { useState, useCallback, useEffect, useRef } from 'react';
import { postToMain } from '../messaging';
import {
  Slider,
  Toggle,
  Select,
  Section,
  ColorSwatch,
  SpringEditor,
  TextInput,
  Button,
  NumberInput,
  SegmentedControl,
  AngleWheel,
} from '../components';
import { PreviewCanvas } from '../components/PreviewCanvas';
import { CubePreview } from '../components/CubePreview';
import type { SpringConfig } from '../components';
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
        <div className="dialkit-labeled-control">
          <span className="dialkit-labeled-control-label">{label}</span>
          <SegmentedControl
            options={options}
            value={val}
            onChange={(v) => { setVal(v as string); onChange(v); }}
          />
        </div>
      );
    }

    case 'color': {
      const [val, setVal] = useState<string>(
        typeof props.defaultValue === 'string' ? props.defaultValue : '#000000',
      );
      return (
        <ColorSwatch
          label={label}
          value={val}
          onChange={(v) => { setVal(v); onChange(v); }}
        />
      );
    }

    case 'spring': {
      const [val, setVal] = useState<SpringConfig>({
        type: 'spring',
        visualDuration: 0.3,
        bounce: 0.2,
        ...(typeof props.defaultValue === 'object' && props.defaultValue !== null
          ? (props.defaultValue as Partial<SpringConfig>)
          : {}),
      });
      return (
        <SpringEditor
          label={label}
          value={val}
          onChange={(v) => { setVal(v); onChange(v); }}
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

    case 'angle': {
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
          className="dialkit-button"
          style={{ width: '100%' }}
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

// ─── Angle control detection ──────────────────────────────────────────────────

interface AngleControlIds {
  rx: string;
  ry: string;
  rz?: string;
}

function findAngleControls(controls: UIControl[]): AngleControlIds | null {
  const angleControls = controls.filter(c => c.type === 'angle');
  if (angleControls.length < 2) return null;

  const rxPatterns = ['rx', 'rotateX', 'rotate_x', 'rotatex', 'angleX', 'angle_x'];
  const ryPatterns = ['ry', 'rotateY', 'rotate_y', 'rotatey', 'angleY', 'angle_y'];
  const rzPatterns = ['rz', 'rotateZ', 'rotate_z', 'rotatez', 'angleZ', 'angle_z'];

  const match = (id: string, patterns: string[]) =>
    patterns.some(p => id.toLowerCase() === p.toLowerCase());

  const rxCtrl = angleControls.find(c => match(c.id, rxPatterns));
  const ryCtrl = angleControls.find(c => match(c.id, ryPatterns));
  const rzCtrl = angleControls.find(c => match(c.id, rzPatterns));

  if (!rxCtrl || !ryCtrl) {
    // Fallback: use first two angle controls as rx/ry
    return { rx: angleControls[0].id, ry: angleControls[1].id, rz: angleControls[2]?.id };
  }

  return { rx: rxCtrl.id, ry: ryCtrl.id, rz: rzCtrl?.id };
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

  const hasPreview = mode === 'apply' && !!spec.generate && !spec.imageNodeId;
  const angleIds = findAngleControls(spec.controls);
  const hasCubePreview = hasPreview && !!angleIds;

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
    if (!angleIds) return;
    setControlValues(prev => {
      const next = { ...prev, [angleIds.rx]: newRx, [angleIds.ry]: newRy };
      controlValuesRef.current = next;
      return next;
    });
    onValueChange?.(angleIds.rx, newRx);
    onValueChange?.(angleIds.ry, newRy);
  }, [angleIds, onValueChange]);

  if (!spec.controls || spec.controls.length === 0) return null;

  return (
    <div className="ui-renderer" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {hasCubePreview && angleIds && (
        <CubePreview
          rx={(controlValues[angleIds.rx] as number) ?? 0}
          ry={(controlValues[angleIds.ry] as number) ?? 0}
          rz={angleIds.rz ? ((controlValues[angleIds.rz] as number) ?? 0) : 0}
          onRotate={handleCubeRotate}
        />
      )}
      {spec.controls
        .filter(control => !(hasCubePreview && control.type === 'angle'))
        .map(control => (
          <ControlRenderer
            key={control.id}
            control={control}
            mode={mode}
            onControlChange={handleControlChange}
            onControlValueChange={handleControlValueChange}
          />
        ))}
      {hasPreview && !hasCubePreview && previewActions && previewActions.length > 0 && (
        <PreviewCanvas actions={previewActions} />
      )}
      {mode === 'apply' && onApply && (
        <button
          className="dialkit-button"
          style={{ width: '100%' }}
          onClick={() => onApply(controlValues)}
        >
          Apply
        </button>
      )}
    </div>
  );
}
