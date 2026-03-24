import { useEffect } from "react";
import { UserRealtimeClient } from "../../lib/api/userRealtime";
import { useAuth } from "../../providers/AuthProvider";
import { useTenant } from "../../providers/TenantProvider";
import { rewardEngine } from "../engine/rewardEngine";
import {
  mapRewardConfig,
  mapRewardToAnimation,
  type RewardGrantedPayload,
} from "../engine/rewardMapper";

export function useRewardListener(): void {
  const { user } = useAuth();
  const { tenant } = useTenant();

  useEffect(() => {
    if (!user || !tenant?.id) return undefined;
    const client = new UserRealtimeClient({
      tenantId: tenant.id,
      onEvent: (event) => {
        if (event.event_type !== "rewards.granted") return;
        const payload = (event.payload ?? {}) as RewardGrantedPayload;
        const nextConfig = mapRewardConfig(payload);
        if (nextConfig) rewardEngine.setConfig(nextConfig);
        const mapped = mapRewardToAnimation(payload);
        rewardEngine.trigger(mapped);
      },
      onError: () => {
        // no-op: the client reconnect strategy handles transient disconnects
      },
    });
    client.connect();
    return () => client.disconnect();
  }, [user, tenant?.id]);
}

