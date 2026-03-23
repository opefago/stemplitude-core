/**
 * BlocklyLabObserver — read-only Blockly workspace synced from a Yjs Y.Text (XML).
 */
import { useEffect, useRef } from "react";
import * as Blockly from "blockly";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";

interface Props {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

export function BlocklyLabObserver({ ydoc, provider: _provider }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);

  useEffect(() => {
    if (!divRef.current) return;
    const ws = Blockly.inject(divRef.current, {
      readOnly: true,
      scrollbars: true,
      zoom: { controls: true, wheel: true, startScale: 0.8 },
    });
    workspaceRef.current = ws;

    const yXml = ydoc.getText("workspace-xml");
    const applyXml = () => {
      const xmlStr = yXml.toString();
      if (!xmlStr || !workspaceRef.current) return;
      try {
        const dom = Blockly.utils.xml.textToDom(xmlStr);
        Blockly.Xml.clearWorkspaceAndLoadFromXml(dom, workspaceRef.current);
      } catch {
        // ignore
      }
    };
    yXml.observe(applyXml);
    applyXml();

    return () => {
      yXml.unobserve(applyXml);
      ws.dispose();
      workspaceRef.current = null;
    };
  }, [ydoc]);

  return (
    <div
      ref={divRef}
      style={{ width: "100%", height: "100%", background: "#1e1e2e" }}
    />
  );
}
