/**
 * GameDevLabObserver — live sync unavailable for MakeCode iframe labs.
 */
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";

interface Props {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

export function GameDevLabObserver({ ydoc: _ydoc, provider: _provider }: Props) {
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
        textAlign: "center",
        padding: 24,
      }}
    >
      <span style={{ fontSize: 40 }}>🎮</span>
      <p>
        <strong style={{ color: "#e5e7eb" }}>Live sync unavailable for this lab type.</strong>
        <br />
        Game Dev Lab uses an embedded MakeCode editor that cannot be observed in real time.
      </p>
    </div>
  );
}
