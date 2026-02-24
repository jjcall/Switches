import { useState } from 'react';
import { SpringConfig, SpringVisualization } from './SpringVisualization';
import { Slider } from './Slider';
import { SegmentedControl } from './SegmentedControl';

interface SpringControlProps {
  label: string;
  value: SpringConfig;
  onChange: (spring: SpringConfig) => void;
}

// SpringControl manages its own mode (simple vs physics) as UI-only state.
// The mode is not part of the SpringConfig value passed out to consumers.
export function SpringControl({ label, value, onChange }: SpringControlProps) {
  const hasPhysicsProps = value.stiffness !== undefined || value.damping !== undefined;
  const [mode, setMode] = useState<'simple' | 'advanced'>(hasPhysicsProps ? 'advanced' : 'simple');

  const isSimpleMode = mode === 'simple';

  const handleModeChange = (newMode: 'simple' | 'advanced') => {
    setMode(newMode);
    if (newMode === 'simple') {
      const { stiffness: _s, damping: _d, mass: _m, ...rest } = value;
      onChange({
        ...rest,
        type: 'spring',
        visualDuration: value.visualDuration ?? 0.3,
        bounce: value.bounce ?? 0.2,
      });
    } else {
      const { visualDuration: _vd, bounce: _b, ...rest } = value;
      onChange({
        ...rest,
        type: 'spring',
        stiffness: value.stiffness ?? 200,
        damping: value.damping ?? 25,
        mass: value.mass ?? 1,
      });
    }
  };

  const handleUpdate = (key: keyof SpringConfig, val: number) => {
    if (isSimpleMode) {
      const { stiffness: _s, damping: _d, mass: _m, ...rest } = value;
      onChange({ ...rest, [key]: val });
    } else {
      const { visualDuration: _vd, bounce: _b, ...rest } = value;
      onChange({ ...rest, [key]: val });
    }
  };

  // SpringControl renders its controls flat — no Folder wrapper.
  // Grouping/collapsing is handled by the parent (Section in the UI renderer,
  // or the LLM's declarative spec).
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <SpringVisualization spring={value} isSimpleMode={isSimpleMode} />

      <div className="dialkit-labeled-control">
        <span className="dialkit-labeled-control-label">Type</span>
        <SegmentedControl
          options={[
            { value: 'simple' as const, label: 'Time' },
            { value: 'advanced' as const, label: 'Physics' },
          ]}
          value={mode}
          onChange={handleModeChange}
        />
      </div>

      {isSimpleMode ? (
        <>
          <Slider label="Duration" value={value.visualDuration ?? 0.3}
            onChange={(v) => handleUpdate('visualDuration', v)} min={0.1} max={1} step={0.05} />
          <Slider label="Bounce" value={value.bounce ?? 0.2}
            onChange={(v) => handleUpdate('bounce', v)} min={0} max={1} step={0.05} />
        </>
      ) : (
        <>
          <Slider label="Stiffness" value={value.stiffness ?? 400}
            onChange={(v) => handleUpdate('stiffness', v)} min={1} max={1000} step={10} />
          <Slider label="Damping" value={value.damping ?? 17}
            onChange={(v) => handleUpdate('damping', v)} min={1} max={100} step={1} />
          <Slider label="Mass" value={value.mass ?? 1}
            onChange={(v) => handleUpdate('mass', v)} min={0.1} max={10} step={0.1} />
        </>
      )}
    </div>
  );
}
