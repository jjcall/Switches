interface ButtonGroupProps {
  buttons: Array<{
    label: string;
    variant?: 'primary' | 'secondary';
    onClick: () => void;
  }>;
}

export function ButtonGroup({ buttons }: ButtonGroupProps) {
  return (
    <div className="dialkit-button-group">
      {buttons.map((button, index) => (
        <button
          key={index}
          className={`dialkit-button${button.variant === 'secondary' ? ' dialkit-button--secondary' : ''}`}
          onClick={button.onClick}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
