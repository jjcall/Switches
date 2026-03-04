import type { ActionDescriptor, UIControl } from '../shared/message-types';

function getControlDefaultValue(control: UIControl): unknown {
  const props = control.props ?? {};
  switch (control.type) {
    case 'slider':
    case 'number':
      return typeof props.defaultValue === 'number'
        ? props.defaultValue
        : typeof props.min === 'number'
          ? props.min
          : 0;
    case 'toggle':
      return props.defaultValue === true;
    case 'select': {
      const options = Array.isArray(props.options) ? (props.options as string[]) : [];
      return typeof props.defaultValue === 'string' ? props.defaultValue : (options[0] ?? '');
    }
    case 'segmented': {
      type Opt = { value: string; label: string };
      const options: Opt[] = Array.isArray(props.options) ? (props.options as Opt[]) : [];
      return typeof props.defaultValue === 'string' ? props.defaultValue : (options[0]?.value ?? '');
    }
    case 'color': {
      const colorStops = Array.isArray(props.colors) ? props.colors as { id: string; defaultValue?: string }[] : null;
      if (colorStops && colorStops.length > 0) {
        const defaults: Record<string, string> = {};
        for (const stop of colorStops) defaults[stop.id] = stop.defaultValue ?? '#000000';
        return defaults;
      }
      return typeof props.defaultValue === 'string' ? props.defaultValue : '#000000';
    }
    case 'text':
      return typeof props.defaultValue === 'string' ? props.defaultValue : '';
    case 'dial':
      return typeof props.defaultValue === 'number'
        ? props.defaultValue
        : 0;
    case 'xy-pad': {
      const dv = props.defaultValue as { x?: number; y?: number } | undefined;
      return { x: dv?.x ?? 0, y: dv?.y ?? 0 };
    }
    case 'range': {
      const dv = props.defaultValue as { low?: number; high?: number } | undefined;
      return {
        low: dv?.low ?? (typeof props.min === 'number' ? props.min : 0),
        high: dv?.high ?? (typeof props.max === 'number' ? props.max : 1),
      };
    }
    case 'gradient-bar': {
      const stops = Array.isArray(props.stops) ? props.stops as { id: string; position: number; color: string }[] : null;
      return stops ?? [
        { id: 'stop0', position: 0, color: '#000000' },
        { id: 'stop1', position: 1, color: '#ffffff' },
      ];
    }
    case 'curve': {
      const dv = Array.isArray(props.defaultValue) ? props.defaultValue as number[] : null;
      return dv ?? [0.25, 0.1, 0.25, 1.0];
    }
    case 'button':
      return null;
    default:
      return undefined;
  }
}

export function collectControlDefaults(controls: UIControl[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const control of controls) {
    values[control.id] = getControlDefaultValue(control);
  }
  return values;
}

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;
const FULL_PLACEHOLDER_RE = /^\{\{(\w+)\}\}$/;

function resolveValue(input: unknown, values: Record<string, unknown>): unknown {
  if (typeof input === 'string') {
    const full = input.match(FULL_PLACEHOLDER_RE);
    if (full) {
      return values[full[1]];
    }
    return input.replace(PLACEHOLDER_RE, (_m, key: string) => {
      const v = values[key];
      if (v === undefined || v === null) return '';
      return typeof v === 'string' ? v : String(v);
    });
  }

  if (Array.isArray(input)) {
    return input.map(item => resolveValue(item, values));
  }

  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = resolveValue(v, values);
    }
    return out;
  }

  return input;
}

/**
 * Resolves {{controlId}} placeholders in action args.
 * If a string is exactly "{{key}}", the raw value type is preserved.
 */
export function resolveTemplate(
  actions: ActionDescriptor[],
  values: Record<string, unknown>,
): ActionDescriptor[] {
  return actions.map(action => ({
    ...action,
    nodeId: resolveValue(action.nodeId, values) as string | undefined,
    parentId: resolveValue(action.parentId, values) as string | undefined,
    args: resolveValue(action.args, values) as Record<string, unknown>,
  }));
}
