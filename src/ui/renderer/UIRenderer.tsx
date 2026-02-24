import { useState, useCallback, useEffect } from 'react';
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
} from '../components';
import type { SpringConfig } from '../components';
import type { UIControl, UISpec, ActionDescriptor } from '../../shared/message-types';
import { collectControlDefaults } from '../template';

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

// ─── UIRenderer ───────────────────────────────────────────────────────────────

interface UIRendererProps {
  spec: UISpec;
  onApply?: (values: Record<string, unknown>) => void;
}

export function UIRenderer({ spec, onApply }: UIRendererProps) {
  const mode: ControlMode = spec.mode === 'apply' ? 'apply' : 'live';
  const [controlValues, setControlValues] = useState<ControlValues>(() => collectControlDefaults(spec.controls));

  useEffect(() => {
    setControlValues(collectControlDefaults(spec.controls));
  }, [spec]);

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
    setControlValues(prev => ({ ...prev, [controlId]: value }));
  }, []);

  if (!spec.controls || spec.controls.length === 0) return null;

  return (
    <div className="ui-renderer" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {spec.controls.map(control => (
        <ControlRenderer
          key={control.id}
          control={control}
          mode={mode}
          onControlChange={handleControlChange}
          onControlValueChange={handleControlValueChange}
        />
      ))}
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
