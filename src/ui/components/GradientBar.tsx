import { useState, useRef, useEffect, useCallback } from 'react';
import { HexColorPicker } from 'react-colorful';

export interface GradientStop {
  id: string;
  position: number;
  color: string;
}

interface GradientBarProps {
  label: string;
  value: GradientStop[];
  onChange: (value: GradientStop[]) => void;
  minStops?: number;
  maxStops?: number;
}

const HANDLE_SIZE = 16;
const REMOVE_THRESHOLD = 40;

function sortStops(stops: GradientStop[]): GradientStop[] {
  return [...stops].sort((a, b) => a.position - b.position);
}

function buildGradientCSS(stops: GradientStop[]): string {
  const sorted = sortStops(stops);
  const parts = sorted.map(s => `${s.color} ${s.position * 100}%`);
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

function interpolateColor(stops: GradientStop[], position: number): string {
  const sorted = sortStops(stops);
  if (sorted.length === 0) return '#888888';
  if (position <= sorted[0].position) return sorted[0].color;
  if (position >= sorted[sorted.length - 1].position) return sorted[sorted.length - 1].color;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (position >= sorted[i].position && position <= sorted[i + 1].position) {
      const t = (position - sorted[i].position) / (sorted[i + 1].position - sorted[i].position);
      return lerpHex(sorted[i].color, sorted[i + 1].color, t);
    }
  }
  return sorted[0].color;
}

function lerpHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

let stopCounter = 0;

export function GradientBar({
  value,
  onChange,
  minStops = 2,
  maxStops = 8,
}: GradientBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const didDrag = useRef(false);

  const sorted = sortStops(value);
  const gradientCSS = buildGradientCSS(sorted);

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

  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      if (value.length >= maxStops) return;
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect) return;
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const color = interpolateColor(value, position);
      const id = `stop${++stopCounter}`;
      onChange(sortStops([...value, { id, position, color }]));
      setSelectedId(id);
    },
    [value, onChange, maxStops],
  );

  const handleHandlePointerDown = useCallback(
    (e: React.PointerEvent, stopId: string) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDraggingId(stopId);
      dragStartX.current = e.clientX;
      dragStartY.current = e.clientY;
      didDrag.current = false;
      setSelectedId(stopId);
    },
    [],
  );

  const handleHandlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingId) return;
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect) return;

      const dx = Math.abs(e.clientX - dragStartX.current);
      const dy = Math.abs(e.clientY - dragStartY.current);

      if (dx > 3 || dy > 3) didDrag.current = true;

      if (dy > REMOVE_THRESHOLD && value.length > minStops) {
        const next = value.filter(s => s.id !== draggingId);
        onChange(sortStops(next));
        setDraggingId(null);
        if (selectedId === draggingId) {
          setSelectedId(null);
          setPickerOpen(false);
        }
        return;
      }

      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const next = value.map(s => s.id === draggingId ? { ...s, position } : s);
      onChange(sortStops(next));
    },
    [draggingId, value, onChange, minStops, selectedId],
  );

  const handleHandlePointerUp = useCallback(() => {
    if (draggingId && !didDrag.current) {
      if (selectedId === draggingId && pickerOpen) {
        setPickerOpen(false);
      } else {
        setPickerOpen(true);
      }
    }
    setDraggingId(null);
  }, [draggingId, selectedId, pickerOpen]);

  const handlePickerChange = useCallback(
    (color: string) => {
      if (!selectedId) return;
      const next = value.map(s => s.id === selectedId ? { ...s, color } : s);
      onChange(sortStops(next));
    },
    [selectedId, value, onChange],
  );

  const selectedStop = value.find(s => s.id === selectedId);
  const selectedNormalized = selectedStop?.color?.length === 4
    ? `#${selectedStop.color[1]}${selectedStop.color[1]}${selectedStop.color[2]}${selectedStop.color[2]}${selectedStop.color[3]}${selectedStop.color[3]}`
    : (selectedStop?.color?.slice(0, 7) ?? '#000000');

  return (
    <div className="dialkit-gradient-control" ref={wrapperRef}>
      <div
        ref={barRef}
        className="dialkit-gradient-bar"
        style={{ background: gradientCSS }}
        onClick={handleBarClick}
      />
      <div
        className="dialkit-gradient-handles"
        onPointerMove={handleHandlePointerMove}
        onPointerUp={handleHandlePointerUp}
      >
        {sorted.map(stop => (
          <div
            key={stop.id}
            className={`dialkit-gradient-handle ${selectedId === stop.id ? 'dialkit-gradient-handle--selected' : ''}`}
            style={{
              left: `calc(${stop.position * 100}% - ${HANDLE_SIZE / 2}px)`,
              backgroundColor: stop.color,
            }}
            onPointerDown={(e) => handleHandlePointerDown(e, stop.id)}
          />
        ))}
      </div>
      {pickerOpen && selectedStop && (
        <div className="dialkit-gradient-picker-popover">
          <HexColorPicker color={selectedNormalized} onChange={handlePickerChange} />
        </div>
      )}
    </div>
  );
}
