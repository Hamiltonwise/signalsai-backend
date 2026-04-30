import { GoogleConnectionModel } from "../models/GoogleConnectionModel";
import {
  OrganizationRecipientSettingsModel,
  RECIPIENT_CHANNELS,
  RecipientChannel,
} from "../models/OrganizationRecipientSettingsModel";
import { OrganizationUserModel } from "../models/OrganizationUserModel";
import { ProjectModel } from "../models/website-builder/ProjectModel";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RecipientSource =
  | "configured"
  | "legacy_project"
  | "org_admins"
  | "google_connection"
  | "env_fallback"
  | "none";

export interface RecipientResolution {
  recipients: string[];
  source: RecipientSource;
}

export interface RecipientChannelState {
  channel: RecipientChannel;
  recipients: string[];
  effectiveRecipients: string[];
  effectiveSource: RecipientSource;
}

export interface RecipientOrgUserOption {
  name: string;
  email: string;
  role: string;
}

interface RecipientSettingsError extends Error {
  statusCode: number;
  body: { error: string };
}

function recipientSettingsError(message: string): RecipientSettingsError {
  const error = new Error(message) as RecipientSettingsError;
  error.statusCode = 400;
  error.body = { error: message };
  return error;
}

function isRecipientChannel(value: string): value is RecipientChannel {
  return (RECIPIENT_CHANNELS as readonly string[]).includes(value);
}

export function assertRecipientChannel(value: string): RecipientChannel {
  if (!isRecipientChannel(value)) {
    throw recipientSettingsError("Invalid recipient channel");
  }
  return value;
}

export function normalizeRecipients(recipients: unknown): string[] {
  if (!Array.isArray(recipients)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const recipient of recipients) {
    if (typeof recipient !== "string") continue;
    const email = recipient.trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email) || seen.has(email)) continue;
    seen.add(email);
    normalized.push(email);
  }

  return normalized;
}

export function validateRecipientList(recipients: unknown): string[] {
  if (!Array.isArray(recipients)) {
    throw recipientSettingsError("recipients must be an array of email strings");
  }

  const invalid = recipients.filter(
    (recipient) =>
      typeof recipient !== "string" ||
      !EMAIL_REGEX.test(recipient.trim().toLowerCase())
  );

  if (invalid.length > 0) {
    throw recipientSettingsError(`Invalid email(s): ${invalid.join(", ")}`);
  }

  return normalizeRecipients(recipients);
}

function getEnvFallbackRecipients(channel: RecipientChannel): string[] {
  const fallback =
    process.env.RECIPIENT_FALLBACK_EMAILS ||
    (channel === "website_form"
      ? process.env.CONTACT_FORM_RECIPIENTS
      : process.env.ADMIN_EMAILS) ||
    "";

  return normalizeRecipients(fallback.split(","));
}

async function getOrgAdminRecipients(
  organizationId: number | null | undefined
): Promise<string[]> {
  if (!organizationId) return [];

  const users = await OrganizationUserModel.listByOrgWithUsers(organizationId);
  return normalizeRecipients(
    users.filter((user) => user.role === "admin").map((user) => user.email)
  );
}

async function getGoogleConnectionRecipient(
  organizationId: number | null | undefined
): Promise<string[]> {
  if (!organizationId) return [];

  const connection = await GoogleConnectionModel.findOneByOrganization(
    organizationId
  );
  return normalizeRecipients(connection?.email ? [connection.email] : []);
}

export async function getRecipientSetting(
  organizationId: number,
  channel: RecipientChannel
): Promise<string[]> {
  const setting =
    await OrganizationRecipientSettingsModel.findByOrganizationAndChannel(
      organizationId,
      channel
    );
  return normalizeRecipients(setting?.recipients ?? []);
}

export async function getConfiguredRecipients(params: {
  organizationId: number;
  channel: RecipientChannel;
  legacyProjectRecipients?: unknown;
}): Promise<string[]> {
  const setting =
    await OrganizationRecipientSettingsModel.findByOrganizationAndChannel(
      params.organizationId,
      params.channel
    );

  if (!setting && params.channel === "website_form") {
    return normalizeRecipients(params.legacyProjectRecipients);
  }

  return normalizeRecipients(setting?.recipients ?? []);
}

export async function updateRecipientSetting(
  organizationId: number,
  channel: RecipientChannel,
  recipients: unknown
): Promise<string[]> {
  const normalized = validateRecipientList(recipients);

  await OrganizationRecipientSettingsModel.upsertRecipients(
    organizationId,
    channel,
    normalized
  );

  if (channel === "website_form") {
    await ProjectModel.updateRecipientsByOrganization(organizationId, normalized);
  }

  return normalized;
}

export async function resolveRecipients(params: {
  organizationId?: number | null;
  channel: RecipientChannel;
  legacyProjectRecipients?: unknown;
}): Promise<RecipientResolution> {
  const { organizationId, channel } = params;

  if (organizationId) {
    const setting =
      await OrganizationRecipientSettingsModel.findByOrganizationAndChannel(
        organizationId,
        channel
      );
    const configured = normalizeRecipients(setting?.recipients ?? []);
    if (configured.length > 0) {
      return { recipients: configured, source: "configured" };
    }

    if (!setting && channel === "website_form") {
      const legacy = normalizeRecipients(params.legacyProjectRecipients);
      if (legacy.length > 0) {
        return { recipients: legacy, source: "legacy_project" };
      }
    }
  } else if (channel === "website_form") {
    const legacy = normalizeRecipients(params.legacyProjectRecipients);
    if (legacy.length > 0) {
      return { recipients: legacy, source: "legacy_project" };
    }
  }

  const orgAdmins = await getOrgAdminRecipients(organizationId);
  if (orgAdmins.length > 0) {
    return { recipients: orgAdmins, source: "org_admins" };
  }

  if (channel === "agent_notifications") {
    const googleConnection = await getGoogleConnectionRecipient(organizationId);
    if (googleConnection.length > 0) {
      return { recipients: googleConnection, source: "google_connection" };
    }
  }

  const envFallback = getEnvFallbackRecipients(channel);
  if (envFallback.length > 0) {
    return { recipients: envFallback, source: "env_fallback" };
  }

  return { recipients: [], source: "none" };
}

export async function listOrgUserRecipientOptions(
  organizationId: number
): Promise<RecipientOrgUserOption[]> {
  const users = await OrganizationUserModel.listByOrgWithUsers(organizationId);
  return users.map((user) => ({
    name: user.name,
    email: user.email,
    role: user.role,
  }));
}

export async function getOrganizationRecipientSettings(
  organizationId: number
): Promise<{
  channels: Record<RecipientChannel, RecipientChannelState>;
  orgUsers: RecipientOrgUserOption[];
}> {
  const [orgUsers, project] = await Promise.all([
    listOrgUserRecipientOptions(organizationId),
    ProjectModel.findByOrganizationId(organizationId),
  ]);
  const channels = {} as Record<RecipientChannel, RecipientChannelState>;

  for (const channel of RECIPIENT_CHANNELS) {
    const legacyProjectRecipients =
      channel === "website_form" ? project?.recipients : undefined;
    const recipients = await getConfiguredRecipients({
      organizationId,
      channel,
      legacyProjectRecipients,
    });
    const effective = await resolveRecipients({
      organizationId,
      channel,
      legacyProjectRecipients,
    });
    channels[channel] = {
      channel,
      recipients,
      effectiveRecipients: effective.recipients,
      effectiveSource: effective.source,
    };
  }

  return { channels, orgUsers };
}
