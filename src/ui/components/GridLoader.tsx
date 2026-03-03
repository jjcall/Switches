import { useState, useEffect, useRef } from 'react';

type LoaderState = 'idle' | 'loading' | 'success';

/**
 * Internal phases:
 *  drawing  → grid lines draw themselves in (optional)
 *  idle     → grid visible, nothing highlighted
 *  tracing  → blue pulse travels along the grid path
 *  filling  → grid lines turn green segment by segment
 *  complete → all grid lines green
 */
type Phase = 'drawing' | 'idle' | 'tracing' | 'filling' | 'complete';

interface GridLoaderProps {
  state: LoaderState;
  size?: number;
  animateLines?: boolean;
}

const DRAW_DURATION_MS = 400;

// 6 line segments that form the grid (outer edges + center cross)
const GRID_LINES = [
  { x1: 0, y1: 0.5, x2: 25, y2: 0.5 },     // top
  { x1: 0, y1: 24.5, x2: 25, y2: 24.5 },    // bottom
  { x1: 0.5, y1: 0, x2: 0.5, y2: 25 },      // left
  { x1: 24.5, y1: 0, x2: 24.5, y2: 25 },    // right
  { x1: 12.5, y1: 0, x2: 12.5, y2: 25 },    // vertical center
  { x1: 0, y1: 12.5, x2: 25, y2: 12.5 },    // horizontal center
];

// Continuous path tracing through the grid for the loading pulse.
// Traces: outer perimeter clockwise, then the center cross.
// Total length ≈ 100 + 50 = 150 units.
const TRACE_PATH =
  'M 0.5,0.5 L 24.5,0.5 L 24.5,24.5 L 0.5,24.5 L 0.5,0.5' +  // outer box (100)
  ' M 12.5,0.5 L 12.5,24.5' +                                    // vertical center (24)
  ' M 0.5,12.5 L 24.5,12.5';                                     // horizontal center (24)
const TRACE_TOTAL = 148;
const PULSE_LENGTH = 30;

// Segments for the success fill animation (index into GRID_LINES)
const FILL_ORDER = [0, 4, 5, 2, 3, 1]; // top, v-center, h-center, left, right, bottom
const FILL_STAGGER_MS = 80;

export function GridLoader({ state, size = 48, animateLines = false }: GridLoaderProps) {
  const skipDraw = !animateLines;
  const [phase, setPhase] = useState<Phase>(skipDraw ? 'idle' : 'drawing');
  const [gridDrawn, setGridDrawn] = useState(skipDraw);
  const [greenLines, setGreenLines] = useState<Set<number>>(new Set());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasDrawnRef = useRef(skipDraw);

  useEffect(() => {
    if (hasDrawnRef.current) return;
    hasDrawnRef.current = true;
    const t = setTimeout(() => {
      setGridDrawn(true);
      setPhase('idle');
    }, DRAW_DURATION_MS);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!gridDrawn) return;

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setGreenLines(new Set());

    if (state === 'loading') {
      setPhase('tracing');
    } else if (state === 'success') {
      setPhase('filling');
      FILL_ORDER.forEach((lineIdx, i) => {
        const t = setTimeout(() => {
          setGreenLines(prev => new Set([...prev, lineIdx]));
        }, (i + 1) * FILL_STAGGER_MS);
        timersRef.current.push(t);
      });
      const completeDelay = (FILL_ORDER.length + 1) * FILL_STAGGER_MS;
      const t2 = setTimeout(() => setPhase('complete'), completeDelay);
      timersRef.current.push(t2);
    } else {
      setPhase('idle');
    }

    return () => { timersRef.current.forEach(clearTimeout); };
  }, [state, gridDrawn]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 25 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="grid-loader"
      shapeRendering="crispEdges"
      data-phase={phase}
    >
      {/* Base grid lines */}
      {GRID_LINES.map((line, i) => (
        <line
          key={`grid-line-${i}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={
            (phase === 'filling' || phase === 'complete') && greenLines.has(i)
              ? 'var(--accent-green)'
              : 'var(--dark-tertiary)'
          }
          strokeWidth={1}
          className={animateLines ? `grid-loader-line ${gridDrawn ? 'grid-loader-line--drawn' : ''}` : undefined}
          style={{
            ...(animateLines ? { animationDelay: `${i * 40}ms` } : {}),
            transition: greenLines.has(i) ? 'stroke 0.15s ease' : undefined,
          }}
        />
      ))}

      {/* Tracing pulse — blue line segment traveling the grid path */}
      {phase === 'tracing' && (
        <path
          d={TRACE_PATH}
          fill="none"
          stroke="var(--accent-blue)"
          strokeWidth={1}
          strokeDasharray={`${PULSE_LENGTH} ${TRACE_TOTAL - PULSE_LENGTH}`}
          strokeDashoffset={0}
          shapeRendering="auto"
          className="grid-loader-pulse"
        />
      )}
    </svg>
  );
}
