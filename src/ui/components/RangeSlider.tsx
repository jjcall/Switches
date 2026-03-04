import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';

interface RangeSliderProps {
  label: string;
  value: { low: number; high: number };
  onChange: (value: { low: number; high: number }) => void;
  min?: number;
  max?: number;
  step?: number;
}

function decimalsForStep(step: number): number {
  const s = step.toString();
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

function roundValue(val: number, step: number): number {
  const raw = Math.round(val / step) * step;
  return parseFloat(raw.toFixed(decimalsForStep(step)));
}

type DragTarget = 'low' | 'high' | null;

export function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: RangeSliderProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const wrapperRectRef = useRef<DOMRect | null>(null);

  const lowPct = ((value.low - min) / (max - min)) * 100;
  const highPct = ((value.high - min) / (max - min)) * 100;

  const lowMotion = useMotionValue(lowPct);
  const highMotion = useMotionValue(highPct);
  const fillLeft = useTransform(lowMotion, (pct) => `${pct}%`);
  const fillWidth = useTransform([lowMotion, highMotion], ([lo, hi]: number[]) => `${hi - lo}%`);
  const lowHandleLeft = useTransform(lowMotion, (pct) => `max(0px, calc(${pct}% - 1.5px))`);
  const highHandleLeft = useTransform(highMotion, (pct) => `max(0px, calc(${pct}% - 1.5px))`);

  const isActive = isHovered || dragTarget !== null;

  useEffect(() => {
    if (!dragTarget) {
      lowMotion.jump(lowPct);
      highMotion.jump(highPct);
    }
  }, [lowPct, highPct, dragTarget, lowMotion, highMotion]);

  const positionToValue = useCallback(
    (clientX: number) => {
      const rect = wrapperRectRef.current;
      if (!rect) return min;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return min + pct * (max - min);
    },
    [min, max],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      if (wrapperRef.current) {
        wrapperRectRef.current = wrapperRef.current.getBoundingClientRect();
      }
      const clickVal = positionToValue(e.clientX);
      const distLow = Math.abs(clickVal - value.low);
      const distHigh = Math.abs(clickVal - value.high);
      const target: DragTarget = distLow <= distHigh ? 'low' : 'high';
      setDragTarget(target);

      const snapped = roundValue(clickVal, step);
      if (target === 'low') {
        const clamped = Math.max(min, Math.min(value.high, snapped));
        onChange({ low: clamped, high: value.high });
        lowMotion.jump(((clamped - min) / (max - min)) * 100);
      } else {
        const clamped = Math.max(value.low, Math.min(max, snapped));
        onChange({ low: value.low, high: clamped });
        highMotion.jump(((clamped - min) / (max - min)) * 100);
      }
    },
    [positionToValue, value, min, max, step, onChange, lowMotion, highMotion],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragTarget) return;
      const rawVal = positionToValue(e.clientX);
      const snapped = roundValue(rawVal, step);
      if (dragTarget === 'low') {
        const clamped = Math.max(min, Math.min(value.high, snapped));
        onChange({ low: clamped, high: value.high });
        lowMotion.jump(((clamped - min) / (max - min)) * 100);
      } else {
        const clamped = Math.max(value.low, Math.min(max, snapped));
        onChange({ low: value.low, high: clamped });
        highMotion.jump(((clamped - min) / (max - min)) * 100);
      }
    },
    [dragTarget, positionToValue, value, min, max, step, onChange, lowMotion, highMotion],
  );

  const handlePointerUp = useCallback(() => {
    setDragTarget(null);
  }, []);

  const fillBackground = isActive ? 'var(--light-overlay)' : 'var(--light-overlay-hover)';
  const handleOpacity = isActive ? 0.5 : 0;
  const decimals = decimalsForStep(step);
  const displayLow = value.low.toFixed(decimals);
  const displayHigh = value.high.toFixed(decimals);

  const discreteSteps = (max - min) / step;
  const hashMarks = discreteSteps <= 10
    ? Array.from({ length: discreteSteps - 1 }, (_, i) => {
        const pct = ((i + 1) * step) / (max - min) * 100;
        return <div key={i} className="dialkit-slider-hashmark" style={{ left: `${pct}%` }} />;
      })
    : Array.from({ length: 9 }, (_, i) => {
        const pct = (i + 1) * 10;
        return <div key={i} className="dialkit-slider-hashmark" style={{ left: `${pct}%` }} />;
      });

  return (
    <div ref={wrapperRef} className="dialkit-range-wrapper">
      <div
        className={`dialkit-range ${isActive ? 'dialkit-slider-active' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="dialkit-slider-hashmarks">{hashMarks}</div>

        <motion.div
          className="dialkit-range-fill"
          style={{ left: fillLeft, width: fillWidth, background: fillBackground, transition: 'background 0.15s' }}
        />

        <motion.div
          className="dialkit-range-handle"
          style={{ left: lowHandleLeft, y: '-50%' }}
          animate={{ opacity: handleOpacity }}
          transition={{ duration: 0.15 }}
        />
        <motion.div
          className="dialkit-range-handle"
          style={{ left: highHandleLeft, y: '-50%' }}
          animate={{ opacity: handleOpacity }}
          transition={{ duration: 0.15 }}
        />

        <span className="dialkit-range-values">
          {displayLow} – {displayHigh}
        </span>
      </div>
    </div>
  );
}
