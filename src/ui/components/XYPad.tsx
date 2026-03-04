import { useRef, useState, useCallback, useEffect } from 'react';

interface XYPadProps {
  label: string;
  value: { x: number; y: number };
  onChange: (value: { x: number; y: number }) => void;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  stepX?: number;
  stepY?: number;
}

const PAD_HEIGHT = 182;
const INSET = 16;

function snap(val: number, step: number): number {
  return Math.round(val / step) * step;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function XYPad({
  value,
  onChange,
  minX = -100,
  maxX = 100,
  minY = -100,
  maxY = 100,
  stepX = 1,
  stepY = 1,
}: XYPadProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const valueToPixel = useCallback(
    (vx: number, vy: number, rect: { width: number; height: number }) => {
      const tx = (vx - minX) / (maxX - minX);
      const ty = (vy - minY) / (maxY - minY);
      return {
        px: tx * rect.width,
        py: (1 - ty) * rect.height,
      };
    },
    [minX, maxX, minY, maxY],
  );

  const pixelToValue = useCallback(
    (px: number, py: number, rect: DOMRect) => {
      const tx = clamp((px - rect.left) / rect.width, 0, 1);
      const ty = clamp(1 - (py - rect.top) / rect.height, 0, 1);
      const rawX = minX + tx * (maxX - minX);
      const rawY = minY + ty * (maxY - minY);
      return {
        x: clamp(snap(rawX, stepX), minX, maxX),
        y: clamp(snap(rawY, stepY), minY, maxY),
      };
    },
    [minX, maxX, minY, maxY, stepX, stepY],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      const rect = padRef.current?.getBoundingClientRect();
      if (rect) onChange(pixelToValue(e.clientX, e.clientY, rect));
    },
    [onChange, pixelToValue],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const rect = padRef.current?.getBoundingClientRect();
      if (rect) onChange(pixelToValue(e.clientX, e.clientY, rect));
    },
    [isDragging, onChange, pixelToValue],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const padWidth = padRef.current?.offsetWidth ?? 236;
  const { px: cursorX, py: cursorY } = valueToPixel(value.x, value.y, {
    width: padWidth,
    height: PAD_HEIGHT,
  });

  const gridLines25X = padWidth * 0.25;
  const gridLines75X = padWidth * 0.75;
  const gridLines25Y = PAD_HEIGHT * 0.25;
  const gridLines75Y = PAD_HEIGHT * 0.75;
  const centerX = padWidth * 0.5;
  const centerY = PAD_HEIGHT * 0.5;
  const axisLeft = INSET;
  const axisRight = padWidth - INSET;
  const axisTop = INSET;
  const axisBottom = PAD_HEIGHT - INSET;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="dialkit-xypad-control">
      <div
        ref={padRef}
        className="dialkit-xypad-area"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <svg
          className="dialkit-xypad-svg"
          viewBox={`0 0 ${mounted ? padWidth : 236} ${PAD_HEIGHT}`}
          width="100%"
          height={PAD_HEIGHT}
          preserveAspectRatio="none"
        >
          {/* Outer grid lines (faint) */}
          <line x1={gridLines25X} y1={0} x2={gridLines25X} y2={PAD_HEIGHT} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <line x1={gridLines75X} y1={0} x2={gridLines75X} y2={PAD_HEIGHT} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <line x1={0} y1={gridLines25Y} x2={padWidth} y2={gridLines25Y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <line x1={0} y1={gridLines75Y} x2={padWidth} y2={gridLines75Y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

          {/* Center cross / axes (brighter) */}
          <line x1={centerX} y1={axisTop} x2={centerX} y2={axisBottom} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
          <line x1={axisLeft} y1={centerY} x2={axisRight} y2={centerY} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />

          {/* Cursor: outer ring */}
          <circle
            cx={cursorX}
            cy={cursorY}
            r={7}
            fill="none"
            stroke="var(--accent-blue)"
            strokeWidth={1.5}
          />
          {/* Cursor: inner dot */}
          <circle
            cx={cursorX}
            cy={cursorY}
            r={5}
            fill="var(--accent-blue)"
            fillOpacity={0.3}
            stroke="none"
          />
        </svg>

        {/* Axis labels */}
        <span className="dialkit-xypad-label dialkit-xypad-label--top">+Y</span>
        <span className="dialkit-xypad-label dialkit-xypad-label--bottom">-</span>
        <span className="dialkit-xypad-label dialkit-xypad-label--left">-</span>
        <span className="dialkit-xypad-label dialkit-xypad-label--right">+X</span>
      </div>
    </div>
  );
}
