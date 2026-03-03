import { useState, useEffect, useRef } from 'react';

type FlaskState = 'idle' | 'ready' | 'loading' | 'success';

/**
 * Internal phases:
 *  idle     → empty flask
 *  ready    → flat liquid, no waves or bubbles (selection or typing)
 *  filling  → liquid rises with waves + bubbles
 *  settling → waves flatten, color fades blue→green
 *  draining → liquid slides down smoothly out of flask
 */
type Phase = 'idle' | 'ready' | 'filling' | 'settling' | 'draining';

interface FlaskLoaderProps {
  state: FlaskState;
  size?: number;
}

const FLASK_OUTLINE =
  'M29 12C29.552 12 30 12.448 30 13C30 13.552 29.552 14 29 14H28V20.359C28 20.568 28.065 20.771 28.186 20.94L35.555 31.256C36.973 33.241 35.553 36 33.113 36H14.887C12.447 36 11.027 33.241 12.445 31.256L19.813 20.94C19.934 20.771 20 20.568 20 20.359V14H19C18.448 14 18 13.552 18 13C18 12.448 18.448 12 19 12H29ZM22 20.359C22 20.984 21.805 21.594 21.441 22.103L14.072 32.419C13.6 33.081 14.074 34 14.887 34H33.113C33.926 34 34.4 33.081 33.928 32.419L26.559 22.103C26.195 21.594 26 20.984 26 20.359V14H22V20.359Z';

const FLASK_MASK =
  'M22 20.359C22 20.984 21.805 21.594 21.441 22.103L14.072 32.419C13.6 33.081 14.074 34 14.887 34H33.113C33.926 34 34.4 33.081 33.928 32.419L26.559 22.103C26.195 21.594 26 20.984 26 20.359V14H22V20.359Z';

const BLUE = '#3B82F6';
const GREEN = '#14AE5C';
const FLASK_COLOR = 'var(--light-tertiary)';

const BUBBLES = [
  { cx: 13, cy: 19, r: 3 },
  { cx: 35, cy: 21, r: 1 },
  { cx: 34, cy: 16, r: 2 },
];

const WAVE_Y = 25;

function buildWavePath(): string {
  const a = 2.5;
  let d = `M-60,${WAVE_Y}`;
  for (let x = -60; x < 80; x += 12) {
    d += ` Q${x + 3},${WAVE_Y - a} ${x + 6},${WAVE_Y} T${x + 12},${WAVE_Y}`;
  }
  d += ` V100 H-60 Z`;
  return d;
}

function buildFlatPath(): string {
  return `M-60,${WAVE_Y} H80 V100 H-60 Z`;
}

// Pre-compute since WAVE_Y is constant
const WAVE_D = buildWavePath();
const FLAT_D = buildFlatPath();

export function FlaskLoader({ state, size = 48 }: FlaskLoaderProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    if (state === 'loading') {
      setPhase('filling');
    } else if (state === 'success') {
      // 1) Settle: waves flatten, color fades to green
      setPhase('settling');
      // 2) Drain: liquid slides down after settling
      const t = setTimeout(() => setPhase('draining'), 600);
      timersRef.current.push(t);
    } else if (state === 'ready') {
      setPhase('ready');
    } else {
      setPhase('idle');
    }
  }, [state]);

  const showWave = phase === 'filling';
  const showBubbles = phase === 'filling';

  const liquidColor = phase === 'settling' || phase === 'draining' ? GREEN : BLUE;
  const liquidOpacity = phase === 'settling' ? 0.6 : 0.5;

  // The path is always at the filled Y position.
  // Draining is done via CSS translateY on the <g> wrapper.
  const liquidPath = showWave ? WAVE_D : FLAT_D;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flask-loader"
      data-phase={phase}
    >
      <defs>
        <clipPath id="flask-clip">
          <path d={FLASK_MASK} />
        </clipPath>
      </defs>

      {/* Liquid clipped to flask interior */}
      <g clipPath="url(#flask-clip)" className={`flask-liquid-group flask-liquid-group--${phase}`}>
        <g className={`flask-liquid-slide flask-liquid-slide--${phase}`}>
          <path
            className={`flask-liquid-fill flask-liquid-fill--${phase}`}
            d={liquidPath}
            fill={liquidColor}
            fillOpacity={liquidOpacity}
          />
        </g>
      </g>

      {/* Flask outline */}
      <path d={FLASK_OUTLINE} fill={FLASK_COLOR} />

      {/* Bubbles */}
      {showBubbles && BUBBLES.map((b, i) => (
        <circle
          key={i}
          cx={b.cx}
          cy={b.cy}
          r={b.r}
          fill={BLUE}
          fillOpacity={0.5}
          className={`flask-bubble flask-bubble-${i}`}
        />
      ))}
    </svg>
  );
}
