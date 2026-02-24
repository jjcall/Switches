import { createRoot } from 'react-dom/client';
import { useState, useEffect, useRef } from 'react';
// useRef still needed for lastHeight tracking in useAutoResize
import '../styles/plugin.css';
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
} from './components';
import type { SpringConfig } from './components';

const PLUGIN_WIDTH = 300;
const MIN_HEIGHT = 120;
// No artificial cap — Figma enforces its own maximum based on screen size.
// Our content is ~700px with Spring open; capping at 680 was clipping it.
const MAX_HEIGHT = 2000;

// Resizes the plugin window to match content.
// Uses MutationObserver to detect DOM changes, then reads offsetHeight
// on #root's first child. figma.ui.resize() expects CSS pixels and maps
// 1:1 to the iframe viewport regardless of devicePixelRatio.
function useAutoResize() {
  const lastHeight = useRef(-1);

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    const sendResize = () => {
      const content = root.firstElementChild as HTMLElement | null;
      if (!content) return;
      const height = content.offsetHeight;
      if (height === lastHeight.current) return;
      lastHeight.current = height;
      const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height));
      parent.postMessage({ pluginMessage: { type: 'resize', width: PLUGIN_WIDTH, height: clamped } }, '*');
    };

    // MutationObserver catches all DOM changes: children added/removed (folder toggle),
    // attribute changes (style updates from controls). We debounce slightly with rAF
    // to batch multiple mutations into a single measurement.
    let pending = false;
    const mo = new MutationObserver(() => {
      if (!pending) {
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          sendResize();
        });
      }
    });
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    sendResize();
    return () => mo.disconnect();
  }, []);
}

// Test harness — verifies all components render and interact correctly.
// Will be replaced by the real plugin shell in Task 4.
function App() {
  useAutoResize();

  const [opacityVal, setOpacityVal] = useState(0.5);
  const [blurVal, setBlurVal] = useState(6);
  const [toggleVal, setToggleVal] = useState(false);
  const [selectVal, setSelectVal] = useState('center');
  const [colorVal, setColorVal] = useState('#7B61FF');
  const [textVal, setTextVal] = useState('');
  const [numVal, setNumVal] = useState(8);
  const [segVal, setSegVal] = useState<'a' | 'b'>('a');
  const [spring, setSpring] = useState<SpringConfig>({
    type: 'spring',
    visualDuration: 0.3,
    bounce: 0.2,
  });

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Component test harness
        </div>

        <Slider label="Opacity" value={opacityVal} onChange={setOpacityVal} min={0} max={1} step={0.01} />
        <Slider label="Blur" value={blurVal} onChange={setBlurVal} min={0} max={20} step={0.5} />

        <Toggle label="Visible" checked={toggleVal} onChange={setToggleVal} />

        <div className="dialkit-labeled-control">
          <span className="dialkit-labeled-control-label">Mode</span>
          <SegmentedControl
            options={[{ value: 'a' as const, label: 'Auto' }, { value: 'b' as const, label: 'Fixed' }]}
            value={segVal}
            onChange={setSegVal}
          />
        </div>

        <Select
          label="Align"
          value={selectVal}
          options={['left', 'center', 'right', 'justify']}
          onChange={setSelectVal}
        />

        <ColorSwatch label="Fill" value={colorVal} onChange={setColorVal} />

        <TextInput label="Name" value={textVal} onChange={setTextVal} placeholder="Layer name" />

        <NumberInput label="Spacing" value={numVal} onChange={setNumVal} min={0} max={64} step={1} />

        <Section title="Spring" defaultOpen={false}>
          <SpringEditor label="Easing" value={spring} onChange={setSpring} />
        </Section>

        {/* Buttons in a row — side-by-side for short actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="dialkit-button"
            style={{ flex: 1 }}
            onClick={() => console.log('apply', { opacityVal, blurVal, toggleVal, selectVal, colorVal, numVal, spring })}
          >
            Apply
          </button>
          <button
            className="dialkit-button"
            style={{ flex: 1 }}
            onClick={() => { setOpacityVal(0.5); setBlurVal(6); setNumVal(8); }}
          >
            Reset
          </button>
        </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
