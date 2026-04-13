import { Navigate, useLocation } from "react-router-dom";

export default function RoboticsLab() {
  const location = useLocation();
  return <Navigate to={`/playground/robotics/code${location.search}`} replace />;
}

