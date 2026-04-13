import { useEffect, useMemo, useState } from "react";
import {
  createGamificationGoal,
  deleteGamificationGoal,
  listGamificationGoals,
  simulateLabEvent,
  type GamificationGoal,
  type GoalReward,
} from "../../lib/api/gamification";
import { KidDropdown } from "../../components/ui";

type NodeKind = "group" | "action";
type GroupOp = "sequence" | "all" | "any";

type PuzzleNode = {
  id: string;
  kind: NodeKind;
  title: string;
  group_op?: GroupOp;
  event_type?: string;
  context: Array<{ key: string; value: string }>;
  children: PuzzleNode[];
};

type PaletteItem =
  | { kind: "group"; label: string; group_op: GroupOp }
  | { kind: "action"; label: string; event_type: string };

type GraphLayoutNode = {
  id: string;
  node: PuzzleNode;
  x: number;
  y: number;
  depth: number;
  parentId: string | null;
};

type GraphLayoutEdge = {
  from: string;
  to: string;
};

const LABS = [
  { value: "circuit-maker", label: "Circuit Maker" },
  { value: "design-maker", label: "Design Maker (3D)" },
  { value: "micro-maker", label: "Micro Maker (MCU)" },
  { value: "robotics-lab", label: "Robotics Lab" },
  { value: "python-game", label: "Python Game Maker" },
  { value: "game-maker", label: "Game Maker" },
];

const LAB_EVENTS: Record<string, { value: string; label: string }[]> = {
  "circuit-maker": [
    { value: "OBJECT_CONNECTED", label: "Object connected" },
    { value: "CIRCUIT_COMPLETE", label: "Circuit complete" },
    { value: "OBJECT_ERROR", label: "Object error" },
  ],
  "design-maker": [
    { value: "OBJECT_CREATED", label: "Object created" },
    { value: "OBJECT_TRANSFORMED", label: "Object transformed" },
    { value: "MODEL_COMPLETE", label: "Model complete" },
  ],
  "micro-maker": [
    { value: "SENSOR_CONNECTED", label: "Sensor connected" },
    { value: "CODE_DEPLOYED", label: "Code deployed" },
    { value: "PROGRAM_COMPLETE", label: "Program complete" },
  ],
  "robotics-lab": [
    { value: "RUN_STARTED", label: "Run started" },
    { value: "RUN_COMPLETED", label: "Run completed" },
    { value: "MISSION_COMPLETED", label: "Mission completed" },
  ],
  "python-game": [
    { value: "SCRIPT_RUN", label: "Script run" },
    { value: "LEVEL_COMPLETE", label: "Level complete" },
    { value: "BUG_FIXED", label: "Bug fixed" },
  ],
  "game-maker": [
    { value: "SCENE_BUILT", label: "Scene built" },
    { value: "LOGIC_CONNECTED", label: "Logic connected" },
    { value: "GAME_COMPLETE", label: "Game complete" },
  ],
};

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function defaultAction(eventType: string): PuzzleNode {
  return {
    id: newId(),
    kind: "action",
    title: "Action",
    event_type: eventType,
    context: [],
    children: [],
  };
}

function defaultGroup(groupOp: GroupOp): PuzzleNode {
  return {
    id: newId(),
    kind: "group",
    title: "Group",
    group_op: groupOp,
    context: [],
    children: [],
  };
}

function mapDragItemToNode(item: PaletteItem): PuzzleNode {
  return item.kind === "group"
    ? defaultGroup(item.group_op)
    : defaultAction(item.event_type);
}

function nodeKindLabel(item: PaletteItem): string {
  if (item.kind === "group") {
    if (item.group_op === "sequence") return "Flow";
    if (item.group_op === "all") return "Logic";
    return "Choice";
  }
  return "Trigger";
}

function findNodeById(nodes: PuzzleNode[], targetId: string): PuzzleNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    if (node.children.length) {
      const found = findNodeById(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

function buildGraphLayout(nodes: PuzzleNode[]): {
  nodes: GraphLayoutNode[];
  edges: GraphLayoutEdge[];
  width: number;
  height: number;
} {
  const outNodes: GraphLayoutNode[] = [];
  const outEdges: GraphLayoutEdge[] = [];
  let cursorY = 40;
  let maxDepth = 0;
  let maxY = 0;
  const X_STEP = 250;
  const Y_STEP = 130;

  const walk = (
    node: PuzzleNode,
    depth: number,
    parentId: string | null,
  ): number => {
    maxDepth = Math.max(maxDepth, depth);
    let y = cursorY;
    if (node.children.length === 0) {
      y = cursorY;
      cursorY += Y_STEP;
    } else {
      const childYs = node.children.map((child) => walk(child, depth + 1, node.id));
      y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
    }
    const x = 40 + depth * X_STEP;
    maxY = Math.max(maxY, y);
    outNodes.push({ id: node.id, node, x, y, depth, parentId });
    if (parentId) outEdges.push({ from: parentId, to: node.id });
    return y;
  };

  nodes.forEach((root) => walk(root, 0, null));
  return {
    nodes: outNodes,
    edges: outEdges,
    width: Math.max(800, (maxDepth + 1) * X_STEP + 220),
    height: Math.max(380, maxY + 160),
  };
}

function collectEvents(nodes: PuzzleNode[]): string[] {
  const out = new Set<string>();
  const walk = (list: PuzzleNode[]) => {
    list.forEach((node) => {
      if (node.kind === "action" && node.event_type) out.add(node.event_type);
      if (node.children.length) walk(node.children);
    });
  };
  walk(nodes);
  return Array.from(out);
}

function updateNodeTree(
  nodes: PuzzleNode[],
  targetId: string,
  updater: (node: PuzzleNode) => PuzzleNode,
): PuzzleNode[] {
  return nodes.map((node) => {
    if (node.id === targetId) return updater(node);
    if (!node.children.length) return node;
    return { ...node, children: updateNodeTree(node.children, targetId, updater) };
  });
}

function appendToParent(nodes: PuzzleNode[], parentId: string, child: PuzzleNode): PuzzleNode[] {
  return updateNodeTree(nodes, parentId, (node) => ({
    ...node,
    children: [...node.children, child],
  }));
}

function removeNode(nodes: PuzzleNode[], targetId: string): PuzzleNode[] {
  return nodes
    .filter((node) => node.id !== targetId)
    .map((node) =>
      node.children.length
        ? { ...node, children: removeNode(node.children, targetId) }
        : node,
    );
}

function serializeGraph(nodes: PuzzleNode[]): unknown {
  const serializeNode = (node: PuzzleNode): Record<string, unknown> => ({
    id: node.id,
    kind: node.kind,
    title: node.title,
    group_op: node.group_op,
    event_type: node.event_type,
    context: node.context
      .filter((pair) => pair.key.trim())
      .reduce<Record<string, string>>((acc, pair) => {
        acc[pair.key.trim()] = pair.value;
        return acc;
      }, {}),
    children: node.children.map(serializeNode),
  });
  return {
    kind: "puzzle_graph",
    version: 1,
    root: nodes.map(serializeNode),
  };
}

export function GamificationPuzzleBuilder() {
  const [labType, setLabType] = useState("circuit-maker");
  const [goalName, setGoalName] = useState("Light an LED");
  const [goalDescription, setGoalDescription] = useState("");
  const [rewardType, setRewardType] = useState<"points" | "reward">("points");
  const [rewardPoints, setRewardPoints] = useState(10);
  const [rewardKind, setRewardKind] = useState<"badge" | "hi-five" | "sticker" | "custom">("badge");
  const [badgeSlug, setBadgeSlug] = useState("circuit_rookie");
  const [nodes, setNodes] = useState<PuzzleNode[]>([]);
  const [goals, setGoals] = useState<GamificationGoal[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [simulateContextJson, setSimulateContextJson] = useState("{}");
  const [simulateEventType, setSimulateEventType] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [simulateResult, setSimulateResult] = useState<{
    matched: number;
    points: number;
  } | null>(null);

  const eventOptions = LAB_EVENTS[labType] ?? [];
  const eventsInGraph = useMemo(() => collectEvents(nodes), [nodes]);
  const graphLayout = useMemo(() => buildGraphLayout(nodes), [nodes]);
  const selectedNode = useMemo(
    () => (selectedNodeId ? findNodeById(nodes, selectedNodeId) : null),
    [nodes, selectedNodeId],
  );

  const palette: PaletteItem[] = useMemo(
    () => [
      { kind: "group", label: "Sequence Group", group_op: "sequence" },
      { kind: "group", label: "All Conditions Group", group_op: "all" },
      { kind: "group", label: "Any Conditions Group", group_op: "any" },
      ...eventOptions.map((evt) => ({
        kind: "action" as const,
        label: `Action: ${evt.label}`,
        event_type: evt.value,
      })),
    ],
    [eventOptions],
  );

  useEffect(() => {
    if (!simulateEventType) {
      setSimulateEventType(eventOptions[0]?.value ?? "");
    }
  }, [eventOptions, simulateEventType]);

  useEffect(() => {
    if (!nodes.length) {
      setSelectedNodeId(null);
      return;
    }
    if (!selectedNodeId || !findNodeById(nodes, selectedNodeId)) {
      setSelectedNodeId(nodes[0].id);
    }
  }, [nodes, selectedNodeId]);

  const refreshGoals = async () => {
    setLoadingGoals(true);
    try {
      const list = await listGamificationGoals({ lab_type: labType });
      setGoals(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load goals.");
    } finally {
      setLoadingGoals(false);
    }
  };

  useEffect(() => {
    void refreshGoals();
    setNodes([]);
    setSimulateResult(null);
  }, [labType]);

  const onPaletteDragStart = (event: React.DragEvent, item: PaletteItem) => {
    event.dataTransfer.setData("application/x-puzzle-item", JSON.stringify(item));
  };

  const addRootNodeFromPalette = (item: PaletteItem) => {
    const node = mapDragItemToNode(item);
    setNodes((prev) => [...prev, node]);
    setSelectedNodeId(node.id);
  };

  const addChildNodeFromPalette = (item: PaletteItem) => {
    if (!selectedNodeId) {
      addRootNodeFromPalette(item);
      return;
    }
    const node = mapDragItemToNode(item);
    setNodes((prev) => appendToParent(prev, selectedNodeId, node));
    setSelectedNodeId(node.id);
  };

  const onDropNode = (event: React.DragEvent, parentId?: string) => {
    event.preventDefault();
    try {
      const raw = event.dataTransfer.getData("application/x-puzzle-item");
      if (!raw) return;
      const item = JSON.parse(raw) as PaletteItem;
      const node = mapDragItemToNode(item);
      setNodes((prev) => (parentId ? appendToParent(prev, parentId, node) : [...prev, node]));
    } catch {
      // no-op
    }
  };

  const handleCreate = async () => {
    setError("");
    if (!goalName.trim()) {
      setError("Goal name is required.");
      return;
    }
    if (!nodes.length) {
      setError("Add at least one puzzle block to the canvas.");
      return;
    }
    const events = collectEvents(nodes);
    if (!events.length) {
      setError("At least one action block is required.");
      return;
    }
    const reward: GoalReward =
      rewardType === "points"
        ? { type: "points", value: Math.max(1, rewardPoints) }
        : { type: "reward", reward_kind: rewardKind, badge_slug: badgeSlug || undefined };
    setSaving(true);
    try {
      await createGamificationGoal({
        lab_type: labType,
        name: goalName.trim(),
        description: goalDescription.trim(),
        event_map: { events, context_match: {} },
        conditions: [serializeGraph(nodes) as Record<string, unknown>],
        reward,
        is_active: true,
      });
      setNodes([]);
      setSimulateResult(null);
      await refreshGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal.");
    } finally {
      setSaving(false);
    }
  };

  const handleSimulate = async () => {
    setError("");
    setSimulateResult(null);
    try {
      const context = JSON.parse(simulateContextJson || "{}") as Record<string, unknown>;
      const result = await simulateLabEvent({
        lab_id: "preview-lab",
        lab_type: labType,
        event_type: simulateEventType || eventOptions[0]?.value || "",
        context,
      });
      setSimulateResult({
        matched: result.matched_goals.length,
        points: result.points_awarded_total,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed.");
    }
  };

  const removeNodeAndSelection = (id: string) => {
    setNodes((prev) => removeNode(prev, id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  return (
    <div className="tenant-settings__support-card">
      <h3 className="tenant-settings__support-title">Gamification Automation Builder</h3>
      <p className="tenant-settings__panel-desc">
        Build rules like modern automation tools: pick a trigger, add checks, and choose reward output.
      </p>
      <div className="puzzle-builder__steps">
        <div className="puzzle-builder__step">
          <span>1</span>
          Trigger student action
        </div>
        <div className="puzzle-builder__step">
          <span>2</span>
          Add checks (all / any / sequence)
        </div>
        <div className="puzzle-builder__step">
          <span>3</span>
          Set reward + simulate
        </div>
      </div>

      <div className="puzzle-builder__meta">
        <div className="tenant-settings__field">
          <label>Lab</label>
          <KidDropdown
            value={labType}
            onChange={setLabType}
            fullWidth
            ariaLabel="Lab type"
            options={LABS}
          />
        </div>
        <div className="tenant-settings__field">
          <label>Goal name</label>
          <input
            className="tenant-settings__input tenant-settings__input--wide"
            value={goalName}
            onChange={(event) => setGoalName(event.target.value)}
          />
        </div>
        <div className="tenant-settings__field">
          <label>Description</label>
          <input
            className="tenant-settings__input tenant-settings__input--wide"
            value={goalDescription}
            onChange={(event) => setGoalDescription(event.target.value)}
          />
        </div>
      </div>

      <div className="puzzle-builder">
        <div className="puzzle-builder__palette">
          <h4>Blocks Library</h4>
          {palette.map((item, index) => (
            <div
              key={`${item.kind}-${index}-${item.label}`}
              className="puzzle-palette__item"
              draggable
              onDragStart={(event) => onPaletteDragStart(event, item)}
            >
              <div className="puzzle-palette__head">
                <span className="puzzle-palette__badge">{nodeKindLabel(item)}</span>
                <div className="puzzle-palette__actions">
                  <button
                    type="button"
                    className="tenant-settings__secondary-btn"
                    onClick={() => addRootNodeFromPalette(item)}
                  >
                    Root
                  </button>
                  <button
                    type="button"
                    className="tenant-settings__secondary-btn"
                    onClick={() => addChildNodeFromPalette(item)}
                    disabled={!selectedNodeId}
                    title={selectedNodeId ? "Add as child of selected node" : "Select a node first"}
                  >
                    Child
                  </button>
                </div>
              </div>
              <div>{item.label}</div>
            </div>
          ))}
          <p className="tenant-settings__panel-desc" style={{ marginTop: 8 }}>
            Tip: drag blocks into group blocks to nest advanced logic.
          </p>
        </div>

        <div
          className="puzzle-builder__canvas"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => onDropNode(event)}
        >
          <h4>Node Graph Canvas</h4>
          {nodes.length === 0 ? (
            <div className="puzzle-builder__empty">
              Start by adding a Trigger block, then add Logic blocks for checks.
            </div>
          ) : (
            <div className="puzzle-graph">
              <svg
                className="puzzle-graph__edges"
                width={graphLayout.width}
                height={graphLayout.height}
              >
                {graphLayout.edges.map((edge) => {
                  const from = graphLayout.nodes.find((node) => node.id === edge.from);
                  const to = graphLayout.nodes.find((node) => node.id === edge.to);
                  if (!from || !to) return null;
                  return (
                    <line
                      key={`${edge.from}-${edge.to}`}
                      x1={from.x + 180}
                      y1={from.y + 36}
                      x2={to.x}
                      y2={to.y + 36}
                      className="puzzle-graph__edge"
                    />
                  );
                })}
              </svg>
              <div
                className="puzzle-graph__nodes"
                style={{ width: graphLayout.width, height: graphLayout.height }}
              >
                {graphLayout.nodes.map((layoutNode) => {
                  const isSelected = selectedNodeId === layoutNode.id;
                  const isGroup = layoutNode.node.kind === "group";
                  return (
                    <div
                      key={layoutNode.id}
                      role="button"
                      tabIndex={0}
                      className={`puzzle-graph__node ${isGroup ? "puzzle-graph__node--group" : "puzzle-graph__node--action"} ${isSelected ? "puzzle-graph__node--selected" : ""}`}
                      style={{ left: layoutNode.x, top: layoutNode.y }}
                      onClick={() => setSelectedNodeId(layoutNode.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedNodeId(layoutNode.id);
                        }
                      }}
                    >
                      <div className="puzzle-graph__node-head">
                        <span>{isGroup ? "Logic" : "Trigger"}</span>
                        <button
                          type="button"
                          className="tenant-settings__secondary-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeNodeAndSelection(layoutNode.id);
                          }}
                        >
                          x
                        </button>
                      </div>
                      <div className="puzzle-graph__node-title">{layoutNode.node.title || "Untitled"}</div>
                      <div className="puzzle-graph__node-meta">
                        {isGroup
                          ? `Rule: ${layoutNode.node.group_op ?? "sequence"}`
                          : `Event: ${layoutNode.node.event_type ?? "none"}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="puzzle-builder__inspector">
        <h4>Node Inspector</h4>
        {!selectedNode ? (
          <p className="tenant-settings__panel-desc">
            Select a node from the graph canvas to edit details.
          </p>
        ) : (
          <div className="puzzle-node puzzle-node--inspector">
            <div className="puzzle-node__fields">
              <label>Label</label>
              <input
                className="tenant-settings__input tenant-settings__input--wide"
                value={selectedNode.title}
                onChange={(event) =>
                  setNodes((prev) =>
                    updateNodeTree(prev, selectedNode.id, (target) => ({
                      ...target,
                      title: event.target.value,
                    })),
                  )
                }
              />
              {selectedNode.kind === "group" ? (
                <>
                  <label>Group rule</label>
                  <KidDropdown
                    value={selectedNode.group_op ?? "sequence"}
                    onChange={(value) =>
                      setNodes((prev) =>
                        updateNodeTree(prev, selectedNode.id, (target) => ({
                          ...target,
                          group_op:
                            value === "all" || value === "any" || value === "sequence"
                              ? value
                              : "sequence",
                        })),
                      )
                    }
                    fullWidth
                    ariaLabel="Group rule"
                    options={[
                      { value: "sequence", label: "Sequence (ordered)" },
                      { value: "all", label: "All conditions required" },
                      { value: "any", label: "Any condition can match" },
                    ]}
                  />
                </>
              ) : (
                <>
                  <label>Event</label>
                  <KidDropdown
                    value={selectedNode.event_type ?? eventOptions[0]?.value ?? ""}
                    onChange={(value) =>
                      setNodes((prev) =>
                        updateNodeTree(prev, selectedNode.id, (target) => ({
                          ...target,
                          event_type: value,
                        })),
                      )
                    }
                    fullWidth
                    ariaLabel="Action event"
                    options={eventOptions}
                  />
                  <label>Context filters</label>
                  <div className="puzzle-node__context-list">
                    {selectedNode.context.map((pair, index) => (
                      <div key={`${selectedNode.id}-${index}`} className="puzzle-node__context-row">
                        <input
                          className="tenant-settings__input"
                          placeholder="key"
                          value={pair.key}
                          onChange={(event) =>
                            setNodes((prev) =>
                              updateNodeTree(prev, selectedNode.id, (target) => {
                                const next = [...target.context];
                                next[index] = { ...next[index], key: event.target.value };
                                return { ...target, context: next };
                              }),
                            )
                          }
                        />
                        <input
                          className="tenant-settings__input"
                          placeholder="value (or Any)"
                          value={pair.value}
                          onChange={(event) =>
                            setNodes((prev) =>
                              updateNodeTree(prev, selectedNode.id, (target) => {
                                const next = [...target.context];
                                next[index] = { ...next[index], value: event.target.value };
                                return { ...target, context: next };
                              }),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="tenant-settings__secondary-btn"
                          onClick={() =>
                            setNodes((prev) =>
                              updateNodeTree(prev, selectedNode.id, (target) => {
                                const next = [...target.context];
                                next[index] = { ...next[index], value: "any" };
                                return { ...target, context: next };
                              }),
                            )
                          }
                        >
                          Any
                        </button>
                        <button
                          type="button"
                          className="tenant-settings__secondary-btn"
                          onClick={() =>
                            setNodes((prev) =>
                              updateNodeTree(prev, selectedNode.id, (target) => ({
                                ...target,
                                context: target.context.filter((_, rowIndex) => rowIndex !== index),
                              })),
                            )
                          }
                        >
                          x
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="tenant-settings__secondary-btn"
                      onClick={() =>
                        setNodes((prev) =>
                          updateNodeTree(prev, selectedNode.id, (target) => ({
                            ...target,
                            context: [...target.context, { key: "", value: "" }],
                          })),
                        )
                      }
                    >
                      Add filter
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="puzzle-builder__reward">
        <div className="tenant-settings__field">
          <label>Reward type</label>
          <KidDropdown
            value={rewardType}
            onChange={(value) => setRewardType(value === "reward" ? "reward" : "points")}
            fullWidth
            ariaLabel="Reward type"
            options={[
              { value: "points", label: "Points" },
              { value: "reward", label: "Reward" },
            ]}
          />
        </div>
        {rewardType === "points" ? (
          <div className="tenant-settings__field">
            <label>Points</label>
            <input
              type="number"
              min={1}
              max={500}
              className="tenant-settings__input"
              value={rewardPoints}
              onChange={(event) =>
                setRewardPoints(Math.max(1, Math.min(500, Number(event.target.value) || 1)))
              }
            />
          </div>
        ) : (
          <>
            <div className="tenant-settings__field">
              <label>Reward kind</label>
              <KidDropdown
                value={rewardKind}
                onChange={(value) =>
                  setRewardKind(
                    value === "hi-five" || value === "sticker" || value === "custom"
                      ? value
                      : "badge",
                  )
                }
                fullWidth
                ariaLabel="Reward kind"
                options={[
                  { value: "badge", label: "Sticker" },
                  { value: "hi-five", label: "Hi-five" },
                  { value: "sticker", label: "Sticker" },
                  { value: "custom", label: "Custom image" },
                ]}
              />
            </div>
            <div className="tenant-settings__field">
              <label>Sticker slug (optional)</label>
              <input
                className="tenant-settings__input tenant-settings__input--wide"
                value={badgeSlug}
                onChange={(event) => setBadgeSlug(event.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div className="puzzle-builder__sim">
        <div className="tenant-settings__field">
          <label>Simulation event</label>
          <KidDropdown
            value={simulateEventType}
            onChange={setSimulateEventType}
            fullWidth
            ariaLabel="Simulation event"
            options={(eventsInGraph.length ? eventsInGraph : eventOptions.map((evt) => evt.value)).map(
              (evt) => ({
                value: evt,
                label: evt,
              }),
            )}
          />
        </div>
        <div className="tenant-settings__field">
          <label>Simulation context JSON</label>
          <input
            className="tenant-settings__input tenant-settings__input--wide"
            value={simulateContextJson}
            onChange={(event) => setSimulateContextJson(event.target.value)}
          />
          <p className="tenant-settings__panel-desc" style={{ marginTop: 4 }}>
            Supports wildcards (`any`) and numeric checks like `&gt;=5` in context rules.
          </p>
        </div>
      </div>

      <div className="ui-form-actions" style={{ marginTop: 12 }}>
        <button type="button" className="ui-btn ui-btn--ghost" onClick={() => void handleSimulate()}>
          Simulate
        </button>
        <button type="button" className="ui-btn ui-btn--primary" disabled={saving} onClick={() => void handleCreate()}>
          {saving ? "Saving..." : "Save Puzzle Goal"}
        </button>
      </div>

      {simulateResult ? (
        <div className="tenant-settings__support-message tenant-settings__support-message--success" style={{ marginTop: 12 }}>
          Matched {simulateResult.matched} goal(s) • Points preview: {simulateResult.points}
        </div>
      ) : null}
      {error ? <p className="tenant-settings__reward-error">{error}</p> : null}

      <div style={{ marginTop: 16 }}>
        <h4 className="tenant-settings__support-title" style={{ marginBottom: 8 }}>
          Existing goals for this lab
        </h4>
        {loadingGoals ? (
          <p className="tenant-settings__panel-desc">Loading goals...</p>
        ) : goals.length === 0 ? (
          <p className="tenant-settings__panel-desc">No goals yet.</p>
        ) : (
          <div className="tenant-settings__support-list">
            {goals.map((goal) => (
              <div key={goal.id} className="tenant-settings__support-item">
                <div className="tenant-settings__support-item-main">
                  <div className="tenant-settings__support-item-name">{goal.name}</div>
                  <div className="tenant-settings__support-item-meta">
                    <span>{goal.lab_type}</span>
                    <span>{goal.event_map.events.join(", ")}</span>
                    <span>{goal.reward.type === "points" ? `${goal.reward.value ?? 0} pts` : goal.reward.reward_kind}</span>
                  </div>
                </div>
                <div className="tenant-settings__support-item-actions">
                  <button
                    type="button"
                    className="tenant-settings__secondary-btn"
                    onClick={() => void deleteGamificationGoal(goal.id).then(refreshGoals)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

