interface EmptySearchStateProps {
  query: string;
}

export function EmptySearchState({ query }: EmptySearchStateProps) {
  return (
    <div className="robotics-object-empty-state" role="status">
      <strong>No matching objects for "{query}"</strong>
      <p>Try broader words like wall, line, trigger, goal, or ball.</p>
    </div>
  );
}

