const _UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Curriculum ``labs.id`` values are UUIDs; launcher slugs are not. */
export function isCurriculumLabUuid(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  return _UUID_RE.test(value.trim());
}

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
    /** Curriculum ``labs.id`` UUID when assignment is tied to a catalog lab. */
    curriculumLabId?: string;
    /** Optional saved project (``projects.id``) for this lab type. */
    savedProjectId?: string;
    /** Classroom meeting provider — forwarded so the lab can show built-in video. */
    meetingProvider?: string;
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
  if (opts.curriculumLabId) params.set("curriculum_lab_id", opts.curriculumLabId);
  if (opts.savedProjectId) params.set("saved_project_id", opts.savedProjectId);
  if (opts.meetingProvider) params.set("meeting_provider", opts.meetingProvider);
  return `${match.route}?${params.toString()}`;
}
