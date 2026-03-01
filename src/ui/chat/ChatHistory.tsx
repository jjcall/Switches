import { motion, AnimatePresence } from 'motion/react';

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
      <AnimatePresence mode="popLayout">
        {recent.map((msg, i) => (
          <motion.div
            key={msg.id}
            className={`chat-prompt chat-prompt--${msg.role}`}
            layout
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: opacities[i], scale: scales[i], y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -8 }}
            transition={{ type: 'spring', visualDuration: 0.3, bounce: 0.1 }}
          >
            <span className="chat-prompt-text">{msg.content}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
