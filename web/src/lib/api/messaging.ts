import { apiFetch } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemberInfo {
  user_id: string;
  name: string;
  joined_at: string;
  left_at: string | null;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  message_type: "text" | "system";
  is_read: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  type: "dm" | "group";
  name: string | null;
  classroom_id: string | null;
  display_name: string;
  members: MemberInfo[];
  last_message: ConversationMessage | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationListResponse {
  items: Conversation[];
  total: number;
  skip: number;
  limit: number;
}

export interface ConversationMessageListResponse {
  items: ConversationMessage[];
  total: number;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function listConversations(
  params?: { skip?: number; limit?: number },
): Promise<ConversationListResponse> {
  const query = new URLSearchParams();
  if (params?.skip != null) query.set("skip", String(params.skip));
  if (params?.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<ConversationListResponse>(
    `/conversations/${qs ? `?${qs}` : ""}`,
  );
}

export async function getConversation(id: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/conversations/${id}`);
}

export async function getOrCreateDm(recipientId: string): Promise<Conversation> {
  return apiFetch<Conversation>("/conversations/dm", {
    method: "POST",
    body: { recipient_id: recipientId },
  });
}

export async function listConversationMessages(
  conversationId: string,
  params?: { skip?: number; limit?: number }
): Promise<ConversationMessageListResponse> {
  const query = new URLSearchParams();
  if (params?.skip !== undefined) query.set("skip", String(params.skip));
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<ConversationMessageListResponse>(
    `/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`
  );
}

export async function sendConversationMessage(
  conversationId: string,
  body: string
): Promise<ConversationMessage> {
  return apiFetch<ConversationMessage>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { body },
  });
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await apiFetch(`/conversations/${conversationId}/read`, { method: "POST" });
}

// ── Group management ──────────────────────────────────────────────────────────

export async function createGroupConversation(data: {
  name: string;
  member_ids: string[];
}): Promise<Conversation> {
  return apiFetch<Conversation>("/conversations/group", {
    method: "POST",
    body: data,
  });
}

export async function updateConversationName(
  conversationId: string,
  name: string
): Promise<Conversation> {
  return apiFetch<Conversation>(`/conversations/${conversationId}`, {
    method: "PATCH",
    body: { name },
  });
}

export async function addGroupMembers(
  conversationId: string,
  userIds: string[]
): Promise<Conversation> {
  return apiFetch<Conversation>(`/conversations/${conversationId}/members`, {
    method: "POST",
    body: { user_ids: userIds },
  });
}

export async function removeGroupMember(
  conversationId: string,
  userId: string
): Promise<void> {
  await apiFetch(`/conversations/${conversationId}/members/${userId}`, {
    method: "DELETE",
  });
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await apiFetch(`/conversations/${conversationId}`, { method: "DELETE" });
}
