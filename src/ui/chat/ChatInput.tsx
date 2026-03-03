import { useState, useRef, useEffect } from 'react';
import { GridLoader } from '../components/GridLoader';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  loadingVerb?: string | null;
  placeholder?: string;
  onFocusChange?: (isFocused: boolean) => void;
}

export function ChatInput({
  onSubmit,
  disabled = false,
  isLoading = false,
  loadingVerb = null,
  placeholder = 'Describe your edit',
  onFocusChange,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [isMultiline, setIsMultiline] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.overflowY = 'hidden';
    const next = Math.min(el.scrollHeight, 240);
    el.style.height = `${next}px`;
    el.style.overflowY = next >= 240 ? 'auto' : 'hidden';
    setIsMultiline(el.scrollHeight > 30);
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = !disabled && value.trim().length > 0;

  if (isLoading) {
    return (
      <div className="chat-input-box chat-input-box--loading">
        <div className="chat-input-loading-content">
          <GridLoader state="loading" size={16} />
          <span className="chat-input-loading-verb">{loadingVerb ?? 'Thinking'}</span>
        </div>
        <button
          className="chat-input-send"
          disabled
          aria-label="Send"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
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
      <button
        className={`chat-input-send${canSend ? ' chat-input-send--active' : ''}`}
        onClick={submit}
        disabled={!canSend}
        aria-label="Send"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
