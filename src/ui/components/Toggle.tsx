import { SegmentedControl } from './SegmentedControl';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <SegmentedControl
      options={[
        { value: 'off' as const, label: 'Off' },
        { value: 'on' as const, label: 'On' },
      ]}
      value={checked ? 'on' : 'off'}
      onChange={(val) => onChange(val === 'on')}
    />
  );
}
