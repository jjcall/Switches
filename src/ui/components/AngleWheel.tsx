import { useRef, useState, useCallback, useEffect } from 'react';

interface AngleWheelProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

const DIAL_SIZE = 61;
const CENTER = 30.5;
const ARC_RADIUS = 29.5;
const NEEDLE_LENGTH = 24;
const STROKE_WIDTH = 2;
const ARC_SPAN_DEG = 270;
const START_ANGLE = 135; // lower-left (min value)
const DOT_RADIUS_INNER = 23;
const DOT_COUNT = 7;
const DOT_INTERVAL = 45;
const DOTS_FADE_OUT_DELAY = 300;
const SCRUB_SENSITIVITY = 0.5; // value units per pixel
const SCRUB_SHIFT_MULTIPLIER = 10;

// Data URL for the scrub cursor (left-right arrows)
const SCRUB_CURSOR = `url("data:image/svg+xml,%3Csvg width='22' height='19' viewBox='0 0 22 19' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cg filter='url(%23f)'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M2.6 9v.005L8.597 15l.001-3.999h2V15l6-5.999-5.98-6 .001 4.019-2.021.002H8.597L8.598 3 2.6 8.999zm1.411.003L7.598 5.414 7.597 8h3.5h2.521V5.416l3.565 3.586-3.564 3.585.001-2.585H11.097l-3.499-.001.001 2.586-3.587-3.585z' fill='white'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M11.097 10.002h2.521v2.586l3.565-3.586-3.565-3.586v2.606h-2.521H7.597v-2.607l-3.586 3.587 3.586 3.586v-2.587l3.5.001z' fill='black'/%3E%3C/g%3E%3Cdefs%3E%3Cfilter id='f' x='-1' y='-1.6' width='23.2' height='23.2' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'%3E%3CfeFlood flood-opacity='0' result='a'/%3E%3CfeColorMatrix in='SourceAlpha' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0' result='b'/%3E%3CfeOffset dy='1'/%3E%3CfeGaussianBlur stdDeviation='1.3'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .32 0'/%3E%3CfeBlend in2='a' result='c'/%3E%3CfeBlend in='SourceGraphic' in2='c'/%3E%3C/filter%3E%3C/defs%3E%3C/svg%3E") 11 9, ew-resize`;

function snapValue(raw: number, step: number): number {
  return Math.round(raw / step) * step;
}

function decimalsForStep(step: number): number {
  const s = step.toString();
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function polarPoint(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = degToRad(angleDeg);
  return {
    x: CENTER + Math.cos(rad) * radius,
    y: CENTER + Math.sin(rad) * radius,
  };
}

function valueToAngle(val: number, min: number, max: number): number {
  const t = max === min ? 0 : (val - min) / (max - min);
  return START_ANGLE + t * ARC_SPAN_DEG;
}

function angleToValue(angleDeg: number, min: number, max: number): number {
  let a = angleDeg;
  while (a < START_ANGLE) a += 360;
  while (a > START_ANGLE + 360) a -= 360;
  if (a > START_ANGLE + ARC_SPAN_DEG) {
    const distToMax = a - (START_ANGLE + ARC_SPAN_DEG);
    const distToMin = (START_ANGLE + 360) - a;
    a = distToMax < distToMin ? START_ANGLE + ARC_SPAN_DEG : START_ANGLE;
  }
  const t = (a - START_ANGLE) / ARC_SPAN_DEG;
  return min + t * (max - min);
}

function buildArcPath(): string {
  const startPt = polarPoint(START_ANGLE, ARC_RADIUS);
  const endAngle = START_ANGLE + ARC_SPAN_DEG;
  const endPt = polarPoint(endAngle, ARC_RADIUS);
  return `M ${startPt.x} ${startPt.y} A ${ARC_RADIUS} ${ARC_RADIUS} 0 1 1 ${endPt.x} ${endPt.y}`;
}

export function AngleWheel({
  value,
  onChange,
  min = 0,
  max = 360,
  step = 1,
}: AngleWheelProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isValueHovered, setIsValueHovered] = useState(false);
  const [showDots, setShowDots] = useState(false);
  const dotsFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scrub state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [altHeld, setAltHeld] = useState(false);
  const scrubStartXRef = useRef(0);
  const scrubStartValueRef = useRef(0);

  const currentAngle = valueToAngle(value, min, max);
  const needleTip = polarPoint(currentAngle, NEEDLE_LENGTH);

  // Dots: show immediately on drag, fade out with delay after drag ends
  useEffect(() => {
    if (isDragging) {
      if (dotsFadeTimeoutRef.current) {
        clearTimeout(dotsFadeTimeoutRef.current);
        dotsFadeTimeoutRef.current = null;
      }
      setShowDots(true);
    } else {
      dotsFadeTimeoutRef.current = setTimeout(() => {
        setShowDots(false);
      }, DOTS_FADE_OUT_DELAY);
    }
    return () => {
      if (dotsFadeTimeoutRef.current) clearTimeout(dotsFadeTimeoutRef.current);
    };
  }, [isDragging]);

  // Track Alt/Option key globally for scrub cursor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const angleFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = dialRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + CENTER;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const rawDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const rawValue = angleToValue(rawDeg < 0 ? rawDeg + 360 : rawDeg, min, max);
      const snapped = snapValue(rawValue, step);
      const decimals = decimalsForStep(step);
      const rounded = parseFloat(snapped.toFixed(decimals));
      return Math.max(min, Math.min(max, rounded));
    },
    [value, min, max, step],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      onChange(angleFromPointer(e.clientX, e.clientY));
    },
    [onChange, angleFromPointer],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      onChange(angleFromPointer(e.clientX, e.clientY));
    },
    [isDragging, onChange, angleFromPointer],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [showInput]);

  const handleInputSubmit = () => {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(snapValue(clamped, step));
    }
    setShowInput(false);
    setIsValueHovered(false);
  };

  const handleValueClick = () => {
    if (isScrubbing) return;
    setShowInput(true);
    setInputValue(value.toFixed(decimalsForStep(step)));
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleInputSubmit();
    else if (e.key === 'Escape') {
      setShowInput(false);
      setIsValueHovered(false);
    }
  };

  // Scrub handlers for Option+drag on value
  const handleValuePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!e.altKey || showInput) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsScrubbing(true);
      scrubStartXRef.current = e.clientX;
      scrubStartValueRef.current = value;
    },
    [value, showInput],
  );

  const handleValuePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isScrubbing) return;
      const dx = e.clientX - scrubStartXRef.current;
      const multiplier = e.shiftKey ? SCRUB_SHIFT_MULTIPLIER : 1;
      const sensitivity = SCRUB_SENSITIVITY * multiplier * step;
      const raw = scrubStartValueRef.current + dx * sensitivity;
      const snapped = snapValue(raw, step);
      const decimals = decimalsForStep(step);
      const rounded = parseFloat(snapped.toFixed(decimals));
      onChange(Math.max(min, Math.min(max, rounded)));
    },
    [isScrubbing, onChange, min, max, step],
  );

  const handleValuePointerUp = useCallback(() => {
    if (isScrubbing) {
      setIsScrubbing(false);
    }
  }, [isScrubbing]);

  const displayValue = value.toFixed(decimalsForStep(step));

  // Indicator dots at 45° intervals along the arc
  const dots = Array.from({ length: DOT_COUNT }, (_, i) => {
    const angle = START_ANGLE + i * DOT_INTERVAL;
    return polarPoint(angle, DOT_RADIUS_INNER);
  });

  const arcPath = buildArcPath();

  // Value container class — hover and input use same background
  const showValueBg = isValueHovered || showInput;
  const valueContainerClass = [
    'dialkit-dial-value-container',
    showValueBg ? 'dialkit-dial-value-container--active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Cursor for the value area
  const valueCursor = altHeld && !showInput ? SCRUB_CURSOR : showInput ? 'text' : 'default';

  return (
    <div className="dialkit-angle-control" style={{ margin: '0 auto' }}>
      <div
        ref={dialRef}
        className="dialkit-angle-dial"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <svg
          viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
          width={DIAL_SIZE}
          height={DIAL_SIZE}
          className="dialkit-angle-svg"
        >
          {/* Horseshoe arc */}
          <path
            d={arcPath}
            fill="none"
            stroke="var(--dark-tertiary)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />
          {/* Indicator dots — fade in on drag only */}
          <g
            style={{
              opacity: showDots ? 0.5 : 0,
              transition: showDots ? 'opacity 0.5s ease' : 'opacity 0.2s ease',
            }}
          >
            {dots.map((pt, i) => (
              <circle key={i} cx={pt.x} cy={pt.y} r={1} fill="var(--dark-tertiary)" />
            ))}
          </g>
          {/* Needle */}
          <line
            x1={CENTER}
            y1={CENTER}
            x2={needleTip.x}
            y2={needleTip.y}
            stroke="var(--dark-tertiary)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div
        className={valueContainerClass}
        style={{ cursor: valueCursor }}
        onPointerDown={handleValuePointerDown}
        onPointerMove={handleValuePointerMove}
        onPointerUp={handleValuePointerUp}
        onMouseEnter={() => setIsValueHovered(true)}
        onMouseLeave={() => {
          setIsValueHovered(false);
          if (!isScrubbing) setAltHeld(false);
        }}
      >
        {showInput ? (
          <input
            ref={inputRef}
            type="text"
            className="dialkit-angle-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputSubmit}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="dialkit-angle-value"
            onClick={handleValueClick}
          >
            {displayValue}
          </span>
        )}
      </div>
    </div>
  );
}
