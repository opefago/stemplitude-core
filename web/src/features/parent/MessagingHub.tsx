import { useAuth } from "../../providers/AuthProvider";
import { Inbox } from "../messaging/Inbox";

/** School parent / homeschool: tabbed Updates hub; everyone else: standard inbox. */
export function MessagingHub() {
  const { user } = useAuth();
  const role = user?.role ?? "";
  if (role === "parent" || role === "homeschool_parent") {
    return <Inbox variant="parent" />;
  }
  return <Inbox />;
}
