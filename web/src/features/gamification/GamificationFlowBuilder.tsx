import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  createGamificationGoal,
  deleteGamificationGoal,
  listGamificationGoals,
  simulateLabEvent,
  type GamificationGoal,
  type GoalReward,
} from "../../lib/api/gamification";
import { KidDropdown } from "../../components/ui";

type GroupOp = "sequence" | "all" | "any";
type NodeKind = "group" | "action";
type ContextPair = { key: string; value: string };

type FlowData = {
  title: string;
  kind: NodeKind;
  group_op?: GroupOp;
  event_type?: string;
  context: ContextPair[];
};

type PaletteItem =
  | { kind: "group"; label: string; group_op: GroupOp; title?: string; context?: ContextPair[] }
  | { kind: "action"; label: string; event_type: string; title?: string; context?: ContextPair[] };

const LABS = [
  { value: "circuit-maker", label: "Circuit Maker" },
  { value: "design-maker", label: "Design Maker (3D)" },
  { value: "micro-maker", label: "Micro Maker (MCU)" },
  { value: "robotics-lab", label: "Robo Maker" },
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

function paletteKindLabel(item: PaletteItem): string {
  if (item.kind === "action") return "Trigger";
  if (item.group_op === "sequence") return "Flow";
  if (item.group_op === "all") return "Logic";
  return "Choice";
}

function FlowAutomationNode({ data, selected }: NodeProps<Node<FlowData>>) {
  return (
    <div className={`puzzle-flow-node ${selected ? "puzzle-flow-node--selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="puzzle-flow-node__kind">{data.kind === "group" ? "Logic" : "Action"}</div>
      <div className="puzzle-flow-node__title">{data.title || "Untitled"}</div>
      <div className="puzzle-flow-node__meta">
        {data.kind === "group"
          ? `Rule: ${data.group_op ?? "sequence"}`
          : `Event: ${data.event_type ?? "none"}`}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const FLOW_NODE_TYPES = {
  automation: FlowAutomationNode,
};

function isAllowedConnection(connection: Connection, currentNodes: Node<FlowData>[]): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;
  const sourceNode = currentNodes.find((node) => node.id === connection.source);
  const targetNode = currentNodes.find((node) => node.id === connection.target);
  if (!sourceNode || !targetNode) return false;
  if (sourceNode.data.kind === "action" && targetNode.data.kind === "action") return false;
  return true;
}

function toNode(item: PaletteItem, x: number, y: number): Node<FlowData> {
  const data: FlowData =
    item.kind === "action"
      ? {
          title: item.title ?? item.label.replace("Action: ", ""),
          kind: "action",
          event_type: item.event_type,
          context: item.context ? [...item.context] : [],
        }
      : {
          title: item.title ?? item.label,
          kind: "group",
          group_op: item.group_op,
          context: item.context ? [...item.context] : [],
        };
  return {
    id: newId(),
    position: { x, y },
    data,
    type: "automation",
  };
}

export function GamificationFlowBuilder() {
  const [labType, setLabType] = useState("circuit-maker");
  const [goalName, setGoalName] = useState("Automation Goal");
  const [goalDescription, setGoalDescription] = useState("");
  const [rewardType, setRewardType] = useState<"points" | "reward">("points");
  const [rewardPoints, setRewardPoints] = useState(10);
  const [rewardKind, setRewardKind] = useState<"badge" | "hi-five" | "sticker" | "custom">("badge");
  const [badgeSlug, setBadgeSlug] = useState("circuit_rookie");
  const [simulateContextJson, setSimulateContextJson] = useState("{}");
  const [simulateEventType, setSimulateEventType] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [goals, setGoals] = useState<GamificationGoal[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [saving, setSaving] = useState(false);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [error, setError] = useState("");
  const [simulateResult, setSimulateResult] = useState<{ matched: number; points: number } | null>(null);

  const eventOptions = LAB_EVENTS[labType] ?? [];
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const eventsInGraph = useMemo(() => {
    const out = new Set<string>();
    nodes.forEach((node) => {
      if (node.data.kind === "action" && node.data.event_type) out.add(node.data.event_type);
    });
    return Array.from(out);
  }, [nodes]);

  const palette: PaletteItem[] = useMemo(
    () => {
      const base: PaletteItem[] = [
        { kind: "group", label: "Sequence Group", group_op: "sequence", title: "Then (Sequence)" },
        { kind: "group", label: "All Conditions Group", group_op: "all", title: "All Must Match" },
        { kind: "group", label: "Any Conditions Group", group_op: "any", title: "Any Can Match" },
      ];
      const eventItems: PaletteItem[] = eventOptions.map((evt) => ({
        kind: "action" as const,
        label: `Action: ${evt.label}`,
        event_type: evt.value,
      }));

      if (labType !== "circuit-maker") {
        return [...base, ...eventItems];
      }

      const circuitNodes: PaletteItem[] = [
        {
          kind: "action",
          label: "Connection: 2 nodes joined",
          title: "Connection with 2 Nodes",
          event_type: "OBJECT_CONNECTED",
          context: [{ key: "connected_component_count", value: "2" }],
        },
        {
          kind: "action",
          label: "Component: any connected",
          title: "Any Component Connected",
          event_type: "OBJECT_CONNECTED",
          context: [{ key: "any_component", value: "any" }],
        },
        {
          kind: "action",
          label: "Device: 3-terminal component connected",
          title: "3-Terminal Device Connected",
          event_type: "OBJECT_CONNECTED",
          context: [{ key: "component_types", value: "npn_transistor" }],
        },
        {
          kind: "action",
          label: "Connector: wire-to-wire",
          title: "Wire Joined to Wire",
          event_type: "OBJECT_CONNECTED",
          context: [{ key: "connection_kind", value: "wire_to_wire" }],
        },
        {
          kind: "action",
          label: "Measure: voltage threshold",
          title: "Voltage >= threshold",
          event_type: "CIRCUIT_COMPLETE",
          context: [{ key: "outputs.voltage_max_v", value: ">=5" }],
        },
        {
          kind: "action",
          label: "Measure: current threshold",
          title: "Current <= threshold",
          event_type: "CIRCUIT_COMPLETE",
          context: [{ key: "outputs.current_total_abs_a", value: "<=0.2" }],
        },
        {
          kind: "action",
          label: "Analysis: DC run",
          title: "DC Analysis Completed",
          event_type: "CIRCUIT_COMPLETE",
          context: [{ key: "action", value: "dc_analysis" }],
        },
        {
          kind: "action",
          label: "Analysis: transient running",
          title: "Transient Simulation Running",
          event_type: "CIRCUIT_COMPLETE",
          context: [{ key: "outputs.transient.simulation_running", value: "true" }],
        },
      ];

      return [...base, ...eventItems, ...circuitNodes];
    },
    [eventOptions, labType],
  );

  useEffect(() => {
    if (!simulateEventType) setSimulateEventType(eventOptions[0]?.value ?? "");
  }, [eventOptions, simulateEventType]);

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
  }, [labType]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isAllowedConnection(connection, nodes)) return;
      setEdges((prev) =>
        addEdge(
          {
            ...connection,
            id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
          },
          prev,
        ),
      );
    },
    [nodes, setEdges],
  );

  const addRootNode = (item: PaletteItem) => {
    const node = toNode(item, 100 + nodes.length * 40, 100 + nodes.length * 25);
    setNodes((prev) => [...prev, node]);
    setSelectedNodeId(node.id);
  };

  const addChildNode = (item: PaletteItem) => {
    if (!selectedNode) {
      addRootNode(item);
      return;
    }
    const node = toNode(item, selectedNode.position.x + 220, selectedNode.position.y + 60);
    setNodes((prev) => [...prev, node]);
    setEdges((prev) => [...prev, { id: `edge-${selectedNode.id}-${node.id}`, source: selectedNode.id, target: node.id }]);
    setSelectedNodeId(node.id);
  };

  const removeSelectedNode = () => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.filter((node) => node.id !== selectedNodeId));
    setEdges((prev) => prev.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId(null);
  };

  const autoLayout = () => {
    if (!nodes.length) return;
    const incoming = new Map<string, number>();
    const children = new Map<string, string[]>();
    nodes.forEach((node) => incoming.set(node.id, 0));
    edges.forEach((edge) => {
      if (!incoming.has(edge.target) || !incoming.has(edge.source)) return;
      incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
      children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
    });

    const depth = new Map<string, number>();
    const roots = nodes
      .filter((node) => (incoming.get(node.id) ?? 0) === 0)
      .map((node) => node.id);
    const queue = [...roots];
    roots.forEach((id) => depth.set(id, 0));

    while (queue.length) {
      const current = queue.shift();
      if (!current) break;
      const currentDepth = depth.get(current) ?? 0;
      for (const next of children.get(current) ?? []) {
        const nextDepth = currentDepth + 1;
        if ((depth.get(next) ?? -1) < nextDepth) depth.set(next, nextDepth);
        queue.push(next);
      }
    }

    let orphanDepth = 0;
    nodes.forEach((node) => {
      if (!depth.has(node.id)) {
        depth.set(node.id, orphanDepth);
        orphanDepth += 1;
      }
    });

    const lanes = new Map<number, string[]>();
    nodes.forEach((node) => {
      const lane = depth.get(node.id) ?? 0;
      lanes.set(lane, [...(lanes.get(lane) ?? []), node.id]);
    });

    const coords = new Map<string, { x: number; y: number }>();
    Array.from(lanes.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([lane, ids]) => {
        ids.forEach((id, row) => {
          coords.set(id, { x: 90 + lane * 260, y: 70 + row * 130 });
        });
      });

    setNodes((prev) =>
      prev.map((node) => ({
        ...node,
        position: coords.get(node.id) ?? node.position,
      })),
    );
  };

  const updateSelectedNode = (updater: (data: FlowData) => FlowData) => {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((node) =>
        node.id === selectedNodeId ? { ...node, data: updater(node.data) } : node,
      ),
    );
  };

  const handleSimulate = async () => {
    setSimulateLoading(true);
    setSimulateResult(null);
    setError("");
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
    } finally {
      setSimulateLoading(false);
    }
  };

  const handleCreate = async () => {
    setError("");
    if (!goalName.trim()) {
      setError("Goal name is required.");
      return;
    }
    if (!nodes.length) {
      setError("Add at least one node.");
      return;
    }

    const events = eventsInGraph;
    if (!events.length) {
      setError("Add at least one action node.");
      return;
    }

    const reward: GoalReward =
      rewardType === "points"
        ? { type: "points", value: Math.max(1, rewardPoints) }
        : { type: "reward", reward_kind: rewardKind, badge_slug: badgeSlug || undefined };

    const graphCondition = {
      kind: "node_graph",
      version: 2,
      nodes: nodes.map((node) => ({
        id: node.id,
        position: node.position,
        ...node.data,
        context: node.data.context
          .filter((pair) => pair.key.trim())
          .reduce<Record<string, string>>((acc, pair) => {
            acc[pair.key.trim()] = pair.value;
            return acc;
          }, {}),
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
    };

    setSaving(true);
    try {
      await createGamificationGoal({
        lab_type: labType,
        name: goalName.trim(),
        description: goalDescription.trim(),
        event_map: { events, context_match: {} },
        conditions: [graphCondition],
        reward,
        is_active: true,
      });
      setNodes([]);
      setEdges([]);
      setSelectedNodeId(null);
      setSimulateResult(null);
      await refreshGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tenant-settings__support-card">
      <h3 className="tenant-settings__support-title">Automation Graph Builder</h3>
      <p className="tenant-settings__panel-desc">
        Drag nodes on canvas and wire them together like SaaS automations.
      </p>

      <div className="puzzle-builder__meta">
        <div className="tenant-settings__field">
          <label>Lab</label>
          <KidDropdown value={labType} onChange={setLabType} fullWidth ariaLabel="Lab type" options={LABS} />
        </div>
        <div className="tenant-settings__field">
          <label>Goal name</label>
          <input className="tenant-settings__input tenant-settings__input--wide" value={goalName} onChange={(e) => setGoalName(e.target.value)} />
        </div>
        <div className="tenant-settings__field">
          <label>Description</label>
          <input className="tenant-settings__input tenant-settings__input--wide" value={goalDescription} onChange={(e) => setGoalDescription(e.target.value)} />
        </div>
      </div>

      <div className="puzzle-builder">
        <div className="puzzle-builder__palette">
          <h4>Blocks Library</h4>
          {palette.map((item, idx) => (
            <div key={`${item.kind}-${idx}-${item.label}`} className="puzzle-palette__item">
              <div className="puzzle-palette__head">
                <span className="puzzle-palette__badge">{paletteKindLabel(item)}</span>
                <div className="puzzle-palette__actions">
                  <button type="button" className="tenant-settings__secondary-btn" onClick={() => addRootNode(item)}>
                    Root
                  </button>
                  <button type="button" className="tenant-settings__secondary-btn" onClick={() => addChildNode(item)} disabled={!selectedNodeId}>
                    Child
                  </button>
                </div>
              </div>
              <div>{item.label}</div>
            </div>
          ))}
        </div>

        <div className="puzzle-builder__canvas">
          <div className="puzzle-builder__canvas-head">
            <h4>Node Graph Canvas</h4>
            <button type="button" className="tenant-settings__secondary-btn" onClick={autoLayout}>
              Auto layout
            </button>
          </div>
          <div className="puzzle-flow-wrap">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={FLOW_NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={(connection) => isAllowedConnection(connection, nodes)}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              fitView
            >
              <MiniMap />
              <Controls />
              <Background gap={18} size={1} />
            </ReactFlow>
          </div>
        </div>
      </div>

      <div className="puzzle-builder__inspector">
        <h4>Node Inspector</h4>
        {!selectedNode ? (
          <p className="tenant-settings__panel-desc">Select a node from canvas.</p>
        ) : (
          <div className="puzzle-node puzzle-node--inspector">
            <div className="puzzle-node__fields">
              <label>Label</label>
              <input
                className="tenant-settings__input tenant-settings__input--wide"
                value={selectedNode.data.title}
                onChange={(e) => updateSelectedNode((data) => ({ ...data, title: e.target.value }))}
              />
              {selectedNode.data.kind === "group" ? (
                <>
                  <label>Group rule</label>
                  <KidDropdown
                    value={selectedNode.data.group_op ?? "sequence"}
                    onChange={(value) =>
                      updateSelectedNode((data) => ({
                        ...data,
                        group_op:
                          value === "all" || value === "any" || value === "sequence"
                            ? value
                            : "sequence",
                      }))
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
                    value={selectedNode.data.event_type ?? eventOptions[0]?.value ?? ""}
                    onChange={(value) => updateSelectedNode((data) => ({ ...data, event_type: value }))}
                    fullWidth
                    ariaLabel="Action event"
                    options={eventOptions}
                  />
                  <label>Context filters</label>
                  <div className="puzzle-node__context-list">
                    {selectedNode.data.context.map((pair, index) => (
                      <div key={`${selectedNode.id}-${index}`} className="puzzle-node__context-row">
                        <input
                          className="tenant-settings__input"
                          placeholder="key"
                          value={pair.key}
                          onChange={(e) =>
                            updateSelectedNode((data) => {
                              const next = [...data.context];
                              next[index] = { ...next[index], key: e.target.value };
                              return { ...data, context: next };
                            })
                          }
                        />
                        <input
                          className="tenant-settings__input"
                          placeholder="value (or Any)"
                          value={pair.value}
                          onChange={(e) =>
                            updateSelectedNode((data) => {
                              const next = [...data.context];
                              next[index] = { ...next[index], value: e.target.value };
                              return { ...data, context: next };
                            })
                          }
                        />
                        <button
                          type="button"
                          className="tenant-settings__secondary-btn"
                          onClick={() =>
                            updateSelectedNode((data) => {
                              const next = [...data.context];
                              next[index] = { ...next[index], value: "any" };
                              return { ...data, context: next };
                            })
                          }
                        >
                          Any
                        </button>
                        <button
                          type="button"
                          className="tenant-settings__secondary-btn"
                          onClick={() =>
                            updateSelectedNode((data) => ({
                              ...data,
                              context: data.context.filter((_, rowIndex) => rowIndex !== index),
                            }))
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
                        updateSelectedNode((data) => ({
                          ...data,
                          context: [...data.context, { key: "", value: "" }],
                        }))
                      }
                    >
                      Add filter
                    </button>
                  </div>
                </>
              )}
              <div className="ui-form-actions">
                <button type="button" className="ui-btn ui-btn--ghost" onClick={removeSelectedNode}>
                  Remove Node
                </button>
              </div>
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
        </div>
      </div>

      <div className="ui-form-actions" style={{ marginTop: 12 }}>
        <button type="button" className="ui-btn ui-btn--ghost" onClick={() => void handleSimulate()}>
          {simulateLoading ? "Simulating..." : "Simulate"}
        </button>
        <button type="button" className="ui-btn ui-btn--primary" disabled={saving} onClick={() => void handleCreate()}>
          {saving ? "Saving..." : "Save Automation Goal"}
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

