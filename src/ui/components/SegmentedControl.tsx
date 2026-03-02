import { useRef, useState, useLayoutEffect } from 'react';
import { motion } from 'motion/react';

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number } | null>(null);
  const hasAnimated = useRef(false);

  useLayoutEffect(() => {
    const button = buttonRefs.current.get(value);
    const container = containerRef.current;
    if (button && container) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      setPillStyle({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    }
  }, [value]);

  return (
    <div ref={containerRef} className="dialkit-segmented">
      {pillStyle && (
        <motion.div
          className="dialkit-segmented-pill"
          style={{ left: pillStyle.left, width: pillStyle.width }}
          animate={{ left: pillStyle.left, width: pillStyle.width }}
          transition={
            hasAnimated.current
              ? { type: 'spring', visualDuration: 0.2, bounce: 0.15 }
              : { duration: 0 }
          }
          onAnimationComplete={() => { hasAnimated.current = true; }}
        />
      )}
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            ref={(el) => { if (el) buttonRefs.current.set(option.value, el); }}
            onClick={() => onChange(option.value)}
            className="dialkit-segmented-button"
            data-active={String(isActive)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
