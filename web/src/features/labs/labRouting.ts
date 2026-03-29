const LAB_ALIASES: Array<{ id: string; route: string; aliases: string[] }> = [
  { id: "circuit-maker", route: "/playground/circuit-maker", aliases: ["circuit maker", "circuit-maker"] },
  { id: "micro-maker", route: "/playground/micro-maker", aliases: ["micro maker", "micro-maker"] },
  { id: "gamedev", route: "/playground/gamedev", aliases: ["game dev", "gamedev", "game-dev"] },
  { id: "python-game", route: "/playground/python-game", aliases: ["python game", "python-game"] },
  { id: "game-maker", route: "/playground/game-maker", aliases: ["game maker", "game-maker"] },
  { id: "design-maker", route: "/playground/design-maker", aliases: ["design maker", "design-maker"] },
];

export function resolveLabRoute(labNameOrId: string): { id: string; route: string } | null {
  const normalized = labNameOrId.trim().toLowerCase();
  const found = LAB_ALIASES.find(
    (entry) => entry.id === normalized || entry.aliases.includes(normalized),
  );
  return found ? { id: found.id, route: found.route } : null;
}

export function buildLabLaunchPath(
  labNameOrId: string,
  opts: {
    classroomId?: string;
    sessionId?: string;
    referrer?: string;
    assignmentId?: string;
  } = {},
): string {
  const match = resolveLabRoute(labNameOrId);
  if (!match) return `/app/labs?lab=${encodeURIComponent(labNameOrId)}`;
  const params = new URLSearchParams();
  params.set("lab", match.id);
  if (opts.referrer) params.set("referrer", opts.referrer);
  if (opts.classroomId) params.set("classroom_id", opts.classroomId);
  if (opts.sessionId) params.set("session_id", opts.sessionId);
  if (opts.assignmentId) params.set("assignment_id", opts.assignmentId);
  return `${match.route}?${params.toString()}`;
}
