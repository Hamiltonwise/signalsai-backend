import React from "react";
import { Target, ArrowRight, CheckCircle, Clock } from "lucide-react";

interface NextBestActionProps {
  gbpData?: any;
  clarityData?: any;
  pmsData?: any;
  connectionStatus?: {
    gbp: boolean;
    clarity: boolean;
  };
}

export const NextBestAction: React.FC<NextBestActionProps> = ({
  gbpData,
  clarityData,
  connectionStatus = { gbp: false, clarity: false },
}) => {
  // Generate priority action based on real data
  const getPriorityAction = () => {
    // Check for critical issues first
    if (connectionStatus.clarity && clarityData?.deadClicks > 20) {
      return {
        title: "Fix Website Dead Clicks",
        description: `${clarityData.deadClicks} dead clicks detected on your website`,
        impact: "High Impact",
        color: "from-red-50 to-red-100 border-red-200",
        textColor: "text-red-800",
        badgeColor: "bg-red-600",
        estimate: "Estimated impact: +25% conversion improvement",
      };
    }

    // Check for GBP opportunities
    if (connectionStatus.gbp && gbpData?.averageRating < 4.5) {
      return {
        title: "Boost Review Rating",
        description: `Current rating is ${gbpData.averageRating.toFixed(
          1
        )}★ - focus on review improvement`,
        impact: "High Impact",
        color: "from-yellow-50 to-yellow-100 border-yellow-200",
        textColor: "text-yellow-800",
        badgeColor: "bg-yellow-600",
        estimate: "Estimated impact: +40% local visibility",
      };
    }

    // Default action if no critical issues
    return {
      title: "Ask 5 Recent Patients for Online Reviews",
      description: "Boost your online reputation and local search visibility",
      impact: "High Impact",
      color: "from-green-50 to-green-100 border-green-200",
      textColor: "text-green-800",
      badgeColor: "bg-green-600",
      estimate: "Estimated impact: +12% local visibility",
    };
  };

  const priorityAction = getPriorityAction();

  // Generate upcoming actions based on data
  const getUpcomingActions = () => {
    const actions = [];

    // Always include some standard actions
    actions.push({
      title: "Update Google Business hours for holiday season",
      status: "pending",
      date: "Tomorrow",
      color: "bg-blue-400",
    });

    // Add data-driven actions
    if (connectionStatus.gbp && gbpData?.newReviews === 0) {
      actions.push({
        title: "Follow up with recent patients for reviews",
        status: "pending",
        date: "This week",
        color: "bg-orange-400",
      });
    }

    // Add completed action
    actions.push({
      title: "Respond to recent reviews",
      status: "completed",
      date: "Completed",
      color: "bg-green-500",
    });

    return actions.slice(0, 4); // Limit to 4 actions
  };

  const upcomingActions = getUpcomingActions();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center space-x-3 mb-4">
        <Target className="w-5 h-5 text-green-600" />
        <h3 className="text-lg font-semibold text-gray-900">
          Next Best Action
        </h3>
      </div>

      <div className="space-y-4">
        <div
          className={`bg-gradient-to-r ${priorityAction.color} rounded-lg p-4`}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className={`font-semibold ${priorityAction.textColor}`}>
              Priority Action
            </h4>
            <span
              className={`text-xs ${priorityAction.badgeColor} text-white px-2 py-1 rounded-full`}
            >
              {priorityAction.impact}
            </span>
          </div>
          <p className={`text-sm ${priorityAction.textColor} mb-3`}>
            {priorityAction.description}
          </p>
          <div className="flex items-center justify-between">
            <span
              className={`text-xs ${priorityAction.textColor.replace(
                "800",
                "600"
              )}`}
            >
              {priorityAction.estimate}
            </span>
            <button
              className={`${priorityAction.badgeColor} text-white px-3 py-1 rounded-lg text-sm hover:opacity-90 flex items-center space-x-1 transition-all`}
            >
              <span>Start</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <h5 className="text-sm font-medium text-gray-700">
            Upcoming Actions
          </h5>

          {upcomingActions.map((action, index) => (
            <div
              key={index}
              className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {action.status === "completed" ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : action.status === "pending" ? (
                <div className={`w-2 h-2 ${action.color} rounded-full`} />
              ) : (
                <Clock className="w-4 h-4 text-gray-400" />
              )}
              <span
                className={`text-sm flex-1 ${
                  action.status === "completed"
                    ? "line-through text-gray-500"
                    : "text-gray-600"
                }`}
              >
                {action.title}
              </span>
              <span
                className={`text-xs ${
                  action.status === "completed"
                    ? "text-green-600"
                    : "text-gray-400"
                }`}
              >
                {action.date}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
