import { useState, useRef, useEffect, useCallback } from 'react';
import { HexColorPicker } from 'react-colorful';

interface ColorStop {
  id: string;
  label: string;
  defaultValue?: string;
}

interface ColorControlProps {
  label: string;
  value: string | Record<string, string>;
  onChange: (value: string | Record<string, string>) => void;
  colors?: ColorStop[];
}

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

function expandShorthandHex(hex: string): string {
  if (hex.length !== 4) return hex;
  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
}

// Single color row
function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing) setEditValue(value);
  }, [value, isEditing]);

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pickerOpen]);

  const popoverRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || !wrapperRef.current) return;
    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    const popoverHeight = node.offsetHeight + 8;
    const scrollParent = wrapperRef.current.closest('.render-zone');
    const bottomEdge = scrollParent
      ? scrollParent.getBoundingClientRect().bottom
      : window.innerHeight;
    const spaceBelow = bottomEdge - wrapperRect.bottom;
    if (spaceBelow < popoverHeight) {
      node.classList.add('dialkit-color-picker-popover--flip');
    }
    node.style.visibility = 'visible';
  }, []);

  function handleTextSubmit() {
    setIsEditing(false);
    if (HEX_COLOR_REGEX.test(editValue)) {
      onChange(expandShorthandHex(editValue));
    } else {
      setEditValue(value);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleTextSubmit();
    else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(value);
    }
  }

  const handlePickerChange = useCallback((color: string) => {
    onChange(color);
  }, [onChange]);

  const normalizedValue = value.length === 4 ? expandShorthandHex(value) : value.slice(0, 7);

  return (
    <div className="dialkit-color-control-wrapper" ref={wrapperRef}>
      <div className="dialkit-color-control">
        <span className="dialkit-color-label">{label}</span>
        <div className="dialkit-color-inputs">
          {isEditing ? (
            <input
              type="text"
              className="dialkit-color-hex-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleTextSubmit}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          ) : (
            <span className="dialkit-color-hex" onClick={() => setIsEditing(true)}>
              {(value ?? '').toUpperCase()}
            </span>
          )}
          <button
            className="dialkit-color-swatch"
            style={{ backgroundColor: value }}
            onClick={() => setPickerOpen(!pickerOpen)}
            title="Pick color"
          />
        </div>
      </div>
      {pickerOpen && (
        <div ref={popoverRef} className="dialkit-color-picker-popover">
          <HexColorPicker color={normalizedValue} onChange={handlePickerChange} />
        </div>
      )}
    </div>
  );
}

export function ColorControl({ label, value, onChange, colors }: ColorControlProps) {
  // Multi-color mode: colors prop defines multiple stops
  if (colors && colors.length > 0) {
    const values = (typeof value === 'object' && value !== null ? value : {}) as Record<string, string>;

    return (
      <>
        {colors.map((stop) => (
          <ColorRow
            key={stop.id}
            label={stop.label}
            value={values[stop.id] ?? stop.defaultValue ?? '#000000'}
            onChange={(v) => {
              const next = { ...values, [stop.id]: v };
              onChange(next);
            }}
          />
        ))}
      </>
    );
  }

  // Single color mode
  const singleValue = typeof value === 'string' ? value : '#000000';
  return (
    <ColorRow
      label={label}
      value={singleValue}
      onChange={(v) => onChange(v)}
    />
  );
}
