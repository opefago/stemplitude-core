import { Download, Pause, Play, RotateCcw, Save, StepForward } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { KidDropdown } from "../components/ui";
import { useRoboticsWorkspaceContext } from "../features/robotics_lab/RoboticsWorkspaceContext";
import { describeNode } from "../features/robotics_lab/workspaceDefaults";
import { RoboticsBlocklyEditor } from "../features/robotics_lab/RoboticsBlocklyEditor";
import { resolveKitCapabilities } from "../labs/robotics";
import { createRoboticsCompileJob } from "../lib/api/robotics";

export default function RoboticsCodeEditorPage() {
  const {
    manifests,
    selectedVendor,
    selectedRobotType,
    setSelectedVendor,
    setSelectedRobotType,
    mode,
    setMode,
    program,
    setProgram,
    textCode,
    setTextCode,
    runtimeState,
    projectTitle,
    setProjectTitle,
    runProgram,
    pauseProgram,
    stepProgram,
    resetProgram,
    saveProjectSnapshot,
    panel,
  } = useRoboticsWorkspaceContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [previewCollapsed, setPreviewCollapsed] = useState(true);
  const [compileBusy, setCompileBusy] = useState(false);

  const selectedManifest = useMemo(
    () =>
      manifests.find((item) => item.vendor === selectedVendor && item.robot_type === selectedRobotType) || manifests[0],
    [manifests, selectedRobotType, selectedVendor],
  );

  const codePreview = useMemo(
    () => program.nodes.map((node, index) => `${index + 1}. ${describeNode(node)}`).join("\n"),
    [program.nodes],
  );
  const robotOptions = useMemo(
    () =>
      manifests.map((item) => ({
        value: `${item.vendor}:${item.robot_type}`,
        label: item.display_name,
      })),
    [manifests],
  );
  const modeOptions = useMemo(
    () =>
      (selectedManifest?.languages || ["blocks"]).map((language) => ({
        value: language,
        label: language,
      })),
    [selectedManifest?.languages],
  );
  const kitCapabilities = useMemo(
    () =>
      resolveKitCapabilities({
        vendor: selectedVendor,
        robotType: selectedRobotType,
        manifest: selectedManifest,
      }),
    [selectedManifest, selectedRobotType, selectedVendor],
  );
  const selectedSensorKinds = useMemo(() => kitCapabilities.sensors.map((sensor) => sensor.kind), [kitCapabilities.sensors]);
  const selectedActuatorKinds = useMemo(
    () => kitCapabilities.actuators.map((actuator) => actuator.kind),
    [kitCapabilities.actuators],
  );

  function moveDistanceToCm(node) {
    if (node.unit === "distance_mm") return Number(node.value) / 10;
    if (node.unit === "distance_in") return Number(node.value) * 2.54;
    return Number(node.value);
  }

  function toPythonCode() {
    const lines = ["# Stemplitude Robotics Generated Python", "def main():"];
    if (!program.nodes.length) lines.push("    pass");
    for (const node of program.nodes) {
      if (node.kind === "move") {
        const distanceCm = moveDistanceToCm(node);
        lines.push(
          node.unit !== "seconds"
            ? `    robot.move_${node.direction}(${distanceCm}, speed_pct=${node.speed_pct ?? 70})`
            : `    robot.move_${node.direction}_for(${node.value}, speed_pct=${node.speed_pct ?? 70})`,
        );
      } else if (node.kind === "turn") {
        lines.push(`    robot.turn_${node.direction}(${node.angle_deg}, speed_pct=${node.speed_pct ?? 75})`);
      } else if (node.kind === "wait") {
        lines.push(`    robot.wait(${node.seconds})`);
      } else if (node.kind === "read_sensor") {
        lines.push(`    ${node.output_var} = robot.read_sensor("${node.sensor}")`);
      }
    }
    lines.push("", "if __name__ == '__main__':", "    main()");
    return lines.join("\n");
  }

  function toCppCode() {
    const lines = [
      "// Stemplitude Robotics Generated C++",
      "#include <robotics_runtime.h>",
      "",
      "int main() {",
    ];
    for (const node of program.nodes) {
      if (node.kind === "move") {
        const distanceCm = moveDistanceToCm(node);
        lines.push(
          node.unit !== "seconds"
            ? `  robot.move("${node.direction}", ${distanceCm}, ${node.speed_pct ?? 70});`
            : `  robot.move_for("${node.direction}", ${node.value}, ${node.speed_pct ?? 70});`,
        );
      } else if (node.kind === "turn") {
        lines.push(`  robot.turn("${node.direction}", ${node.angle_deg}, ${node.speed_pct ?? 75});`);
      } else if (node.kind === "wait") {
        lines.push(`  robot.wait(${node.seconds});`);
      } else if (node.kind === "read_sensor") {
        lines.push(`  auto ${node.output_var} = robot.read_sensor("${node.sensor}");`);
      }
    }
    lines.push("  return 0;", "}");
    return lines.join("\n");
  }

  function decodeBase64ToBlob(base64Data, contentType) {
    const byteChars = window.atob(base64Data);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i += 1) bytes[i] = byteChars.charCodeAt(i);
    return new Blob([bytes], { type: contentType || "application/octet-stream" });
  }

  async function handleCompileDownload() {
    if (compileBusy) return;
    setCompileBusy(true);
    const targetMode = mode === "cpp" ? "cpp" : "python";
    const body = targetMode === "cpp" ? toCppCode() : toPythonCode();
    try {
      const compileJob = await createRoboticsCompileJob({
        robot_vendor: selectedVendor,
        robot_type: selectedRobotType,
        language: targetMode,
        source_code: body,
        target: "vex_v5",
      });
      if (compileJob.status !== "completed" || !compileJob.artifact_content_base64) {
        const reason = compileJob.diagnostics?.join("; ") || "Compiler did not return an artifact.";
        throw new Error(reason);
      }
      const filename = compileJob.artifact_name || `robotics_program.${targetMode === "cpp" ? "cpp" : "py"}`;
      const blob = decodeBase64ToBlob(compileJob.artifact_content_base64, compileJob.artifact_content_type);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Compile failed", error);
      window.alert(`Compile failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setCompileBusy(false);
    }
  }

  function handleRun() {
    runProgram();
    navigate(`/playground/robotics/run${location.search}`, { replace: true });
  }

  return (
    <div className="robotics-code-surface">
      <div className="robotics-code-toolbar">
        <div className="robotics-lab-controls">
          <button className="robotics-lab-btn" onClick={handleRun}><Play size={16} /> Run</button>
          <button className="robotics-lab-btn" onClick={pauseProgram}><Pause size={16} /> Pause</button>
          <button className="robotics-lab-btn" onClick={stepProgram}><StepForward size={16} /> Step</button>
          <button className="robotics-lab-btn" onClick={resetProgram}><RotateCcw size={16} /> Reset</button>
          <button className="robotics-lab-btn" onClick={() => void saveProjectSnapshot("manual")}><Save size={16} /> Save</button>
          <button className="robotics-lab-btn" onClick={handleCompileDownload} disabled={compileBusy}>
            <Download size={16} /> {compileBusy ? "Compiling..." : "Compile & Download"}
          </button>
          <button className="robotics-lab-btn" onClick={() => setPreviewCollapsed((prev) => !prev)}>
            {previewCollapsed ? "Show Preview" : "Hide Preview"}
          </button>
        </div>
        <div className="robotics-lab-selectors">
          <span className="robotics-runtime-pill">Runtime: {runtimeState}</span>
          <label>
            Project
            <input
              className="robotics-project-name-input"
              value={projectTitle}
              maxLength={120}
              onChange={(event) => setProjectTitle(event.target.value)}
              onBlur={() => void saveProjectSnapshot("project_renamed", { title: projectTitle })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              placeholder="My Robotics Mission"
              aria-label="Project name"
            />
          </label>
          <label>
            Robot
            <KidDropdown
              value={`${selectedVendor}:${selectedRobotType}`}
              options={robotOptions}
              minWidth={180}
              ariaLabel="Robot"
              onChange={(nextValue) => {
                const [vendor, robotType] = nextValue.split(":");
                setSelectedVendor(vendor);
                setSelectedRobotType(robotType);
              }}
            />
          </label>
          <label>
            Mode
            <KidDropdown
              value={mode}
              options={modeOptions}
              minWidth={120}
              ariaLabel="Mode"
              onChange={(nextMode) => setMode(nextMode)}
            />
          </label>
        </div>
      </div>
      <div className={`robotics-code-grid ${previewCollapsed ? "collapsed" : ""}`}>
        <section className="robotics-code-editor-pane">
        {mode === "blocks" || mode === "hybrid" ? (
          <>
            <h4>Blockly Workspace</h4>
            <RoboticsBlocklyEditor
              program={program}
              sensorKinds={selectedSensorKinds}
              actuatorKinds={selectedActuatorKinds}
              onProgramChange={(nextProgram) => setProgram(nextProgram)}
              onProgramCommit={(nextProgram) => {
                void saveProjectSnapshot("program_changed", { program: nextProgram });
              }}
            />
          </>
        ) : (
          <>
            <h4>Text Editor</h4>
            <textarea
              className="robotics-text-editor"
              value={textCode}
              onChange={(event) => setTextCode(event.target.value)}
              onBlur={() => void saveProjectSnapshot("text_code_changed", { textCode })}
              placeholder={mode === "cpp" ? "// C++ robotics starter" : "# Python robotics starter"}
            />
          </>
        )}
        </section>

        {!previewCollapsed ? (
          <aside className="robotics-lab-right robotics-preview-pane">
            <h3>Generated Preview</h3>
            <pre>{codePreview || "# Program is empty"}</pre>
          </aside>
        ) : null}
      </div>
      {panel}
    </div>
  );
}
