import { useEffect, useRef } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
}

interface ChatHistoryProps {
  messages: ChatMessage[];
}

export function ChatHistory({ messages }: ChatHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) return null;

  return (
    <div className="chat-history">
      {messages.map(msg => (
        <div key={msg.id} className={`chat-bubble chat-bubble--${msg.role}`}>
          <span className="chat-bubble-text">{msg.content}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
