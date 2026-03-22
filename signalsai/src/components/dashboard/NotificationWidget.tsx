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
        // Get first unread notification (they're ordered by created_at DESC)
        const unread = data.notifications.find((n) => !n.read);
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
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-premium">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-alloro-orange" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 rounded-2xl p-4 border border-red-200 shadow-premium">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center border border-red-200">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-800">Error Loading</p>
            <p className="text-[10px] text-red-600 font-semibold uppercase tracking-widest mt-0.5">
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state - no unread notifications
  if (!latestUnread) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-premium border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center border border-green-100 shadow-sm">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-base font-bold text-alloro-navy font-heading tracking-tight">
              All caught up
            </p>
            <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-widest mt-1">
              No unread notifications
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
      className="bg-white rounded-2xl border border-slate-200 shadow-premium overflow-hidden cursor-pointer hover:shadow-xl transition-all group relative"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-alloro-orange opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="p-6 lg:p-8 flex flex-col sm:flex-row gap-6">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border transition-all group-hover:scale-105 shadow-sm ${style.iconBg} ${style.iconColor} border-opacity-50`}
        >
          <Icon size={24} />
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-alloro-navy font-heading tracking-tight leading-none">
              {latestUnread.title}
            </h3>
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border shrink-0 w-fit ${style.impactBg} ${style.impactText} ${style.impactBorder}`}
            >
              {style.impactLabel}
            </span>
          </div>
          {latestUnread.message && (
            <p className="text-sm lg:text-base text-slate-500 font-medium leading-relaxed tracking-tight line-clamp-2">
              {latestUnread.message}
            </p>
          )}
          <div className="flex items-center justify-between pt-3">
            <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span className="flex items-center gap-2">
                <Clock size={14} className="opacity-40" />
                {formatDistanceToNow(new Date(latestUnread.created_at), {
                  addSuffix: true,
                })}
              </span>
              <button
                onClick={handleMarkAsRead}
                disabled={isMarking}
                className="text-alloro-orange hover:underline disabled:opacity-50"
              >
                {isMarking ? "Marking..." : "Acknowledge"}
              </button>
            </div>
            <ChevronRight
              size={20}
              className="text-slate-200 group-hover:text-alloro-orange transition-all group-hover:translate-x-2"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
