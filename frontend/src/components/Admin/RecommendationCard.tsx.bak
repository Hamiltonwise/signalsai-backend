import { useState } from "react";
import { CheckSquare, Square, Loader2 } from "lucide-react";
import type { AgentRecommendation } from "../../types/agentInsights";

interface Props {
  recommendation: AgentRecommendation;
  onUpdate: () => void;
}

/**
 * Individual recommendation card with status checkbox
 * and placeholder "Feed to Fixer agent" button
 */
export default function RecommendationCard({
  recommendation,
  onUpdate,
}: Props) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggleStatus = async () => {
    if (isUpdating) return;

    setIsUpdating(true);

    try {
      const newStatus =
        recommendation.status === "PENDING" ? "COMPLETED" : "PENDING";

      const response = await fetch(
        `/api/admin/agent-insights/recommendations/${recommendation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      const data = await response.json();

      if (data.success) {
        onUpdate(); // Refresh parent data
      } else {
        alert("Failed to update status: " + (data.message || "Unknown error"));
      }
    } catch (error) {
      console.error("Failed to update recommendation status:", error);
      alert("Failed to update status. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFixerAgent = () => {
    // Placeholder for future feature
    alert("Fixer Agent feature is coming soon!");
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Card Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Title */}
          <p className="flex-1 text-gray-900 font-medium leading-snug">
            {recommendation.title}
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Feed to Fixer Agent Button (Placeholder) */}
            <button
              onClick={handleFixerAgent}
              className="text-blue-600 hover:text-blue-700 text-xs font-medium px-2 py-1 border border-blue-200 rounded hover:bg-blue-50 transition-colors whitespace-nowrap"
              title="Coming soon"
            >
              Feed to Fixer agent
            </button>

            {/* Status Checkbox */}
            <button
              onClick={handleToggleStatus}
              disabled={isUpdating}
              className="flex-shrink-0 cursor-pointer hover:scale-110 transition-transform disabled:cursor-not-allowed disabled:hover:scale-100"
              title={
                recommendation.status === "COMPLETED"
                  ? "Mark as pending"
                  : "Mark as completed"
              }
            >
              {isUpdating ? (
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              ) : recommendation.status === "COMPLETED" ? (
                <CheckSquare className="w-5 h-5 text-green-600 hover:text-green-700" />
              ) : (
                <Square className="w-5 h-5 text-gray-400 hover:text-blue-600" />
              )}
            </button>
          </div>
        </div>

        {/* Status Badge */}
        {recommendation.status === "PENDING" && (
          <div className="mt-2">
            <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-orange-50 text-orange-600 rounded border border-orange-200">
              Pending
            </span>
          </div>
        )}

        {/* Metadata Tags */}
        {(recommendation.urgency ||
          recommendation.category ||
          recommendation.severity > 1) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {recommendation.urgency && (
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded border border-gray-200">
                {recommendation.urgency}
              </span>
            )}
            {recommendation.category && (
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded border border-gray-200">
                {recommendation.category}
              </span>
            )}
            {recommendation.severity > 1 && (
              <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded border border-red-200">
                Severity {recommendation.severity}
              </span>
            )}
          </div>
        )}

        {/* Expand/Collapse Button */}
        {(recommendation.explanation || recommendation.suggested_action) && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {isExpanded ? "Show less" : "Show details"}
          </button>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-200 bg-gray-50">
          {/* Explanation */}
          {recommendation.explanation && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Explanation
              </h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                {recommendation.explanation}
              </p>
            </div>
          )}

          {/* Suggested Action */}
          {recommendation.suggested_action && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Suggested Action
              </h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                {recommendation.suggested_action}
              </p>
            </div>
          )}

          {/* Metadata Grid */}
          <div className="mt-4 grid grid-cols-2 gap-4">
            {recommendation.verdict && (
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-1">
                  Verdict
                </h4>
                <p
                  className={`text-sm font-medium ${
                    recommendation.verdict === "PASS"
                      ? "text-green-400"
                      : recommendation.verdict === "FAIL"
                      ? "text-red-400"
                      : "text-yellow-400"
                  }`}
                >
                  {recommendation.verdict}
                </p>
              </div>
            )}

            {recommendation.confidence !== null && (
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-1">
                  Confidence
                </h4>
                <p className="text-sm text-gray-700">
                  {(recommendation.confidence * 100).toFixed(0)}%
                </p>
              </div>
            )}

            {recommendation.type && (
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-1">
                  Type
                </h4>
                <p className="text-sm text-gray-700">{recommendation.type}</p>
              </div>
            )}

            {recommendation.escalation_required && (
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-1">
                  Escalation
                </h4>
                <p className="text-sm text-red-400">Required</p>
              </div>
            )}
          </div>

          {/* Evidence Links */}
          {recommendation.evidence_links &&
            recommendation.evidence_links.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-gray-600 mb-2">
                  Evidence
                </h4>
                <ul className="space-y-1">
                  {recommendation.evidence_links.map((link, index) => (
                    <li key={index}>
                      <a
                        href={link.url}
                        className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.label || link.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {/* Rule Reference */}
          {recommendation.rule_reference && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-gray-600 mb-1">
                Rule Reference
              </h4>
              <p className="text-xs text-gray-500">
                {recommendation.rule_reference}
              </p>
            </div>
          )}

          {/* Timestamps */}
          <div className="mt-4 text-xs text-gray-500">
            <p>
              Created: {new Date(recommendation.created_at).toLocaleString()}
            </p>
            {recommendation.completed_at && (
              <p>
                Completed:{" "}
                {new Date(recommendation.completed_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
