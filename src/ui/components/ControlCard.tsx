import type { ReactNode } from 'react';

interface ControlCardProps {
  label: string;
  connected: boolean;
  children: ReactNode;
}

export function ControlCard({ label, connected, children }: ControlCardProps) {
  return (
    <div className="dialkit-control-card">
      <div className="dialkit-control-header">
        <span className="dialkit-control-label">{label}</span>
        <span
          className={`dialkit-control-status ${connected ? 'dialkit-control-status--on' : 'dialkit-control-status--off'}`}
        />
      </div>
      <div className="dialkit-control-slot">
        {children}
      </div>
    </div>
  );
}
