import type { ReactNode } from 'react';

interface ControlCardProps {
  label: string;
  connected?: boolean;
  children: ReactNode;
}

export function ControlCard({ label, children }: ControlCardProps) {
  return (
    <div className="dialkit-control-card">
      <div className="dialkit-control-header">
        <span className="dialkit-control-label">{label}</span>
      </div>
      <div className="dialkit-control-slot">
        {children}
      </div>
    </div>
  );
}
