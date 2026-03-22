import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import "./route-guard.css";

interface RouteGuardProps {
  children: ReactNode;
}

export function RouteGuard({ children }: RouteGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="route-guard__loading" role="status" aria-live="polite">
        <div className="route-guard__spinner" aria-hidden />
        <span className="route-guard__loading-text">Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
