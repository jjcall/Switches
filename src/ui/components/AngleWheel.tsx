import { useRef, useState, useCallback, useEffect } from 'react';

interface AngleWheelProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

const DIAL_SIZE = 48;
const DIAL_RADIUS = DIAL_SIZE / 2;
const TRACK_RADIUS = 18;
const DOT_RADIUS = 4;

function snapAngle(raw: number, step: number): number {
  return Math.round(raw / step) * step;
}

function decimalsForStep(step: number): number {
  const s = step.toString();
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

export function AngleWheel({
  label,
  value,
  onChange,
  min = -180,
  max = 180,
  step = 1,
}: AngleWheelProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [isValueHovered, setIsValueHovered] = useState(false);
  const [isValueEditable, setIsValueEditable] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const angleRad = ((value - 90) * Math.PI) / 180;
  const dotX = DIAL_RADIUS + Math.cos(angleRad) * TRACK_RADIUS;
  const dotY = DIAL_RADIUS + Math.sin(angleRad) * TRACK_RADIUS;

  const angleFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = dialRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      let degrees = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      if (degrees > 180) degrees -= 360;
      const snapped = snapAngle(degrees, step);
      return Math.max(min, Math.min(max, snapped));
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

  // Editable value hover delay
  useEffect(() => {
    if (isValueHovered && !showInput && !isValueEditable) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsValueEditable(true);
      }, 800);
    } else if (!isValueHovered && !showInput) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setIsValueEditable(false);
    }
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, [isValueHovered, showInput, isValueEditable]);

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
      onChange(snapAngle(clamped, step));
    }
    setShowInput(false);
    setIsValueHovered(false);
    setIsValueEditable(false);
  };

  const handleValueClick = () => {
    if (isValueEditable) {
      setShowInput(true);
      setInputValue(value.toFixed(decimalsForStep(step)));
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleInputSubmit();
    else if (e.key === 'Escape') {
      setShowInput(false);
      setIsValueHovered(false);
    }
  };

  const displayValue = `${value.toFixed(decimalsForStep(step))}°`;
  const isActive = isDragging || isHovered;

  // Tick marks at 0, 90, 180, 270
  const ticks = [0, 90, 180, 270].map((deg) => {
    const r = ((deg - 90) * Math.PI) / 180;
    const inner = TRACK_RADIUS - 3;
    const outer = TRACK_RADIUS + 3;
    return {
      x1: DIAL_RADIUS + Math.cos(r) * inner,
      y1: DIAL_RADIUS + Math.sin(r) * inner,
      x2: DIAL_RADIUS + Math.cos(r) * outer,
      y2: DIAL_RADIUS + Math.sin(r) * outer,
    };
  });

  return (
    <div className="dialkit-angle-control">
      <span className="dialkit-angle-label">{label}</span>
      <div className="dialkit-angle-right">
        <div
          ref={dialRef}
          className={`dialkit-angle-dial ${isActive ? 'dialkit-angle-dial-active' : ''}`}
          style={{ width: DIAL_SIZE, height: DIAL_SIZE }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <svg
            viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
            width={DIAL_SIZE}
            height={DIAL_SIZE}
            className="dialkit-angle-svg"
          >
            {/* Track circle */}
            <circle
              cx={DIAL_RADIUS}
              cy={DIAL_RADIUS}
              r={TRACK_RADIUS}
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="1.5"
            />
            {/* Tick marks */}
            {ticks.map((t, i) => (
              <line
                key={i}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke="rgba(255, 255, 255, 0.15)"
                strokeWidth="1"
                strokeLinecap="round"
              />
            ))}
            {/* Angle line from center to dot */}
            <line
              x1={DIAL_RADIUS}
              y1={DIAL_RADIUS}
              x2={dotX}
              y2={dotY}
              stroke={isActive ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.25)'}
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{ transition: isDragging ? 'none' : 'stroke 0.15s' }}
            />
            {/* Center dot */}
            <circle
              cx={DIAL_RADIUS}
              cy={DIAL_RADIUS}
              r="2"
              fill="rgba(255, 255, 255, 0.3)"
            />
            {/* Handle dot */}
            <circle
              cx={dotX}
              cy={dotY}
              r={DOT_RADIUS}
              fill={isActive ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.6)'}
              style={{ transition: isDragging ? 'none' : 'fill 0.15s' }}
            />
          </svg>
        </div>

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
            className={`dialkit-angle-value ${isValueEditable ? 'dialkit-angle-value-editable' : ''}`}
            onMouseEnter={() => setIsValueHovered(true)}
            onMouseLeave={() => setIsValueHovered(false)}
            onClick={handleValueClick}
            style={{ cursor: isValueEditable ? 'text' : 'default' }}
          >
            {displayValue}
          </span>
        )}
      </div>
    </div>
  );
}
