import { motion, AnimatePresence } from 'motion/react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
}

interface ChatHistoryProps {
  messages: ChatMessage[];
}

export function ChatHistory({ messages }: ChatHistoryProps) {
  if (messages.length === 0) return null;

  const msg = messages[messages.length - 1];

  return (
    <div className="chat-history">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={msg.id}
          className={`chat-prompt chat-prompt--${msg.role}`}
          layout
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -8 }}
          transition={{ type: 'spring', visualDuration: 0.2, bounce: 0.1 }}
        >
          <span className="chat-prompt-text">{msg.content}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
