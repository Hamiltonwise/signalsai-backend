import { createNotification } from "../../../utils/core/notificationHelper";
import type { ITask } from "../../../models/TaskModel";

/**
 * Handle notification when a single USER task is approved.
 * Only sends notification when a USER-category task transitions from
 * is_approved=false to is_approved=true.
 *
 * Notification failure does NOT fail the parent operation.
 */
export async function handleApprovalNotification(
  task: ITask,
  wasApprovedBefore: boolean
): Promise<void> {
  const isApprovingUserTask =
    !wasApprovedBefore && task.category === "USER";

  if (!isApprovingUserTask || !task.domain_name) {
    return;
  }

  try {
    await createNotification(
      task.domain_name,
      "New Task Approved",
      "A new opportunity awaits your action! Visit the tasks tab to see more",
      "task",
      { taskId: task.id, taskTitle: task.title }
    );
    console.log(
      `[TASKS] Created notification for approved USER task ${task.id}`
    );
  } catch (notificationError: any) {
    console.error(
      `[TASKS] Failed to create notification: ${notificationError.message}`
    );
    // Don't fail the update if notification creation fails
  }
}

/**
 * Create notifications for bulk-approved USER tasks.
 * Groups by domain and sends one notification per domain.
 * Handles singular/plural messaging.
 *
 * Notification failure for any domain does NOT fail the parent operation.
 */
export async function createBulkApprovalNotifications(
  userTasksByDomain: Array<{ domain_name: string; count: number }>
): Promise<void> {
  for (const { domain_name, count } of userTasksByDomain) {
    try {
      const message =
        count === 1
          ? "A new opportunity awaits your action! Visit the tasks tab to see more"
          : `${count} new opportunities awaiting your action! Visit tasks to see more`;

      await createNotification(
        domain_name,
        count === 1 ? "New Task Approved" : "New Tasks Approved",
        message,
        "task",
        { taskCount: count }
      );
      console.log(
        `[TASKS] Created notification for ${count} approved USER task(s) for ${domain_name}`
      );
    } catch (notificationError: any) {
      console.error(
        `[TASKS] Failed to create notification for ${domain_name}: ${notificationError.message}`
      );
      // Don't fail the approval if notification creation fails
    }
  }
}

/**
 * Group an array of tasks by domain_name and return counts per domain.
 * Used by bulk approval to determine how many notifications to send per domain.
 */
export function groupTasksByDomain(
  tasks: Array<{ domain_name: string }>
): Array<{ domain_name: string; count: number }> {
  const domainCounts = tasks.reduce(
    (acc: Record<string, number>, task) => {
      acc[task.domain_name] = (acc[task.domain_name] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return Object.entries(domainCounts).map(([domain, count]) => ({
    domain_name: domain,
    count: count as number,
  }));
}
