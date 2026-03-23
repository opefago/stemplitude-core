/**
 * PythonLabObserver — read-only CodeMirror 6 view synced from a Yjs Y.Text.
 */
import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { yCollab } from "y-codemirror.next";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";

interface Props {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

export function PythonLabObserver({ ydoc, provider }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;
    const yText = ydoc.getText("code");
    const state = EditorState.create({
      doc: yText.toString(),
      extensions: [
        basicSetup,
        python(),
        oneDark,
        EditorView.editable.of(false),
        EditorView.theme({
          "&": { height: "100%", fontSize: "14px" },
          ".cm-scroller": { overflow: "auto", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
        }),
        yCollab(yText, provider.awareness, { undoManager: false }),
      ],
    });
    viewRef.current = new EditorView({ state, parent: containerRef.current });
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [ydoc, provider]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
    />
  );
}
