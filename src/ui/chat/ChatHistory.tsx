export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
}

interface ChatHistoryProps {
  messages: ChatMessage[];
}

const OPACITIES = [0.25, 0.55, 0.9];
const SCALES = [0.9, 0.95, 1];

export function ChatHistory({ messages }: ChatHistoryProps) {
  if (messages.length === 0) return null;

  const recent = messages.slice(-3);
  const opacities = OPACITIES.slice(-recent.length);
  const scales = SCALES.slice(-recent.length);

  return (
    <div className="chat-history">
      {recent.map((msg, i) => (
        <div
          key={msg.id}
          className={`chat-prompt chat-prompt--${msg.role}`}
          style={{
            opacity: opacities[i],
            transform: `scale(${scales[i]})`,
          }}
        >
          <span className="chat-prompt-text">{msg.content}</span>
        </div>
      ))}
    </div>
  );
}
