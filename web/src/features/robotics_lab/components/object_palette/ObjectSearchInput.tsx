interface ObjectSearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function ObjectSearchInput({ value, onChange }: ObjectSearchInputProps) {
  return (
    <label className="robotics-object-palette__search">
      <span>Search Objects</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search wall, line track, goal, trigger..."
      />
    </label>
  );
}

