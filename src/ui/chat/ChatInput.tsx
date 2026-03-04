import { useState, useRef, useEffect } from 'react';
import { GridLoader } from '../components/GridLoader';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  loadingVerb?: string | null;
  placeholder?: string;
  onFocusChange?: (isFocused: boolean) => void;
  hasSelection?: boolean;
  hasControls?: boolean;
  historyOpen?: boolean;
  onHistoryToggle?: () => void;
}

function UpArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AiStarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13.0012 13.002" fill="none">
      <path
        d="M10.6905 9.2432C10.7713 8.92006 11.2308 8.92003 11.3116 9.2432L11.6006 10.4014L12.7588 10.6914C13.0819 10.7723 13.082 11.2308 12.7588 11.3116L11.6006 11.6016L11.3116 12.7598C11.2307 13.0828 10.7714 13.0827 10.6905 12.7598L10.4004 11.6016L9.24222 11.3116C8.91942 11.2306 8.91945 10.7724 9.24222 10.6914L10.4004 10.4014L10.6905 9.2432ZM5.19828 1.47562C5.54897 0.191004 7.32621 0.150871 7.76566 1.3555L7.80375 1.47562L8.60062 4.40043L11.5264 5.19828L11.6465 5.23734C12.8504 5.67716 12.8106 7.45295 11.5264 7.80375L8.60062 8.60062L7.80375 11.5264C7.44185 12.8524 5.56025 12.8523 5.19828 11.5264L4.40043 8.60062L1.47562 7.80375C0.149618 7.44184 0.149604 5.56019 1.47562 5.19828L4.40043 4.40043L5.19828 1.47562ZM6.8389 1.73929C6.74513 1.39545 6.25697 1.39551 6.16312 1.73929L5.21488 5.21488L1.73929 6.16312C1.39541 6.25691 1.39541 6.74512 1.73929 6.8389L5.21488 7.78714L6.16312 11.2627C6.2511 11.585 6.68523 11.6053 6.81644 11.3233L6.8389 11.2627L7.78714 7.78714L11.2627 6.8389C11.6062 6.74492 11.6062 6.2571 11.2627 6.16312L7.78714 5.21488L6.8389 1.73929ZM1.69047 0.242223C1.77143 -0.0806828 2.23073 -0.0807992 2.31156 0.242223L2.60062 1.40043L3.75882 1.69047C4.08198 1.77128 4.082 2.23077 3.75882 2.31156L2.60062 2.60062L2.31156 3.75882C2.23077 4.082 1.77128 4.08198 1.69047 3.75882L1.40043 2.60062L0.242223 2.31156C-0.0807989 2.23073 -0.0806831 1.77143 0.242223 1.69047L1.40043 1.40043L1.69047 0.242223Z"
        fill="currentColor"
      />
    </svg>
  );
}

function HistoryIcon({ active }: { active?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M6.17992 14.7811C6.26325 14.4478 6.73625 14.4478 6.81957 14.7811L7.09985 15.9002L8.21899 16.1805C8.55227 16.2638 8.55227 16.7368 8.21899 16.8201L7.09985 17.1004L6.81957 18.2196C6.73622 18.5528 6.26324 18.5528 6.17992 18.2196L5.89965 17.1004L4.78051 16.8201C4.44726 16.7368 4.4473 16.2639 4.78051 16.1805L5.89965 15.9002L6.17992 14.7811ZM18.5002 15.9998C18.7762 16 19.0001 16.2239 19.0002 16.4998C19.0002 16.7759 18.7762 16.9997 18.5002 16.9998H10.5002C10.2241 16.9998 10.0002 16.776 10.0002 16.4998C10.0003 16.2238 10.2242 15.9998 10.5002 15.9998H18.5002ZM6.17992 9.78108C6.26325 9.4478 6.73625 9.4478 6.81957 9.78108L7.09985 10.9002L8.21899 11.1805C8.55227 11.2638 8.55227 11.7368 8.21899 11.8201L7.09985 12.1004L6.81957 13.2196C6.73622 13.5528 6.26324 13.5528 6.17992 13.2196L5.89965 12.1004L4.78051 11.8201C4.44726 11.7368 4.4473 11.2639 4.78051 11.1805L5.89965 10.9002L6.17992 9.78108ZM18.5002 10.9998C18.7762 11 19.0001 11.2239 19.0002 11.4998C19.0002 11.7759 18.7762 11.9997 18.5002 11.9998H10.5002C10.2241 11.9998 10.0002 11.776 10.0002 11.4998C10.0003 11.2238 10.2242 10.9998 10.5002 10.9998H18.5002ZM6.17992 4.78108C6.26325 4.44783 6.7362 4.44788 6.81957 4.78108L7.09985 5.90022L8.21899 6.1805C8.55227 6.26382 8.55227 6.73682 8.21899 6.82015L7.09985 7.10042L6.81957 8.21956C6.73625 8.55284 6.26324 8.55284 6.17992 8.21956L5.89965 7.10042L4.78051 6.82015C4.4473 6.73677 4.44726 6.26382 4.78051 6.1805L5.89965 5.90022L6.17992 4.78108ZM18.5002 5.99983C18.7762 5.99999 19.0001 6.22388 19.0002 6.49983C19.0002 6.77588 18.7762 6.99967 18.5002 6.99983H10.5002C10.2241 6.99983 10.0002 6.77598 10.0002 6.49983C10.0003 6.22378 10.2242 5.99983 10.5002 5.99983H18.5002Z"
        fill="currentColor"
        fillOpacity={active ? 0.7 : 0.4}
      />
    </svg>
  );
}

export function ChatInput({
  onSubmit,
  disabled = false,
  isLoading = false,
  loadingVerb = null,
  placeholder = 'Describe your edit',
  onFocusChange,
  hasSelection = false,
  hasControls = false,
  historyOpen = false,
  onHistoryToggle,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [isMultiline, setIsMultiline] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    // Measure at the NARROW width (with icon padding) so wrapping is detected
    // before it becomes visible. This prevents oscillation: if text wraps at
    // 68px padding it goes multiline (full width), and at full width it will
    // always have equal or fewer lines, so it can never flip back.
    el.style.height = 'auto';
    el.style.overflowY = 'hidden';
    el.style.paddingRight = '68px';
    el.style.paddingBottom = '0px';
    const narrowHeight = el.scrollHeight;

    const multi = narrowHeight > 30;
    setIsMultiline(multi);

    el.style.paddingRight = multi ? '0px' : '68px';
    el.style.paddingBottom = multi ? '32px' : '0px';
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, 240);
    el.style.height = `${next}px`;
    el.style.overflowY = next >= 240 ? 'auto' : 'hidden';
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
    setIsMultiline(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleActionClick = () => {
    if (hasText) {
      submit();
    } else if (hasSelection && !hasControls && !disabled) {
      onSubmit('/gen');
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const hasText = value.trim().length > 0;
  const canAct = !disabled && (hasText || hasSelection);

  if (isLoading) {
    return (
      <div className="chat-input-box chat-input-box--loading">
        <div className="chat-input-loading-content">
          <GridLoader state="loading" size={16} />
          <span className="chat-input-loading-verb">{loadingVerb ?? 'Thinking'}</span>
        </div>
        <div className="chat-input-actions">
          <button
            className="chat-input-history"
            disabled
            aria-label="History"
          >
            <HistoryIcon />
          </button>
          <button
            className="chat-input-send"
            disabled
            aria-label="Send"
          >
            <UpArrowIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-input-box${isMultiline ? ' chat-input-box--expanded' : ''}`}>
      <textarea
        ref={textareaRef}
        className="chat-input-textarea"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
      />
      <div className="chat-input-actions">
        <button
          className={`chat-input-history${historyOpen ? ' chat-input-history--open' : ''}`}
          onClick={onHistoryToggle}
          aria-label="History"
        >
          <HistoryIcon active={historyOpen} />
        </button>
        <button
          className={`chat-input-send${canAct ? ' chat-input-send--active' : ''}`}
          onClick={handleActionClick}
          disabled={!canAct}
          aria-label={hasText ? 'Send' : 'Generate'}
        >
          {!hasText && hasSelection && !hasControls && !disabled ? <AiStarIcon /> : <UpArrowIcon />}
        </button>
      </div>
    </div>
  );
}
