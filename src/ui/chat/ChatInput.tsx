import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSubmit,
  disabled = false,
  isLoading = false,
  placeholder = 'Describe your idea…',
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.overflowY = 'hidden';
    const next = Math.min(el.scrollHeight, 240);
    el.style.height = `${next}px`;
    el.style.overflowY = next >= 240 ? 'auto' : 'hidden';
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
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

  return (
    <div className={`chat-input-box${isLoading ? ' chat-input-box--loading' : ''}`}>
      {isLoading ? (
        <div className="chat-input-loading">
          <div className="chat-input-spinner" />
          <span>Working…</span>
        </div>
      ) : (
        <>
          <textarea
            ref={textareaRef}
            className="chat-input-textarea"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
          />
          <div className="chat-input-toolbar">
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
        </>
      )}
    </div>
  );
}
