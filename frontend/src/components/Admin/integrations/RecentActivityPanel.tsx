import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  RefreshCw,
  Loader2,
  CheckCircle2,
  ShieldAlert,
  XCircle,
  Inbox,
  CircleDashed,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  fetchSyncLogs,
  type SyncLog,
  type CrmSyncOutcome,
} from "../../../api/integrations";

interface Props {
  projectId: string;
  integrationId: string;
}

const OUTCOME_VISUALS: Record<
  CrmSyncOutcome,
  {
    label: string;
    badgeClass: string;
    icon: React.ReactNode;
  }
> = {
  success: {
    label: "Success",
    badgeClass: "bg-green-100 text-green-700",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  skipped_flagged: {
    label: "Skipped",
    badgeClass: "bg-amber-100 text-amber-700",
    icon: <ShieldAlert className="w-3 h-3" />,
  },
  failed: {
    label: "Failed",
    badgeClass: "bg-red-100 text-red-700",
    icon: <XCircle className="w-3 h-3" />,
  },
  no_mapping: {
    label: "No mapping",
    badgeClass: "bg-gray-100 text-gray-500",
    icon: <CircleDashed className="w-3 h-3" />,
  },
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function truncateError(err: string | null, max = 90): string | null {
  if (!err) return null;
  if (err.length <= max) return err;
  return err.slice(0, max - 1) + "…";
}

export default function RecentActivityPanel({ projectId, integrationId }: Props) {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await fetchSyncLogs(projectId, integrationId, { limit: 10 });
        setLogs(res.data || []);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to load sync logs";
        setError(msg);
        if (isRefresh) toast.error(msg);
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [projectId, integrationId],
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.15 }}
      className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-500" />
          <h4 className="text-sm font-semibold text-gray-900">Recent Activity</h4>
          <span className="text-xs text-gray-400">
            Last 10 sync attempts
          </span>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          Refresh
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading sync history…
        </div>
      ) : error ? (
        <div className="p-6 text-center text-red-600 text-sm">{error}</div>
      ) : logs.length === 0 ? (
        <div className="p-8 text-center">
          <Inbox className="mx-auto mb-3 text-gray-300" size={28} />
          <p className="text-gray-400 text-sm">No sync activity yet</p>
          <p className="text-gray-300 text-xs mt-1">
            Submit a mapped form to see push attempts here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Time
                </th>
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Outcome
                </th>
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Vendor form
                </th>
                <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="text-left px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => {
                const visual =
                  OUTCOME_VISUALS[log.outcome] ??
                  OUTCOME_VISUALS.no_mapping;
                return (
                  <tr key={log.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {formatTimestamp(log.attempted_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${visual.badgeClass}`}
                      >
                        {visual.icon}
                        {visual.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 font-mono truncate max-w-[180px]">
                      {log.vendor_form_id || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {log.vendor_response_status ?? "—"}
                    </td>
                    <td className="px-5 py-2 text-xs text-gray-500 max-w-[280px]">
                      {log.outcome === "failed" ? (
                        <span
                          className="text-red-600 truncate inline-block max-w-full align-middle"
                          title={log.error || ""}
                        >
                          {truncateError(log.error) || "Unknown error"}
                        </span>
                      ) : log.outcome === "skipped_flagged" ? (
                        <span className="text-amber-600 truncate inline-block max-w-full align-middle" title={log.error || ""}>
                          {truncateError(log.error) || "AI flagged as spam"}
                        </span>
                      ) : log.outcome === "no_mapping" ? (
                        <span className="text-gray-400">No mapping configured</span>
                      ) : (
                        <span className="text-green-700">Pushed to HubSpot</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
