const DEBUG_TRACE_LIMIT = 12;

export function resolveDebugSourceMode(mode) {
  if (mode === "python" || mode === "cpp") return mode;
  return "blocks";
}

export function resolveDebugActionLabel(policy, explicitAction) {
  if (typeof explicitAction === "string" && explicitAction.trim()) return explicitAction.trim();
  if (policy === "step_into") return "step_into";
  if (policy === "step_over") return "step_over";
  return "step";
}

export function createInitialDebugSession(mode = "blocks") {
  return {
    sourceMode: resolveDebugSourceMode(mode),
    activeStepPolicy: "idle",
    lastSemanticEvent: null,
    highlightedNodeId: null,
    locationLabel: null,
    lineHint: null,
    blockWindow: null,
    runtimeState: "idle",
    trace: [],
  };
}

function deriveLineHint(sourceMode, highlightedNodeId) {
  if ((sourceMode !== "python" && sourceMode !== "cpp") || typeof highlightedNodeId !== "string") return null;
  const match = highlightedNodeId.match(/^txt_(\d+)$/);
  if (!match) return null;
  return `Line ${Number(match[1]) + 1}`;
}

function baseNodeId(nodeId) {
  if (typeof nodeId !== "string") return "";
  const queueMarker = nodeId.indexOf("__q");
  const returnMarker = nodeId.indexOf("__return");
  const cut = [queueMarker, returnMarker].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return cut >= 0 ? nodeId.slice(0, cut) : nodeId;
}

function sanitizeNodeId(nodeId) {
  if (typeof nodeId !== "string" || !nodeId.trim()) return null;
  const cleaned = nodeId.replace(/[^\w:-]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.length > 36 ? `${cleaned.slice(0, 36)}...` : cleaned;
}

function resolveLocationLabel(sourceMode, nodeId, nodeLabels) {
  const baseId = baseNodeId(nodeId);
  if (nodeLabels && typeof nodeLabels.get === "function") {
    const mapped = nodeLabels.get(baseId);
    if (mapped) return mapped;
  }
  if (sourceMode === "python" || sourceMode === "cpp") {
    const match = baseId.match(/^txt_(\d+)$/);
    if (match) return `Line ${Number(match[1]) + 1}`;
  }
  const sanitized = sanitizeNodeId(baseId);
  if (sanitized) return `Step ${sanitized}`;
  return "Current step";
}

function resolveBlockWindow(sourceMode, nodeId, nodeSequence, nodeLabels) {
  if (sourceMode !== "blocks" || !Array.isArray(nodeSequence) || nodeSequence.length === 0) return null;
  const baseId = baseNodeId(nodeId);
  const index = nodeSequence.findIndex((entry) => entry?.id === baseId);
  if (index < 0) return null;
  const toBlock = (entry) => {
    if (!entry) return null;
    const label =
      entry.label ||
      (nodeLabels && typeof nodeLabels.get === "function" ? nodeLabels.get(entry.id) : null) ||
      `Step ${entry.id}`;
    return {
      id: entry.id,
      kind: entry.kind || "node",
      label,
    };
  };
  const previous = index > 0 ? toBlock(nodeSequence[index - 1]) : null;
  const current = toBlock(nodeSequence[index]);
  const next = index < nodeSequence.length - 1 ? toBlock(nodeSequence[index + 1]) : null;
  return { previous, current, next };
}

function createTraceEntry(sourceMode, action, result, nodeLabels) {
  const semanticEvent = result?.semanticEvent || null;
  const nodeId = result?.highlightedNodeId || semanticEvent?.nodeId || null;
  if (!semanticEvent && !nodeId) return null;
  const locationLabel = resolveLocationLabel(sourceMode, nodeId, nodeLabels);
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    at: Date.now(),
    sourceMode,
    action,
    semanticType: semanticEvent?.type || null,
    nodeId,
    locationLabel,
    callDepth: semanticEvent?.callDepth ?? null,
    runtimeState: result?.state || "idle",
    detail: semanticEvent?.detail || null,
  };
}

export function nextDebugSession(
  previous,
  { mode, action, result, resetTrace = false, nodeLabels = null, nodeSequence = null },
) {
  const sourceMode = resolveDebugSourceMode(mode);
  const traceSeed = resetTrace ? [] : Array.isArray(previous?.trace) ? previous.trace : [];
  const traceEntry = createTraceEntry(sourceMode, action, result, nodeLabels);
  const trace = traceEntry ? [traceEntry, ...traceSeed].slice(0, DEBUG_TRACE_LIMIT) : traceSeed;
  const highlightedNodeId = result?.highlightedNodeId || previous?.highlightedNodeId || null;
  const locationLabel = resolveLocationLabel(sourceMode, highlightedNodeId, nodeLabels);
  const blockWindow = resolveBlockWindow(sourceMode, highlightedNodeId, nodeSequence, nodeLabels);
  return {
    sourceMode,
    activeStepPolicy: action || previous?.activeStepPolicy || "idle",
    lastSemanticEvent: result?.semanticEvent || previous?.lastSemanticEvent || null,
    highlightedNodeId,
    locationLabel,
    lineHint: deriveLineHint(sourceMode, highlightedNodeId),
    blockWindow,
    runtimeState: result?.state || previous?.runtimeState || "idle",
    trace,
  };
}

