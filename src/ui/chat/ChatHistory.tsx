import { useEffect, useRef } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
}

interface HistoryPanelProps {
  messages: ChatMessage[];
  onSelectPrompt?: (text: string) => void;
}

function HistoryIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24.5 24.4771" fill="none" className={className}>
      <path d="M3.62496 16.8359C3.70845 16.503 4.18206 16.503 4.26559 16.8359L4.94039 19.5361L7.64059 20.2119C7.97387 20.2952 7.97387 20.7682 7.64059 20.8515L4.94039 21.5273L4.26559 24.2275C4.18204 24.5603 3.70847 24.5604 3.62496 24.2275L2.95016 21.5273L0.249963 20.8515C-0.0832152 20.7682-0.0832101 20.2952 0.249963 20.2119L2.95016 19.5361L3.62496 16.8359Z" fill="currentColor" />
      <path d="M3.62496 8.54293C3.70828 8.20964 4.18227 8.20964 4.26559 8.54293L4.94039 11.2431L7.64059 11.9179C7.97387 12.0012 7.97387 12.4752 7.64059 12.5586L4.94039 13.2334L4.26559 15.9336C4.18227 16.2668 3.70828 16.2668 3.62496 15.9336L2.95016 13.2334L0.249963 12.5586C-0.0833211 12.4752-0.0833211 12.0012 0.249963 11.9179L2.95016 11.2431L3.62496 8.54293Z" fill="currentColor" />
      <path d="M3.62496 0.24996C3.70828-0.0833221 4.18226-0.0833179 4.26559 0.24996L4.94039 2.95016L7.64059 3.62496C7.97387 3.70828 7.97387 4.18226 7.64059 4.26558L4.94039 4.94039L4.26559 7.64058C4.18227 7.97387 3.70828 7.97387 3.62496 7.64058L2.95016 4.94039L0.249963 4.26558C-0.0833211 4.18226-0.0833211 3.70828 0.249963 3.62496L2.95016 2.95016L3.62496 0.24996Z" fill="currentColor" />
      <path d="M10.5 4C10.5 3.72386 10.7239 3.5 11 3.5H24C24.2761 3.5 24.5 3.72386 24.5 4C24.5 4.27614 24.2761 4.5 24 4.5H11C10.7239 4.5 10.5 4.27614 10.5 4Z" fill="currentColor" />
      <path d="M10.5 12.5C10.5 12.2239 10.7239 12 11 12H24C24.2761 12 24.5 12.2239 24.5 12.5C24.5 12.7761 24.2761 13 24 13H11C10.7239 13 10.5 12.7761 10.5 12.5Z" fill="currentColor" />
      <path d="M10.5 20.5C10.5 20.2239 10.7239 20 11 20H24C24.2761 20 24.5 20.2239 24.5 20.5C24.5 20.7761 24.2761 21 24 21H11C10.7239 21 10.5 20.7761 10.5 20.5Z" fill="currentColor" />
    </svg>
  );
}

function getRowType(msg: ChatMessage): 'user' | 'error' | 'system' {
  if (msg.role === 'error') return 'error';
  if (msg.content.startsWith('/')) return 'system';
  return 'user';
}

export function HistoryPanel({ messages, onSelectPrompt }: HistoryPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="history-panel">
        <div className="render-zone-empty">
          <HistoryIcon size={24} className="history-empty-icon" />
          <div className="render-zone-empty-info">
            <p className="render-zone-empty-text">No recent prompts.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="history-panel">
      <div className="history-content">
        <div className="history-header">
          <span className="history-header-label">Prompt history</span>
        </div>
        <div className="history-list">
          {messages.map(msg => {
            const type = getRowType(msg);
            const className = `history-row${type !== 'user' ? ` history-row--${type}` : ''}`;
            return (
              <div
                key={msg.id}
                className={className}
                onClick={() => onSelectPrompt?.(msg.content)}
                role={onSelectPrompt ? 'button' : undefined}
                tabIndex={onSelectPrompt ? 0 : undefined}
              >
                {msg.content}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
