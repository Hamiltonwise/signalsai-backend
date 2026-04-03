import { useEffect, useState, useCallback } from "react";
import { Bell, Check, X, CheckCheck } from "lucide-react";
import { motion } from "framer-motion";
import type { PmNotification } from "../../types/pm";
import { fetchNotifications, markNotificationsRead } from "../../api/pm";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function notificationMessage(n: PmNotification): string {
  const task = n.metadata?.task_title ?? "a task";
  const project = n.metadata?.project_name ? ` in ${n.metadata.project_name}` : "";

  if (n.type === "task_assigned") {
    return `You were assigned "${task}"${project}`;
  }
  if (n.type === "task_unassigned") {
    return `You were unassigned from "${task}"${project}`;
  }
  // assignee_completed_task
  return `Someone completed "${task}" that you assigned${project}`;
}

const TYPE_ICON: Record<PmNotification["type"], React.ReactNode> = {
  task_assigned: <Check className="h-3.5 w-3.5" style={{ color: "#3D8B40" }} />,
  task_unassigned: <X className="h-3.5 w-3.5" style={{ color: "#C43333" }} />,
  assignee_completed_task: <CheckCheck className="h-3.5 w-3.5" style={{ color: "#5B9BD5" }} />,
};

export function NotificationCard() {
  const [notifications, setNotifications] = useState<PmNotification[]>([]);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setNotifications(data.slice(0, 10));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleMarkAllRead = async () => {
    try {
      await markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // silent
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.12 }}
      className="rounded-[14px] p-5 flex flex-col"
      style={{
        backgroundColor: "var(--color-pm-bg-secondary)",
        boxShadow: "var(--pm-shadow-card)",
        border: "1px solid var(--color-pm-border)",
        minHeight: 160,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bell className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--color-pm-text-muted)" }} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white" style={{ backgroundColor: "#D66853" }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[13px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>
            Notifications
          </span>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-[11px] transition-colors"
            style={{ color: "var(--color-pm-text-muted)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#D66853"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-pm-text-muted)"; }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <p className="text-[12px] text-center py-4" style={{ color: "var(--color-pm-text-muted)" }}>
          No notifications yet
        </p>
      ) : (
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 200 }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-2.5 rounded-lg px-2.5 py-2"
              style={{
                backgroundColor: n.is_read ? "transparent" : "var(--color-pm-bg-hover)",
              }}
            >
              <div className="flex-shrink-0 mt-0.5 h-5 w-5 flex items-center justify-center rounded-full" style={{ backgroundColor: "var(--color-pm-bg-primary)" }}>
                {TYPE_ICON[n.type]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] leading-snug" style={{ color: "var(--color-pm-text-primary)" }}>
                  {notificationMessage(n)}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--color-pm-text-muted)" }}>
                  {timeAgo(n.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
