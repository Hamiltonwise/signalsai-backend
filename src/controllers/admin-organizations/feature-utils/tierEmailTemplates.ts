/**
 * Tier Email Templates
 *
 * Email body templates for tier change notifications.
 * Pure string formatting -- no logic, no side effects.
 */

/**
 * Build the email body for a DFY upgrade notification.
 * Preserves the exact format from the original route handler.
 */
export function dfyUpgradeEmail(
  orgId: number,
  orgName: string,
  hostname: string
): string {
  return `Organization "${orgName}" has been upgraded to DFY tier.

A website project has been created but needs pages generated.

Action required:
1. Go to Admin > Websites
2. Find project: ${hostname}
3. Click "Create Page" and select template

Organization ID: ${orgId}
Hostname: ${hostname}.sites.getalloro.com`;
}
