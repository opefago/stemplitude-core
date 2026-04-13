import { createContext, useContext } from "react";
import { useRoboticsWorkspace } from "./useRoboticsWorkspace";

const RoboticsWorkspaceContext = createContext(null);

export function RoboticsWorkspaceProvider({ children }) {
  const workspace = useRoboticsWorkspace();
  return (
    <RoboticsWorkspaceContext.Provider value={workspace}>
      {children}
    </RoboticsWorkspaceContext.Provider>
  );
}

export function useRoboticsWorkspaceContext() {
  const context = useContext(RoboticsWorkspaceContext);
  if (!context) {
    throw new Error("useRoboticsWorkspaceContext must be used inside RoboticsWorkspaceProvider");
  }
  return context;
}
