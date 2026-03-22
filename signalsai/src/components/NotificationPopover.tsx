import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Info,
  TrendingUp,
  Clock,
  Zap,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from "../api/notifications";
import { formatDistanceToNow } from "date-fns";

interface NotificationPopoverProps {
  organizationId: number | null;
  customTrigger?: React.ReactNode;
}

export function NotificationPopover({
  organizationId,
  customTrigger,
}: NotificationPopoverProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Poll notifications every 3 seconds
  useEffect(() => {
    if (!organizationId) return;

    const pollNotifications = async () => {
      try {
        const data = await fetchNotifications(organizationId);
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      } catch (error) {
        console.error("Error fetching notifications:", error);
      }
    };

    // Initial fetch
    pollNotifications();

    // Poll every 3 seconds
    const interval = setInterval(pollNotifications, 3000);

    return () => clearInterval(interval);
  }, [organizationId]);

  // Update button position and handle click outside
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      setButtonRect(buttonRef.current.getBoundingClientRect());
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        buttonRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", () => setIsOpen(false));
      window.addEventListener("resize", () => setIsOpen(false));
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", () => setIsOpen(false));
      window.removeEventListener("resize", () => setIsOpen(false));
    };
  }, [isOpen]);

  // Get navigation path based on notification type
  const getNotificationPath = (type: string) => {
    switch (type) {
      case "pms":
        return "/pmsStatistics";
      case "task":
        return "/tasks";
      case "agent":
        return "/dashboard";
      case "ranking":
        return "/rankings";
      default:
        return "/dashboard";
    }
  };

  // Handle notification click - mark as read and navigate
  const handleNotificationClick = async (notification: Notification) => {
    if (!organizationId) return;

    try {
      // Mark as read if not already read
      if (!notification.read) {
        await markNotificationRead(notification.id, organizationId);
        // Update local state
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }

      // Close popover
      setIsOpen(false);

      // Navigate to appropriate page
      navigate(getNotificationPath(notification.type));
    } catch (error) {
      console.error("Error handling notification click:", error);
    }
  };

  const handleMarkAsRead = async (
    notificationId: number,
    e: React.MouseEvent
  ) => {
    e.stopPropagation(); // Prevent notification click
    if (!organizationId) return;

    try {
      await markNotificationRead(notificationId, organizationId);
      // Update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      await markAllNotificationsRead(organizationId);
      // Update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get notification styling matching newdesign pattern
  const getNotificationStyle = (type: string) => {
    const styleMap: Record<
      string,
      {
        Icon: React.ComponentType<{ size?: number; className?: string }>;
        iconBg: string;
        iconColor: string;
        borderColor: string;
      }
    > = {
      pms: {
        Icon: CheckCircle2,
        iconBg: "bg-green-50",
        iconColor: "text-green-600",
        borderColor: "border-green-100",
      },
      task: {
        Icon: Zap,
        iconBg: "bg-amber-50",
        iconColor: "text-amber-600",
        borderColor: "border-amber-100",
      },
      agent: {
        Icon: CheckCircle2,
        iconBg: "bg-purple-50",
        iconColor: "text-purple-600",
        borderColor: "border-purple-100",
      },
      ranking: {
        Icon: TrendingUp,
        iconBg: "bg-green-50",
        iconColor: "text-green-600",
        borderColor: "border-green-100",
      },
      system: {
        Icon: AlertCircle,
        iconBg: "bg-red-50",
        iconColor: "text-red-600",
        borderColor: "border-red-100",
      },
    };
    return (
      styleMap[type] || {
        Icon: Info,
        iconBg: "bg-slate-50",
        iconColor: "text-slate-600",
        borderColor: "border-slate-100",
      }
    );
  };

  const popoverContent = isOpen && buttonRect && (
    <motion.div
      ref={popoverRef}
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      style={{
        position: "fixed",
        left: `${buttonRect.left}px`,
        bottom: `${window.innerHeight - buttonRect.top + 8}px`,
        zIndex: 9999,
      }}
      className="w-[420px] bg-white rounded-2xl shadow-premium border border-slate-200 overflow-hidden"
    >
      {/* Header - matching newdesign pattern */}
      <div className="bg-white border-b border-slate-100 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg">
              <Bell size={20} />
            </div>
            <div>
              <h3 className="text-[10px] font-bold font-heading text-alloro-navy uppercase tracking-[0.2em]">
                Intelligence Signals
              </h3>
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mt-1">
                {unreadCount > 0
                  ? `${unreadCount} unread alert${unreadCount !== 1 ? "s" : ""}`
                  : "All caught up!"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={loading}
                className="text-[9px] text-slate-400 hover:text-alloro-navy font-bold uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-300 hover:text-alloro-navy transition-colors w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Notifications List - matching newdesign alert feed pattern */}
      <div className="max-h-[400px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <Bell className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-base font-bold text-alloro-navy font-heading tracking-tight">
              No signals yet
            </p>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-1.5">
              We'll notify you when something important happens
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => {
              const style = getNotificationStyle(notification.type);
              const Icon = style.Icon;
              return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`px-6 py-5 hover:bg-slate-50/40 transition-all cursor-pointer relative overflow-hidden group ${
                    !notification.read ? "bg-alloro-orange/5" : ""
                  }`}
                >
                  {/* Hover indicator */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-alloro-orange opacity-0 group-hover:opacity-100 transition-opacity"></div>

                  <div className="flex items-start gap-4">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border transition-all group-hover:scale-105 shadow-sm ${style.iconBg} ${style.iconColor} ${style.borderColor}`}
                    >
                      <Icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-bold text-alloro-navy font-heading tracking-tight leading-tight">
                          {notification.title}
                          {!notification.read && (
                            <span className="inline-block w-2 h-2 bg-alloro-orange rounded-full animate-pulse ml-2 align-middle"></span>
                          )}
                        </h4>
                        {!notification.read && (
                          <button
                            onClick={(e) =>
                              handleMarkAsRead(notification.id, e)
                            }
                            className="text-alloro-orange hover:text-alloro-navy flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-alloro-orange/10 transition-colors"
                            title="Mark as read"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {notification.message && (
                        <p className="text-[13px] text-slate-500 leading-relaxed font-medium tracking-tight line-clamp-2">
                          {notification.message}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        <span className="flex items-center gap-1.5">
                          <Clock size={12} className="opacity-40" />
                          {formatDistanceToNow(
                            new Date(notification.created_at),
                            { addSuffix: true }
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );

  return (
    <>
      {/* Notification Button */}
      {customTrigger ? (
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="w-full"
        >
          {customTrigger}
        </button>
      ) : (
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="relative flex items-center gap-2 text-xs text-slate-600 hover:text-alloro-navy transition-colors w-full px-3 py-2 rounded-xl hover:bg-slate-100 font-semibold"
        >
          <Bell className="h-4 w-4" />
          <span>Notifications</span>
          {unreadCount > 0 && (
            <span className="absolute -top-1 left-4 bg-alloro-orange text-white text-[9px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Popover rendered via Portal */}
      {createPortal(
        <AnimatePresence>{popoverContent}</AnimatePresence>,
        document.body
      )}
    </>
  );
}
