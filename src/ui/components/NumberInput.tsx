import { useState, useRef } from 'react';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

function decimalsForStep(step: number): number {
  const s = step.toString();
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

function clamp(v: number, min?: number, max?: number): number {
  let result = v;
  if (min !== undefined) result = Math.max(min, result);
  if (max !== undefined) result = Math.min(max, result);
  return result;
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
}: NumberInputProps) {
  const decimals = decimalsForStep(step);
  const [raw, setRaw] = useState(value.toFixed(decimals));
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep raw in sync when value changes externally (not while user is typing)
  const prevValueRef = useRef(value);
  if (!isFocused && prevValueRef.current !== value) {
    prevValueRef.current = value;
    setRaw(value.toFixed(decimals));
  }

  function commit(str: string) {
    const parsed = parseFloat(str);
    if (!isNaN(parsed)) {
      const clamped = clamp(parseFloat(parsed.toFixed(decimals)), min, max);
      onChange(clamped);
      setRaw(clamped.toFixed(decimals));
    } else {
      setRaw(value.toFixed(decimals));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commit(raw);
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setRaw(value.toFixed(decimals));
      inputRef.current?.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = clamp(parseFloat((value + step).toFixed(decimals)), min, max);
      onChange(next);
      setRaw(next.toFixed(decimals));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = clamp(parseFloat((value - step).toFixed(decimals)), min, max);
      onChange(next);
      setRaw(next.toFixed(decimals));
    }
  }

  return (
    <div className="dialkit-text-control">
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        className="dialkit-text-input"
        value={raw}
        placeholder={placeholder ?? String(step)}
        onChange={(e) => setRaw(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          commit(raw);
        }}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
