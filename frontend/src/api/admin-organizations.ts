/**
 * Admin Organizations API
 *
 * Typed functions for admin organization management endpoints.
 * All functions use apiGet/apiPatch/apiDelete which internally call getPriorityItem
 * for auth tokens, making them pilot-mode-aware.
 */

import { apiGet, apiPatch, apiDelete, apiPost } from "./index";

/**
 * Typed interfaces for admin org responses
 */

export interface AdminOrganization {
  id: number;
  name: string;
  domain: string | null;
  organization_type: "health" | "saas" | null;
  subscription_tier: "DWY" | "DFY" | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  userCount: number;
  connections: { gbp: boolean };
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  joined_at: string;
  has_password: boolean;
}

export interface AdminConnection {
  accountId: string;
  email: string;
  properties: { gbp?: any[] };
}

export interface AdminWebsite {
  id: number;
  generated_hostname: string;
  status: string;
  created_at: string;
}

export interface AdminOrganizationDetail {
  id: number;
  name: string;
  domain: string | null;
  organization_type: "health" | "saas" | null;
  subscription_tier: "DWY" | "DFY" | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  userCount?: number;
  users: AdminUser[];
  connections: AdminConnection[];
  website: AdminWebsite | null;
}

export interface AdminGoogleProperty {
  id: number;
  location_id: number;
  type: "gbp";
  external_id: string;
  display_name: string | null;
  metadata: Record<string, unknown> | null;
  selected: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminLocation {
  id: number;
  organization_id: number;
  name: string;
  domain: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  googleProperties: AdminGoogleProperty[];
}

export interface AdminLocationsResponse {
  success: boolean;
  locations: AdminLocation[];
  total: number;
}

export interface AdminOrganizationsListResponse {
  success: boolean;
  organizations: AdminOrganization[];
}

export interface AdminOrganizationDetailResponse {
  success: boolean;
  organization: AdminOrganizationDetail;
  users: AdminUser[];
  connections: AdminConnection[];
  website: AdminWebsite | null;
}

export interface PilotSessionResponse {
  success: boolean;
  token: string;
  googleAccountId: number;
  user: { id: number; email: string };
}

/**
 * List all organizations with summary metadata
 */
export async function adminListOrganizations(): Promise<AdminOrganizationsListResponse> {
  return apiGet({ path: "/admin/organizations" });
}

/**
 * Get a single organization with users, connections, and website details
 */
export async function adminGetOrganization(
  orgId: number
): Promise<AdminOrganizationDetailResponse> {
  return apiGet({ path: `/admin/organizations/${orgId}` });
}

/**
 * Update organization name
 */
export async function adminUpdateOrganizationName(
  orgId: number,
  name: string
): Promise<{ success: boolean; message: string; organization: { id: number; name: string } }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}`,
    passedData: { name },
  });
}

/**
 * Update organization subscription tier
 */
export async function adminUpdateOrganizationTier(
  orgId: number,
  tier: "DWY" | "DFY"
): Promise<{ success: boolean; tier: string; message: string }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}/tier`,
    passedData: { tier },
  });
}

/**
 * Set organization type (health or saas). Immutable once set.
 */
export async function adminUpdateOrganizationType(
  orgId: number,
  type: "health" | "saas"
): Promise<{ success: boolean; type: string; message: string }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}/type`,
    passedData: { type },
  });
}

/**
 * Delete organization (requires confirmation)
 */
export async function adminDeleteOrganization(orgId: number): Promise<{ success: boolean }> {
  return apiDelete({ path: `/admin/organizations/${orgId}?confirmDelete=true` });
}

/**
 * Get all locations for an organization with their Google Properties
 */
export async function adminGetOrganizationLocations(
  orgId: number
): Promise<AdminLocationsResponse> {
  return apiGet({ path: `/admin/organizations/${orgId}/locations` });
}

/**
 * Create a new organization with an initial admin user
 */
export interface AdminCreateOrgInput {
  organization: {
    name: string;
    domain?: string;
    address?: string;
  };
  user: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  };
  location: {
    name: string;
    address?: string;
  };
}

export interface AdminCreateOrgResponse {
  success: boolean;
  organizationId: number;
  userId: number;
  locationId: number;
  message: string;
}

export async function adminCreateOrganization(
  input: AdminCreateOrgInput
): Promise<AdminCreateOrgResponse> {
  return apiPost({
    path: "/admin/organizations",
    passedData: input,
  });
}

/**
 * Lock out an organization (sets subscription_status to inactive).
 * Only works for orgs without active Stripe subscription.
 */
export async function adminLockoutOrganization(
  orgId: number
): Promise<{ success: boolean; message: string }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}/lockout`,
    passedData: {},
  });
}

/**
 * Unlock an organization (sets subscription_status back to active).
 */
export async function adminUnlockOrganization(
  orgId: number
): Promise<{ success: boolean; message: string }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}/unlock`,
    passedData: {},
  });
}

/**
 * Create a website project for an organization.
 * Only works if the org doesn't already have a project.
 */
export async function adminCreateProject(
  orgId: number
): Promise<{
  success: boolean;
  message: string;
  project?: { generated_hostname: string; status: string };
}> {
  return apiPost({
    path: `/admin/organizations/${orgId}/create-project`,
    passedData: {},
  });
}

/**
 * Remove payment method from an organization.
 * Cancels the Stripe subscription and clears Stripe IDs.
 * Reverts org to admin-granted state.
 */
export async function adminRemovePaymentMethod(
  orgId: number
): Promise<{ success: boolean; message: string }> {
  return apiPost({
    path: `/admin/organizations/${orgId}/remove-payment-method`,
    passedData: {},
  });
}

/**
 * Get detailed billing info for an organization (Stripe data).
 */
export interface AdminBillingPaymentMethod {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface AdminBillingInvoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  coupon: string | null;
  hostedInvoiceUrl: string | null;
}

export interface AdminBillingDiscount {
  couponName: string;
  percentOff: number | null;
  amountOff: number | null;
}

export interface AdminBillingDetails {
  success: boolean;
  paymentMethod: AdminBillingPaymentMethod | null;
  invoices: AdminBillingInvoice[];
  discount: AdminBillingDiscount | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

export async function adminGetBillingDetails(
  orgId: number
): Promise<AdminBillingDetails> {
  return apiGet({ path: `/admin/organizations/${orgId}/billing` });
}

/**
 * Start a pilot session as a specific user
 */
export async function adminStartPilotSession(
  userId: number
): Promise<PilotSessionResponse> {
  return apiPost({
    path: `/admin/pilot/${userId}`,
    passedData: {},
  });
}

/**
 * Set a temporary password for a user (admin only)
 */
export interface AdminSetPasswordResponse {
  success: boolean;
  temporaryPassword: string;
  message: string;
}

export async function adminSetUserPassword(
  userId: number,
  notifyUser: boolean
): Promise<AdminSetPasswordResponse> {
  return apiPost({
    path: `/admin/organizations/users/${userId}/set-password`,
    passedData: { notifyUser },
  });
}

/**
 * Get business data for an organization (org-level + all locations)
 */
export async function adminGetBusinessData(
  orgId: number
): Promise<{
  success: boolean;
  organization: { id: number; name: string; business_data: Record<string, unknown> | null };
  locations: Array<{
    id: number;
    name: string;
    is_primary: boolean;
    business_data: Record<string, unknown> | null;
  }>;
}> {
  return apiGet({ path: `/admin/organizations/${orgId}/business-data` });
}

/**
 * Refresh location business data from Google (admin-scoped)
 */
export async function adminRefreshBusinessData(
  orgId: number,
  locationId: number
): Promise<{ success: boolean; business_data: Record<string, unknown> }> {
  return apiPost({
    path: `/admin/organizations/${orgId}/locations/${locationId}/refresh-business-data`,
    passedData: {},
  });
}

/**
 * Sync org-level business data from primary location
 */
export async function adminSyncOrgBusinessData(
  orgId: number
): Promise<{ success: boolean; business_data: Record<string, unknown> }> {
  return apiPost({
    path: `/admin/organizations/${orgId}/sync-org-business-data`,
    passedData: {},
  });
}

// ── Org-scoped User Management ───────────────────────────────────

/**
 * Create a user and link to organization
 */
export interface AdminCreateOrgUserInput {
  email: string;
  password: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

export interface AdminCreateOrgUserResponse {
  success: boolean;
  user: { id: number; email: string; name: string; role: string };
  message: string;
}

export async function adminCreateOrgUser(
  orgId: number,
  data: AdminCreateOrgUserInput
): Promise<AdminCreateOrgUserResponse> {
  return apiPost({
    path: `/admin/organizations/${orgId}/users`,
    passedData: data,
  });
}

/**
 * Invite a user to organization (generates temp password)
 */
export interface AdminInviteOrgUserResponse {
  success: boolean;
  user: { id: number; email: string; name: string; role: string };
  temporaryPassword: string;
  message: string;
}

export async function adminInviteOrgUser(
  orgId: number,
  data: { email: string; role: string }
): Promise<AdminInviteOrgUserResponse> {
  return apiPost({
    path: `/admin/organizations/${orgId}/invite`,
    passedData: data,
  });
}

/**
 * Reset a user's password within an organization
 */
export async function adminResetOrgUserPassword(
  orgId: number,
  userId: number,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}/users/${userId}/password`,
    passedData: { newPassword },
  });
}

/**
 * Change a user's role within an organization
 */
export async function adminChangeOrgUserRole(
  orgId: number,
  userId: number,
  role: string
): Promise<{ success: boolean; message: string; role: string }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}/users/${userId}/role`,
    passedData: { role },
  });
}

/**
 * Remove a user from an organization (does not delete the user)
 */
export async function adminRemoveOrgUser(
  orgId: number,
  userId: number
): Promise<{ success: boolean; message: string }> {
  return apiDelete({
    path: `/admin/organizations/${orgId}/users/${userId}`,
  });
}
