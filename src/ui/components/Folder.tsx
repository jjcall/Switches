import { useState, ReactNode } from 'react';

interface FolderProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

// Instant show/hide — no height animation.
// The plugin window resize IS the visual feedback.
// Animated height (Framer Motion spring or CSS grid transition)
// conflicts with figma.ui.resize() because the measurement
// and the visual transition can't stay in sync across the iframe
// boundary. Instant toggle eliminates that entirely.
export function Folder({ title, children, defaultOpen = true, onOpenChange }: FolderProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className="dialkit-folder">
      <div className="dialkit-folder-header" onClick={handleToggle}>
        <div className="dialkit-folder-header-top">
          <div className="dialkit-folder-title-row">
            <span className="dialkit-folder-title">{title}</span>
          </div>
          <svg
            className="dialkit-folder-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s ease' }}
          >
            <path d="M6 9.5L12 15.5L18 9.5" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="dialkit-folder-inner">{children}</div>
      )}
    </div>
  );
}
