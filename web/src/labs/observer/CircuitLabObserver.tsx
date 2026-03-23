/**
 * CircuitLabObserver — placeholder while circuit state sync is implemented.
 */
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";

interface Props {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

export function CircuitLabObserver({ ydoc: _ydoc, provider: _provider }: Props) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1e1e2e",
        color: "#9ca3af",
        fontSize: 14,
        flexDirection: "column",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 40 }}>⚡</span>
      <p>Circuit lab observer view — connected, awaiting sync data.</p>
    </div>
  );
}
