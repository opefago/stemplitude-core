import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

interface Diagnostic {
  line: number;
  message: string;
  severity: "error" | "warning" | "info";
}

interface RoboticsCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  language: "python" | "cpp";
  diagnostics?: Diagnostic[];
  activeLine?: number | null;
  placeholder?: string;
  readOnly?: boolean;
}

const ROBOTICS_PYTHON_COMPLETIONS = [
  { label: "robot.move_forward", insertText: "robot.move_forward(${1:80}, speed_pct=${2:70})", detail: "Move forward by distance (cm)" },
  { label: "robot.move_backward", insertText: "robot.move_backward(${1:60}, speed_pct=${2:70})", detail: "Move backward by distance (cm)" },
  { label: "robot.turn_left", insertText: "robot.turn_left(${1:90}, speed_pct=${2:75})", detail: "Turn left by angle (deg)" },
  { label: "robot.turn_right", insertText: "robot.turn_right(${1:90}, speed_pct=${2:75})", detail: "Turn right by angle (deg)" },
  { label: "robot.read_sensor", insertText: 'robot.read_sensor("${1:distance}")', detail: "Read a sensor value" },
  { label: "robot.wait", insertText: "robot.wait(${1:0.5})", detail: "Wait for seconds" },
  { label: "robot.move_forward_for", insertText: "robot.move_forward_for(${1:2.0}, speed_pct=${2:70})", detail: "Move forward for seconds" },
  { label: "robot.move_backward_for", insertText: "robot.move_backward_for(${1:2.0}, speed_pct=${2:70})", detail: "Move backward for seconds" },
  { label: "robot.set_motor", insertText: 'robot.set_motor("${1:left_drive}", ${2:50})', detail: "Set motor power percentage" },
  { label: "robot.emit_event", insertText: 'robot.emit_event("${1:event_name}")', detail: "Emit a custom event" },
];

const ROBOTICS_CPP_COMPLETIONS = [
  { label: "robot.move", insertText: 'robot.move("${1:forward}", ${2:80}, ${3:70});', detail: "Move by distance (cm)" },
  { label: "robot.turn", insertText: 'robot.turn("${1:right}", ${2:90}, ${3:75});', detail: "Turn by angle (deg)" },
  { label: "robot.read_sensor", insertText: 'robot.read_sensor("${1:distance}")', detail: "Read a sensor value" },
  { label: "robot.wait", insertText: "robot.wait(${1:0.5});", detail: "Wait for seconds" },
  { label: "robot.move_for", insertText: 'robot.move_for("${1:forward}", ${2:2.0}, ${3:70});', detail: "Move for seconds" },
  { label: "robot.set_motor", insertText: 'robot.set_motor("${1:left_drive}", ${2:50});', detail: "Set motor power percentage" },
];

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth <= breakpoint);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mql.addEventListener("change", handler);
    setMobile(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);
  return mobile;
}

function MobileCodeEditor({ value, onChange, onBlur, language, placeholder }: RoboticsCodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="robotics-mobile-code-editor">
      <textarea
        ref={textareaRef}
        className="robotics-text-editor robotics-text-editor--mobile"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <div className="robotics-mobile-code-lang-badge">{language === "cpp" ? "C++" : "Python"}</div>
    </div>
  );
}

function DesktopMonacoEditor({
  value,
  onChange,
  onBlur,
  language,
  diagnostics,
  activeLine,
  readOnly,
}: RoboticsCodeEditorProps) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  const monacoLanguage = language === "cpp" ? "cpp" : "python";

  const handleEditorDidMount = useCallback(
    (editor: any, monaco: any) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      const completions = language === "cpp" ? ROBOTICS_CPP_COMPLETIONS : ROBOTICS_PYTHON_COMPLETIONS;
      const disposable = monaco.languages.registerCompletionItemProvider(monacoLanguage, {
        provideCompletionItems: (_model: any, position: any) => {
          const word = _model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          return {
            suggestions: completions.map((item) => ({
              label: item.label,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: item.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: item.detail,
              range,
            })),
          };
        },
      });

      editor.onDidBlurEditorWidget(() => onBlur?.());

      return () => disposable.dispose();
    },
    [language, monacoLanguage, onBlur],
  );

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    const markers = (diagnostics ?? []).map((d) => ({
      severity:
        d.severity === "error"
          ? monaco.MarkerSeverity.Error
          : d.severity === "warning"
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info,
      message: d.message,
      startLineNumber: d.line,
      startColumn: 1,
      endLineNumber: d.line,
      endColumn: model.getLineMaxColumn(d.line) || 1,
    }));
    monaco.editor.setModelMarkers(model, "robotics", markers);
  }, [diagnostics]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const newDecorations: any[] = [];
    if (activeLine != null && activeLine > 0) {
      newDecorations.push({
        range: { startLineNumber: activeLine, startColumn: 1, endLineNumber: activeLine, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: "robotics-active-line-highlight",
          glyphMarginClassName: "robotics-active-line-glyph",
        },
      });
    }
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  }, [activeLine]);

  return (
    <Suspense fallback={<div className="robotics-code-editor-loading">Loading editor...</div>}>
      <MonacoEditor
        height="100%"
        language={monacoLanguage}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          tabSize: language === "cpp" ? 2 : 4,
          automaticLayout: true,
          readOnly: readOnly ?? false,
          bracketPairColorization: { enabled: true },
          glyphMargin: true,
          fixedOverflowWidgets: true,
          theme: "vs-dark",
        }}
      />
    </Suspense>
  );
}

export function RoboticsCodeEditor(props: RoboticsCodeEditorProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <MobileCodeEditor {...props} />;
  }
  return <DesktopMonacoEditor {...props} />;
}

export { useIsMobile };
export type { Diagnostic };
