import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Slider,
  Toggle,
  SegmentedControl,
  Select,
  Section,
  ColorSwatch,
  Button,
  NumberInput,
  Dial,
  CubePreview,
  ControlCard,
  TextInput,
} from '../ui/components';
import '../styles/plugin.css';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#2C2C2C',
      borderRadius: 'var(--radius-md)',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      <div style={{
        fontSize: 'var(--font-size-xs)',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SliderDemo() {
  const [value, setValue] = useState(0.5);
  return (
    <Card title="Slider">
      <ControlCard label="Opacity" connected={true}>
        <Slider label="Opacity" value={value} onChange={setValue} />
      </ControlCard>
      <ControlCard label="Scale" connected={false}>
        <Slider label="Scale" value={value * 100} onChange={v => setValue(v / 100)} min={0} max={100} step={1} />
      </ControlCard>
    </Card>
  );
}

function ToggleDemo() {
  const [checked, setChecked] = useState(true);
  return (
    <Card title="Toggle">
      <ControlCard label="Visible" connected={true}>
        <Toggle label="Visible" checked={checked} onChange={setChecked} />
      </ControlCard>
    </Card>
  );
}

function SegmentedControlDemo() {
  const [value, setValue] = useState<'left' | 'center' | 'right'>('left');
  return (
    <Card title="SegmentedControl">
      <ControlCard label="Alignment" connected={true}>
        <SegmentedControl
          options={[
            { value: 'left' as const, label: 'Left' },
            { value: 'center' as const, label: 'Center' },
            { value: 'right' as const, label: 'Right' },
          ]}
          value={value}
          onChange={setValue}
        />
      </ControlCard>
    </Card>
  );
}

function SelectDemo() {
  const [value, setValue] = useState('ease');
  return (
    <Card title="Select">
      <ControlCard label="Easing" connected={true}>
        <Select
          label="Easing"
          value={value}
          options={['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out']}
          onChange={setValue}
        />
      </ControlCard>
    </Card>
  );
}

function NumberInputDemo() {
  const [value, setValue] = useState(42);
  return (
    <Card title="NumberInput">
      <ControlCard label="Count" connected={true}>
        <NumberInput label="Count" value={value} onChange={setValue} min={0} max={100} step={1} />
      </ControlCard>
    </Card>
  );
}

function TextInputDemo() {
  const [value, setValue] = useState('Hello world');
  return (
    <Card title="TextInput">
      <ControlCard label="Name" connected={false}>
        <TextInput label="Name" value={value} onChange={setValue} placeholder="Enter text..." />
      </ControlCard>
    </Card>
  );
}

function DialDemo() {
  const [value, setValue] = useState(45);
  return (
    <Card title="Dial">
      <ControlCard label="Rotation" connected={true}>
        <Dial label="Rotation" value={value} onChange={setValue} />
      </ControlCard>
    </Card>
  );
}

function DialRowDemo() {
  const [rx, setRx] = useState(30);
  const [ry, setRy] = useState(45);
  return (
    <Card title="Dial Row (half-width)">
      <div className="dialkit-control-row">
        <ControlCard label="Rotate X" connected={true}>
          <Dial label="Rotate X" value={rx} onChange={setRx} />
        </ControlCard>
        <ControlCard label="Rotate Y" connected={true}>
          <Dial label="Rotate Y" value={ry} onChange={setRy} />
        </ControlCard>
      </div>
    </Card>
  );
}

function ColorSwatchDemo() {
  const [fill, setFill] = useState<string>('#3B82F6');
  const [gradient, setGradient] = useState<Record<string, string>>({ start: '#3B82F6', end: '#E53E3E' });
  return (
    <Card title="ColorSwatch">
      <ControlCard label="Fill" connected={true}>
        <ColorSwatch label="Color" value={fill} onChange={(v) => setFill(v as string)} />
      </ControlCard>
      <ControlCard label="Gradient" connected={true}>
        <ColorSwatch
          label="Gradient"
          value={gradient}
          colors={[
            { id: 'start', label: 'Start', defaultValue: '#3B82F6' },
            { id: 'end', label: 'End', defaultValue: '#E53E3E' },
          ]}
          onChange={(v) => setGradient(v as Record<string, string>)}
        />
      </ControlCard>
    </Card>
  );
}

function CubePreviewDemo() {
  const [rx, setRx] = useState(25);
  const [ry, setRy] = useState(35);
  return (
    <CubePreview rx={rx} ry={ry} onRotate={(newRx, newRy) => { setRx(newRx); setRy(newRy); }} />
  );
}

function SectionDemo() {
  const [slider, setSlider] = useState(0.7);
  const [toggle, setToggle] = useState(false);
  return (
    <Card title="Section">
      <Section title="Transform">
        <ControlCard label="Amount" connected={true}>
          <Slider label="Amount" value={slider} onChange={setSlider} />
        </ControlCard>
        <ControlCard label="Enabled" connected={false}>
          <Toggle label="Enabled" checked={toggle} onChange={setToggle} />
        </ControlCard>
      </Section>
    </Card>
  );
}

function ButtonDemo() {
  const [last, setLast] = useState('(none)');
  return (
    <Card title="Button">
      <Button buttons={[
        { label: 'Apply changes', onClick: () => setLast('Apply') },
        { label: 'Reset', variant: 'secondary', onClick: () => setLast('Reset') },
      ]} />
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
        Last clicked: {last}
      </div>
    </Card>
  );
}

function App() {
  return (
    <div style={{
      padding: '24px',
      maxWidth: '720px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      fontFamily: 'var(--font-family)',
    }}>
      <h1 style={{
        fontSize: '16px',
        fontWeight: 600,
        color: 'var(--text-primary)',
        margin: '0 0 8px 0',
      }}>
        Component Preview
      </h1>

      {/* Inputs */}
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
        Inputs
      </div>
      <SliderDemo />
      <ToggleDemo />
      <SegmentedControlDemo />
      <SelectDemo />
      <NumberInputDemo />
      <TextInputDemo />
      <DialDemo />
      <DialRowDemo />
      <ColorSwatchDemo />

      {/* Visualization */}
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginTop: '8px' }}>
        Visualization
      </div>
      <CubePreviewDemo />

      {/* Layout */}
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginTop: '8px' }}>
        Layout
      </div>
      <SectionDemo />
      <ButtonDemo />
    </div>
  );
}

const root = createRoot(document.getElementById('preview-root')!);
root.render(<App />);
