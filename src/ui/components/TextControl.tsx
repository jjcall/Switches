interface TextControlProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TextControl({ value, onChange, placeholder }: TextControlProps) {
  return (
    <div className="dialkit-text-control">
      <input
        type="text"
        className="dialkit-text-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
