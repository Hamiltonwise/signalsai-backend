import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Star, Loader2 } from "lucide-react";
import { triggerReviewSync } from "../../api/reviewBlocks";
import { ActionButton } from "../ui/DesignSystem";

interface ReviewsTabProps {
  projectId: string;
  organizationId?: number;
}

interface ReviewStats {
  total: number;
  average: number;
  distribution: Record<number, number>;
}

export default function ReviewsTab({ projectId, organizationId }: ReviewsTabProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/websites/${projectId}/reviews/stats`);
      if (response.ok) {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          if (data.success) setStats(data.data);
        } catch {
          // Non-JSON response — ignore
        }
      }
    } catch {
      // Stats endpoint may not exist yet — non-fatal
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await triggerReviewSync(projectId);
      setSyncMessage(`Sync started (job ${result.data.jobId}). Reviews will update shortly.`);
      // Reload stats after a delay to show updated counts
      setTimeout(() => loadStats(), 5000);
    } catch (err: any) {
      setSyncMessage(err.message || "Failed to trigger review sync");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Reviews</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Synced from Google Business Profile. Used by{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{"{{ review_block }}"}</code>{" "}
            shortcodes on your pages.
          </p>
        </div>
        <ActionButton
          label={syncing ? "Syncing..." : "Sync Reviews from GBP"}
          icon={<RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />}
          onClick={handleSync}
          variant="primary"
          disabled={syncing || !organizationId}
        />
      </div>

      {/* Sync message */}
      {syncMessage && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
          {syncMessage}
        </div>
      )}

      {/* No org warning */}
      {!organizationId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          Link this project to an organization with a Google Business Profile connection to sync reviews.
        </div>
      )}

      {/* Stats */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading review stats...
        </div>
      ) : stats ? (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm text-gray-500">Total Reviews</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm text-gray-500">Average Rating</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-gray-900">{stats.average.toFixed(1)}</p>
              <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm text-gray-500">Rating Distribution</p>
            <div className="flex items-end gap-1 mt-2 h-8">
              {[1, 2, 3, 4, 5].map((star) => {
                const count = stats.distribution[star] || 0;
                const maxCount = Math.max(...Object.values(stats.distribution), 1);
                const height = Math.max((count / maxCount) * 100, 4);
                return (
                  <div key={star} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className="w-full bg-yellow-400 rounded-sm"
                      style={{ height: `${height}%` }}
                      title={`${star} star: ${count}`}
                    />
                    <span className="text-xs text-gray-400">{star}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <Star className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No reviews synced yet.</p>
          <p className="text-xs mt-1">Click "Sync Reviews from GBP" to fetch reviews from your Google Business Profile.</p>
        </div>
      )}
    </div>
  );
}
