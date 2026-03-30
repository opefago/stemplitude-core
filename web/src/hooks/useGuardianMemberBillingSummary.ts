import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import { useTenant } from "../providers/TenantProvider";
import {
  getGuardianMemberStatus,
  type GuardianMemberStatus,
} from "../lib/api/memberBilling";

export type GuardianMemberBillingSummary = {
  status: GuardianMemberStatus | null;
  loading: boolean;
  /** All linked children have an active paid entitlement (subs or one-time). */
  allChildrenHaveActiveMembership: boolean;
  /** At least one linked child lacks active paid entitlement. */
  anyChildNeedsMembership: boolean;
  refetch: () => void;
};

const initial: GuardianMemberBillingSummary = {
  status: null,
  loading: false,
  allChildrenHaveActiveMembership: false,
  anyChildNeedsMembership: false,
  refetch: () => {},
};

export function useGuardianMemberBillingSummary(): GuardianMemberBillingSummary {
  const { role } = useAuth();
  const { tenant } = useTenant();
  const parentLike = role === "parent" || role === "homeschool_parent";
  const [status, setStatus] = useState<GuardianMemberStatus | null>(null);
  const [loading, setLoading] = useState(parentLike);

  const load = useCallback(() => {
    if (!parentLike || !tenant?.id) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getGuardianMemberStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [parentLike, tenant?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const ch = status?.children ?? [];
  const allChildrenHaveActiveMembership =
    ch.length > 0 && ch.every((c) => c.has_active_membership);
  const anyChildNeedsMembership =
    ch.length > 0 && ch.some((c) => !c.has_active_membership);

  if (!parentLike) {
    return initial;
  }

  return {
    status,
    loading,
    allChildrenHaveActiveMembership,
    anyChildNeedsMembership,
    refetch: load,
  };
}
