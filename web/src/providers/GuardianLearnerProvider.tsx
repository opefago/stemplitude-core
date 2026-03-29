import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthProvider";
import { getParentChildren, type StudentProfile } from "../lib/api/students";
import {
  setChildContextStudentId,
  useChildContextStudentId,
} from "../lib/childContext";

export type GuardianLearnerContextValue = {
  isGuardianLearner: boolean;
  guardianChildren: StudentProfile[];
  activeLearnerProfile: StudentProfile | null;
  loadingGuardianChildren: boolean;
  switchLearner: (studentId: string) => void;
  activeLearnerId: string | null;
};

const defaultValue: GuardianLearnerContextValue = {
  isGuardianLearner: false,
  guardianChildren: [],
  activeLearnerProfile: null,
  loadingGuardianChildren: false,
  switchLearner: () => {},
  activeLearnerId: null,
};

const GuardianLearnerContext =
  createContext<GuardianLearnerContextValue>(defaultValue);

export function GuardianLearnerProvider({ children }: { children: ReactNode }) {
  const activeLearnerId = useChildContextStudentId();
  const { subType, role } = useAuth();
  const isGuardianLearner =
    Boolean(activeLearnerId) &&
    subType === "user" &&
    (role === "parent" || role === "homeschool_parent");

  const [guardianChildren, setGuardianChildren] = useState<StudentProfile[]>(
    [],
  );
  const [loadingGuardianChildren, setLoadingGuardianChildren] = useState(false);

  useEffect(() => {
    if (!isGuardianLearner) {
      setGuardianChildren([]);
      return;
    }
    let cancelled = false;
    setLoadingGuardianChildren(true);
    getParentChildren()
      .then((rows) => {
        if (!cancelled) setGuardianChildren(rows);
      })
      .catch(() => {
        if (!cancelled) setGuardianChildren([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingGuardianChildren(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isGuardianLearner]);

  const activeLearnerProfile = useMemo(() => {
    if (!activeLearnerId || !guardianChildren.length) return null;
    return guardianChildren.find((c) => c.id === activeLearnerId) ?? null;
  }, [activeLearnerId, guardianChildren]);

  const switchLearner = useCallback((studentId: string) => {
    const id = studentId?.trim();
    if (id) setChildContextStudentId(id);
  }, []);

  const value = useMemo<GuardianLearnerContextValue>(() => {
    if (!isGuardianLearner) {
      return defaultValue;
    }
    return {
      isGuardianLearner: true,
      guardianChildren,
      activeLearnerProfile,
      loadingGuardianChildren,
      switchLearner,
      activeLearnerId,
    };
  }, [
    isGuardianLearner,
    guardianChildren,
    activeLearnerProfile,
    loadingGuardianChildren,
    switchLearner,
    activeLearnerId,
  ]);

  return (
    <GuardianLearnerContext.Provider value={value}>
      {children}
    </GuardianLearnerContext.Provider>
  );
}

export function useGuardianLearner(): GuardianLearnerContextValue {
  return useContext(GuardianLearnerContext);
}
