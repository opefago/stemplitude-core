interface DebuggerStatusPanelProps {
  debugSession: {
    sourceMode?: string;
    activeStepPolicy?: string;
    lastSemanticEvent?: { type?: string } | null;
    highlightedNodeId?: string | null;
    locationLabel?: string | null;
    lineHint?: string | null;
    blockWindow?: {
      previous?: { id?: string; kind?: string; label?: string } | null;
      current?: { id?: string; kind?: string; label?: string } | null;
      next?: { id?: string; kind?: string; label?: string } | null;
    } | null;
    trace?: Array<{
      id: string;
      at: number;
      sourceMode?: string;
      action?: string;
      semanticType?: string | null;
      nodeId?: string | null;
      locationLabel?: string | null;
      callDepth?: number | null;
      runtimeState?: string;
    }>;
  } | null;
  compact?: boolean;
}

function sourceLabel(sourceMode?: string) {
  if (sourceMode === "python") return "Python";
  if (sourceMode === "cpp") return "C++";
  return "Blocks";
}

function actionLabel(action?: string) {
  if (action === "run") return "Run";
  if (action === "step_into") return "Step Into";
  if (action === "step_over") return "Step Over";
  if (action === "step") return "Step";
  if (action === "paused") return "Paused";
  return "Idle";
}

function boundaryLabel(type?: string | null) {
  if (type === "action_progress") return "Action In Progress";
  if (type === "node_executed") return "Node Complete";
  if (type === "call_enter") return "Function Enter";
  if (type === "call_return") return "Function Return";
  if (type === "loop_check") return "Loop Check";
  if (type === "loop_exit") return "Loop Exit";
  if (type === "condition_evaluated") return "Condition Checked";
  if (type === "branch_selected") return "Branch Selected";
  return "--";
}

function rowBoundary(debugSession: DebuggerStatusPanelProps["debugSession"]) {
  return boundaryLabel(debugSession?.lastSemanticEvent?.type);
}

function rowLocation(debugSession: DebuggerStatusPanelProps["debugSession"]) {
  return debugSession?.locationLabel || "--";
}

function blockTitle(kind?: string) {
  if (kind === "move") return "Move";
  if (kind === "turn") return "Turn";
  if (kind === "wait") return "Wait";
  if (kind === "repeat") return "Repeat";
  if (kind === "if") return "If";
  if (kind === "call") return "Call";
  if (kind === "read_sensor") return "Sensor";
  if (kind === "actuator_action") return "Actuator";
  return "Block";
}

function blockTokens(label?: string) {
  if (!label || typeof label !== "string") return [];
  return label
    .replace(/\s*->\s*/g, " -> ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 7);
}

function BlockVisual({
  heading,
  block,
  current = false,
}: {
  heading: string;
  block?: { id?: string; kind?: string; label?: string } | null;
  current?: boolean;
}) {
  const tokens = blockTokens(block?.label);
  return (
    <div className={`robotics-debugger-block-card${current ? " robotics-debugger-block-card--current" : ""}`}>
      <span className="robotics-debugger-block-label">{heading}</span>
      <div className={`robotics-debugger-block-visual kind-${block?.kind || "node"}`}>
        <span className="robotics-debugger-block-kind">{blockTitle(block?.kind)}</span>
        <div className="robotics-debugger-block-fields">
          {tokens.length === 0 ? (
            <span className="robotics-debugger-block-field">--</span>
          ) : (
            tokens.map((token, tokenIndex) => (
              <span key={`${block?.id || heading}_${tokenIndex}_${token}`} className="robotics-debugger-block-field">
                {token}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function DebuggerStatusChips({ debugSession }: { debugSession: DebuggerStatusPanelProps["debugSession"] }) {
  return (
    <div className="robotics-debugger-chips">
      <span className="robotics-runtime-pill robotics-debugger-pill">
        <strong>Source</strong> {sourceLabel(debugSession?.sourceMode)}
      </span>
      <span className="robotics-runtime-pill robotics-debugger-pill">
        <strong>Mode</strong> {actionLabel(debugSession?.activeStepPolicy)}
      </span>
      <span className="robotics-runtime-pill robotics-debugger-pill">
        <strong>Boundary</strong> {rowBoundary(debugSession)}
      </span>
      <span className="robotics-runtime-pill robotics-debugger-pill">
        <strong>Location</strong> {rowLocation(debugSession)}
        {debugSession?.lineHint ? ` (${debugSession.lineHint})` : ""}
      </span>
    </div>
  );
}

export function DebuggerTracePanel({
  debugSession,
  compact = false,
}: {
  debugSession: DebuggerStatusPanelProps["debugSession"];
  compact?: boolean;
}) {
  const trace = Array.isArray(debugSession?.trace) ? debugSession.trace : [];
  return (
    <details className={`robotics-debug-trace${compact ? " robotics-debug-trace--compact" : ""}`}>
      <summary>Debug Trace ({trace.length})</summary>
      {trace.length === 0 ? (
        <div className="robotics-debug-trace-empty">No debug events yet.</div>
      ) : (
        <div className="robotics-debug-trace-list">
          {trace.map((entry) => (
            <div key={entry.id} className={`robotics-debug-trace-row type-${entry.semanticType || "none"}`}>
              <span className="robotics-debug-trace-time">{new Date(entry.at).toLocaleTimeString()}</span>
              <span className="robotics-debug-trace-main">
                {sourceLabel(entry.sourceMode)} / {actionLabel(entry.action)} / {boundaryLabel(entry.semanticType)} /{" "}
                {entry.locationLabel || "--"}
              </span>
              <span className="robotics-debug-trace-depth">depth {entry.callDepth ?? 0}</span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

export function DebuggerStatusPanel({ debugSession, compact = false }: DebuggerStatusPanelProps) {
  const activeMode = debugSession?.activeStepPolicy;
  const sourceMode = debugSession?.sourceMode;
  const visibleInDebug =
    activeMode === "step" || activeMode === "step_into" || activeMode === "step_over";
  if (!visibleInDebug || sourceMode !== "blocks") return null;

  return (
    <div className={`robotics-debugger-panel${compact ? " robotics-debugger-panel--compact" : ""}`}>
      <DebuggerStatusChips debugSession={debugSession} />
      {debugSession?.blockWindow ? (
        <div className="robotics-debugger-block-window">
          <BlockVisual heading="Previous" block={debugSession.blockWindow.previous} />
          <BlockVisual heading="Current" block={debugSession.blockWindow.current} current />
          <BlockVisual heading="Next" block={debugSession.blockWindow.next} />
        </div>
      ) : null}
      <DebuggerTracePanel debugSession={debugSession} compact={compact} />
    </div>
  );
}

