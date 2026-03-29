/** Cross-component refetch when tenant realtime signals `messages.changed`. */

export const MESSAGES_INVALIDATE_EVENT = "stemplitude:messages-invalidate";

export type MessagesInvalidateDetail = {
  conversation_id?: string;
};

export function emitMessagesInvalidate(detail: MessagesInvalidateDetail = {}): void {
  window.dispatchEvent(
    new CustomEvent<MessagesInvalidateDetail>(MESSAGES_INVALIDATE_EVENT, { detail }),
  );
}

export function subscribeMessagesInvalidate(
  handler: (detail: MessagesInvalidateDetail) => void,
): () => void {
  const listener = (e: Event) => {
    const ce = e as CustomEvent<MessagesInvalidateDetail>;
    handler(ce.detail ?? {});
  };
  window.addEventListener(MESSAGES_INVALIDATE_EVENT, listener);
  return () => window.removeEventListener(MESSAGES_INVALIDATE_EVENT, listener);
}
