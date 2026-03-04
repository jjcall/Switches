import { useRef, useState, useCallback, useEffect } from 'react';

interface CurveEditorProps {
  label: string;
  value: [number, number, number, number];
  onChange: (value: [number, number, number, number]) => void;
}

const SVG_SIZE = 200;

function toSvg(nx: number, ny: number): { x: number; y: number } {
  return {
    x: nx * SVG_SIZE,
    y: (1 - ny) * SVG_SIZE,
  };
}

function fromSvg(sx: number, sy: number): { x: number; y: number } {
  return {
    x: sx / SVG_SIZE,
    y: 1 - sy / SVG_SIZE,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function snapToGrid(v: number, step: number): number {
  return Math.round(v / step) * step;
}

type DragHandle = 'p1' | 'p2' | null;

export function CurveEditor({ value, onChange }: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragHandle, setDragHandle] = useState<DragHandle>(null);

  const [x1, y1, x2, y2] = value;

  const start = toSvg(0, 0);
  const end = toSvg(1, 1);
  const p1 = toSvg(x1, y1);
  const p2 = toSvg(x2, y2);

  const curvePath = `M ${start.x} ${start.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${end.x} ${end.y}`;

  const gridValues = [0, 0.25, 0.5, 0.75, 1];

  const pointerToValue = useCallback(
    (e: PointerEvent | React.PointerEvent, shiftSnap: boolean) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * SVG_SIZE;
      const sy = ((e.clientY - rect.top) / rect.height) * SVG_SIZE;
      let { x, y } = fromSvg(sx, sy);
      x = clamp(x, 0, 1);
      y = clamp(y, -0.5, 1.5);
      if (shiftSnap) {
        x = snapToGrid(x, 0.05);
        y = snapToGrid(y, 0.05);
      }
      return { x: parseFloat(x.toFixed(3)), y: parseFloat(y.toFixed(3)) };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, handle: DragHandle) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragHandle(handle);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragHandle) return;
      const v = pointerToValue(e, e.shiftKey);
      if (!v) return;
      if (dragHandle === 'p1') {
        onChange([v.x, v.y, x2, y2]);
      } else {
        onChange([x1, y1, v.x, v.y]);
      }
    },
    [dragHandle, pointerToValue, x1, y1, x2, y2, onChange],
  );

  const handlePointerUp = useCallback(() => {
    setDragHandle(null);
  }, []);

  return (
    <div className="dialkit-curve-control">
      <div className="dialkit-curve-area">
        <svg
          ref={svgRef}
          className="dialkit-curve-svg"
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Grid lines */}
          {gridValues.map(v => {
            const h = toSvg(0, v);
            const hEnd = toSvg(1, v);
            const vLine = toSvg(v, 0);
            const vEnd = toSvg(v, 1);
            return (
              <g key={v}>
                <line x1={h.x} y1={h.y} x2={hEnd.x} y2={hEnd.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                <line x1={vLine.x} y1={vLine.y} x2={vEnd.x} y2={vEnd.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              </g>
            );
          })}

          {/* Diagonal baseline (dashed) */}
          <line
            x1={start.x} y1={start.y} x2={end.x} y2={end.y}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />

          {/* Tangent lines */}
          <line x1={start.x} y1={start.y} x2={p1.x} y2={p1.y} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
          <line x1={end.x} y1={end.y} x2={p2.x} y2={p2.y} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />

          {/* Bezier curve */}
          <path d={curvePath} fill="none" stroke="var(--accent-blue)" strokeWidth={2} />

          {/* Start/end anchor dots */}
          <circle cx={start.x} cy={start.y} r={3} fill="rgba(255,255,255,0.4)" />
          <circle cx={end.x} cy={end.y} r={3} fill="rgba(255,255,255,0.4)" />

          {/* Control point handles */}
          <circle
            cx={p1.x} cy={p1.y} r={4}
            fill="var(--accent-blue)"
            stroke="var(--dark-base)"
            strokeWidth={1}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => handlePointerDown(e, 'p1')}
          />
          <circle
            cx={p2.x} cy={p2.y} r={4}
            fill="var(--accent-blue)"
            stroke="var(--dark-base)"
            strokeWidth={1}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => handlePointerDown(e, 'p2')}
          />
        </svg>
      </div>
    </div>
  );
}
