import { RewardOverlay } from "./overlay/RewardOverlay";
import { useRewardListener } from "./hooks/useRewardListener";

export function RewardRuntime() {
  useRewardListener();
  return <RewardOverlay />;
}

