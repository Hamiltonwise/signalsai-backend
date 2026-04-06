import { useState, useEffect } from "react";
import {
  Loader2,
  AlertCircle,
  Info,
  TrendingUp,
  Clock,
  Zap,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  fetchNotifications,
  markNotificationRead,
  type Notification,
} from "../../api/notifications";

interface NotificationWidgetProps {
  organizationId: number | null;
  locationId?: number | null;
  onNotificationRead?: () => void;
}

export function NotificationWidget({
  organizationId,
  locationId,
  onNotificationRead,
}: NotificationWidgetProps) {
  const navigate = useNavigate();
  const [latestUnread, setLatestUnread] = useState<Notification | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarking, setIsMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch notifications and filter for the latest unread
  const fetchLatestUnread = async () => {
    if (!organizationId) {
      setIsLoading(false);
      return;
    }

    try {
      const data = await fetchNotifications(organizationId, locationId);

      if (data.success) {
        // Filter out notifications older than 30 days
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const recent = data.notifications.filter(
          (n) => new Date(n.created_at).getTime() > thirtyDaysAgo
        );
        // Get first unread notification (they're ordered by created_at DESC)
        const unread = recent.find((n) => !n.read);
        setLatestUnread(unread || null);
        setError(null);
      }
    } catch (err) {
      console.error("Error fetching latest unread notification:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load notification"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchLatestUnread();
  }, [organizationId, locationId]);

  // Get navigation path based on notification type
  const getNotificationPath = (type: string) => {
    switch (type) {
      case "pms":
        return "/compare"; // Referral data lives on Compare page
      case "task":
        return "/home";
      case "agent":
        return "/home";
      case "ranking":
        return "/compare";
      default:
        return "/home";
    }
  };

  // Handle notification click
  const handleNotificationClick = async () => {
    if (!latestUnread || !organizationId) return;

    setIsMarking(true);
    try {
      // Mark as read
      await markNotificationRead(latestUnread.id, organizationId);

      // Navigate to appropriate page
      navigate(getNotificationPath(latestUnread.type));

      // Refresh to show next unread notification
      await fetchLatestUnread();

      // Optional callback
      onNotificationRead?.();
    } catch (err) {
      console.error("Error marking notification as read:", err);
      setError(err instanceof Error ? err.message : "Failed to mark as read");
    } finally {
      setIsMarking(false);
    }
  };

  // Handle mark as read button (without navigation)
  const handleMarkAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    if (!latestUnread || !organizationId) return;

    setIsMarking(true);
    try {
      await markNotificationRead(latestUnread.id, organizationId);

      // Refresh to show next unread notification
      await fetchLatestUnread();

      // Optional callback
      onNotificationRead?.();
    } catch (err) {
      console.error("Error marking notification as read:", err);
      setError(err instanceof Error ? err.message : "Failed to mark as read");
    } finally {
      setIsMarking(false);
    }
  };

  // Get icon and styling for notification type
  const getNotificationStyle = (type: string) => {
    const styleMap: Record<
      string,
      {
        Icon: React.ComponentType<{ size?: number; className?: string }>;
        iconBg: string;
        iconColor: string;
        impactBg: string;
        impactText: string;
        impactBorder: string;
        impactLabel: string;
      }
    > = {
      pms: {
        Icon: CheckCircle2,
        iconBg: "bg-green-50",
        iconColor: "text-green-600",
        impactBg: "bg-indigo-50",
        impactText: "text-alloro-orange",
        impactBorder: "border-indigo-100",
        impactLabel: "Verified",
      },
      task: {
        Icon: Zap,
        iconBg: "bg-amber-50",
        iconColor: "text-amber-600",
        impactBg: "bg-amber-50",
        impactText: "text-amber-600",
        impactBorder: "border-amber-100",
        impactLabel: "High Priority",
      },
      agent: {
        Icon: CheckCircle2,
        iconBg: "bg-purple-50",
        iconColor: "text-purple-600",
        impactBg: "bg-indigo-50",
        impactText: "text-alloro-orange",
        impactBorder: "border-indigo-100",
        impactLabel: "Strategic",
      },
      ranking: {
        Icon: TrendingUp,
        iconBg: "bg-green-50",
        iconColor: "text-green-600",
        impactBg: "bg-indigo-50",
        impactText: "text-alloro-orange",
        impactBorder: "border-indigo-100",
        impactLabel: "Strategic",
      },
      system: {
        Icon: AlertCircle,
        iconBg: "bg-red-50",
        iconColor: "text-red-600",
        impactBg: "bg-red-50",
        impactText: "text-red-600",
        impactBorder: "border-red-100",
        impactLabel: "Critical",
      },
    };
    return (
      styleMap[type] || {
        Icon: Info,
        iconBg: "bg-slate-50",
        iconColor: "text-slate-600",
        impactBg: "bg-slate-50",
        impactText: "text-slate-600",
        impactBorder: "border-slate-100",
        impactLabel: "Info",
      }
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-4">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-[#D56753]" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200/60 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[#1A1D23]">Could not load updates</p>
            <p className="text-xs text-[#1A1D23]/40 mt-0.5">
              Try refreshing in a moment.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state - no unread notifications
  if (!latestUnread) {
    return (
      <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <div>
            <p className="text-sm font-semibold text-[#1A1D23]">
              All caught up
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Alloro is monitoring your market. Updates appear here when something needs your attention.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render notification - newdesign pattern
  const style = getNotificationStyle(latestUnread.type);
  const Icon = style.Icon;

  return (
    <div
      onClick={handleNotificationClick}
      className="rounded-2xl bg-stone-50/80 border border-stone-200/60 overflow-hidden cursor-pointer hover:bg-stone-100/50 transition-colors group"
    >
      <div className="p-5 sm:p-6 flex gap-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.iconBg} ${style.iconColor}`}
        >
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#1A1D23] leading-snug">
              {latestUnread.title}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border shrink-0 ${style.impactBg} ${style.impactText} ${style.impactBorder}`}
            >
              {style.impactLabel}
            </span>
          </div>
          {latestUnread.message && (
            <p className="text-sm text-gray-500 mt-1 leading-relaxed line-clamp-2">
              {latestUnread.message}
            </p>
          )}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <Clock size={12} />
                {formatDistanceToNow(new Date(latestUnread.created_at), {
                  addSuffix: true,
                })}
              </span>
              <button
                onClick={handleMarkAsRead}
                disabled={isMarking}
                className="text-[#D56753] font-semibold hover:underline disabled:opacity-50"
              >
                {isMarking ? "Marking..." : "Acknowledge"}
              </button>
            </div>
            <ChevronRight
              size={16}
              className="text-gray-300 group-hover:text-[#D56753] transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
