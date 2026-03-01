import { useState, useRef, useEffect, useCallback } from 'react';
import { HexColorPicker } from 'react-colorful';

interface ColorControlProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

function expandShorthandHex(hex: string): string {
  if (hex.length !== 4) return hex;
  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
}

export function ColorControl({ label, value, onChange }: ColorControlProps) {
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
        <div className="dialkit-color-picker-popover">
          <HexColorPicker color={normalizedValue} onChange={handlePickerChange} />
        </div>
      )}
    </div>
  );
}
