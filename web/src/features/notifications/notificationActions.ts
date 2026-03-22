import type { NotificationRecord } from "../../lib/api/notifications";

function fallbackPath(notification: NotificationRecord): string | null {
  switch (notification.type) {
    case "assignment_graded":
      return "/app/assignments";
    case "assignment_submission":
      return "/app/classrooms";
    case "classroom_enrollment":
      return "/app/classrooms";
    default:
      return null;
  }
}

export function getNotificationActionPath(notification: NotificationRecord): string | null {
  if (notification.action_path && notification.action_path.trim()) {
    return notification.action_path;
  }
  return fallbackPath(notification);
}

export function getNotificationActionLabel(notification: NotificationRecord): string {
  if (notification.action_label && notification.action_label.trim()) {
    return notification.action_label;
  }
  return "Open";
}
