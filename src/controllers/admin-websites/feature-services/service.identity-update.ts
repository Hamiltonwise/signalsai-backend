/**
 * Identity Update Service
 *
 * Accepts a natural-language instruction, uses Claude tool calling to pick
 * structured updates, and applies them to `project_identity`. Brand color
 * updates are also mirrored to the legacy `primary_color` / `accent_color`
 * columns for backward compatibility.
 *
 * Token-efficient: we do not round-trip the full identity JSON. Instead, we
 * send a minimal context (~500 tokens) and rely on the LLM to pick the right
 * tool + arguments. Each tool maps to a specific typed update in this service.
 */

import axios from "axios";
import { db } from "../../../database/connection";
import {
  runWithTools,
  type ToolSchema,
  type ToolCall,
} from "../../../agents/service.llm-runner";
import { uploadToS3 } from "../../../utils/core/s3";
import { buildMediaS3Key, buildS3Url } from "../../admin-media/feature-utils/util.s3-helpers";

const PROJECTS_TABLE = "website_builder.projects";
const LOG_PREFIX = "[IdentityUpdate]";

function log(msg: string, data?: Record<string, unknown>): void {
  console.log(`${LOG_PREFIX} ${msg}`, data ? JSON.stringify(data) : "");
}

// ---------------------------------------------------------------------------
// Tool Schemas
// ---------------------------------------------------------------------------

const VALID_COLOR_FIELDS = ["primary_color", "accent_color", "gradient_from", "gradient_to"] as const;
const VALID_BUSINESS_FIELDS = [
  "name", "phone", "address", "city", "state", "zip", "category", "website_url",
] as const;
const VALID_ARCHETYPES = [
  "family-friendly", "pediatric", "luxury-cosmetic", "specialist-clinical", "budget-accessible",
] as const;
const VALID_SOCIAL_PLATFORMS = [
  "facebook", "instagram", "linkedin", "youtube", "tiktok", "twitter",
] as const;

const TOOLS: ToolSchema[] = [
  {
    name: "update_brand_color",
    description: "Update a brand color. Use for primary, accent, or gradient stop colors.",
    input_schema: {
      type: "object",
      properties: {
        field: {
          type: "string",
          enum: [...VALID_COLOR_FIELDS],
          description: "Which color field to update",
        },
        value: {
          type: "string",
          description: "6-digit hex color (e.g., '#FF0000')",
        },
      },
      required: ["field", "value"],
    },
  },
  {
    name: "update_gradient",
    description: "Enable/disable the brand gradient or change its direction.",
    input_schema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        direction: {
          type: "string",
          enum: ["to-r", "to-br", "to-b", "to-tr"],
          description: "Gradient direction shorthand",
        },
      },
    },
  },
  {
    name: "update_business_field",
    description: "Update a business profile field (name, phone, address, etc.).",
    input_schema: {
      type: "object",
      properties: {
        field: {
          type: "string",
          enum: [...VALID_BUSINESS_FIELDS],
        },
        value: { type: "string" },
      },
      required: ["field", "value"],
    },
  },
  {
    name: "update_archetype",
    description: "Change the practice archetype — affects tone across all generated content.",
    input_schema: {
      type: "object",
      properties: {
        archetype: {
          type: "string",
          enum: [...VALID_ARCHETYPES],
        },
        reason: {
          type: "string",
          description: "Brief reasoning for the change (for audit trail)",
        },
      },
      required: ["archetype"],
    },
  },
  {
    name: "update_voice_tone",
    description: "Update the tone descriptor (e.g., 'warm and approachable').",
    input_schema: {
      type: "object",
      properties: {
        tone_descriptor: { type: "string" },
      },
      required: ["tone_descriptor"],
    },
  },
  {
    name: "update_uvp",
    description: "Set or replace the unique value proposition.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "update_founding_story",
    description: "Set or replace the founding story.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "update_core_values",
    description: "Replace the core values list.",
    input_schema: {
      type: "object",
      properties: {
        values: { type: "array", items: { type: "string" } },
      },
      required: ["values"],
    },
  },
  {
    name: "add_certification",
    description: "Add a certification to the list (e.g., 'ADA member').",
    input_schema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    },
  },
  {
    name: "remove_certification",
    description: "Remove a certification from the list.",
    input_schema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    },
  },
  {
    name: "add_service_area",
    description: "Add a service area (city or region).",
    input_schema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    },
  },
  {
    name: "remove_service_area",
    description: "Remove a service area.",
    input_schema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    },
  },
  {
    name: "add_social_link",
    description: "Add or replace a social media link.",
    input_schema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: [...VALID_SOCIAL_PLATFORMS],
        },
        url: { type: "string", description: "Full HTTPS URL" },
      },
      required: ["platform", "url"],
    },
  },
  {
    name: "remove_social_link",
    description: "Remove a social media link.",
    input_schema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: [...VALID_SOCIAL_PLATFORMS],
        },
      },
      required: ["platform"],
    },
  },
  {
    name: "update_logo",
    description: "Replace the logo. The URL will be downloaded, hosted on S3, and used in layouts.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "HTTPS URL to a logo image" },
      },
      required: ["url"],
    },
  },
];

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface IdentityUpdateResult {
  appliedTools: Array<{ name: string; input: Record<string, unknown>; message: string }>;
  message: string;
  identity: any;
  clarificationNeeded?: string;
}

export async function updateIdentityViaChat(
  projectId: string,
  instruction: string,
): Promise<IdentityUpdateResult> {
  log("Update requested", { projectId, instruction: instruction.slice(0, 200) });

  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const identity = parseIdentity(project.project_identity);
  if (!identity) {
    throw new Error("Project has no identity yet — run warmup first");
  }

  // Minimal context — let the LLM pick tools without knowing full identity
  const context = buildMinimalContext(identity);

  const systemPrompt = `You are an assistant that translates natural-language requests into structured identity updates for a dental/medical practice website.

Use the provided tools to apply the requested changes. If a request is ambiguous or needs clarification, respond with text asking the specific question. If a request would require multiple changes, call multiple tools in sequence.

Never invent data. If the admin says "change colors to match the brand" without specifying colors, ask for the specific hex values.`;

  const userMessage = `## Current Project Identity (summary)
${context}

## Admin Instruction
${instruction}

Apply the instruction by calling the appropriate tool(s). If the instruction is unclear, respond with text asking for clarification instead of calling a tool.`;

  const result = await runWithTools({
    systemPrompt,
    userMessage,
    tools: TOOLS,
    toolChoice: "auto",
    maxTokens: 1024,
  });

  if (result.toolCalls.length === 0) {
    return {
      appliedTools: [],
      message: result.textResponse || "No changes applied.",
      identity,
      clarificationNeeded: result.textResponse || undefined,
    };
  }

  const appliedTools: IdentityUpdateResult["appliedTools"] = [];

  for (const toolCall of result.toolCalls) {
    try {
      const message = await applyTool(projectId, identity, toolCall);
      appliedTools.push({
        name: toolCall.name,
        input: toolCall.input,
        message,
      });
      log("Tool applied", { name: toolCall.name, message });
    } catch (err: any) {
      log("Tool application failed", { name: toolCall.name, error: err.message });
      appliedTools.push({
        name: toolCall.name,
        input: toolCall.input,
        message: `Failed: ${err.message}`,
      });
    }
  }

  // Persist the updated identity
  identity.last_updated_at = new Date().toISOString();
  const legacyColors = {
    primary_color: identity.brand?.primary_color || null,
    accent_color: identity.brand?.accent_color || null,
  };
  await db(PROJECTS_TABLE)
    .where("id", projectId)
    .update({
      project_identity: JSON.stringify(identity),
      primary_color: legacyColors.primary_color,
      accent_color: legacyColors.accent_color,
      updated_at: db.fn.now(),
    });

  const combinedMessage = appliedTools.map((t) => t.message).join(" ");

  return {
    appliedTools,
    message: combinedMessage,
    identity,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseIdentity(value: unknown): any | null {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function buildMinimalContext(identity: any): string {
  const parts: string[] = [];
  const business = identity.business || {};
  const brand = identity.brand || {};
  const voice = identity.voice_and_tone || {};

  parts.push(`Business: ${business.name || "(unset)"} — ${business.category || "(unset)"}`);
  parts.push(`Colors: primary=${brand.primary_color || "(unset)"}, accent=${brand.accent_color || "(unset)"}`);
  parts.push(`Gradient: enabled=${!!brand.gradient_enabled}, from=${brand.gradient_from || "(unset)"}, to=${brand.gradient_to || "(unset)"}, dir=${brand.gradient_direction || "to-br"}`);
  parts.push(`Archetype: ${voice.archetype || "(unset)"} (${voice.tone_descriptor || "(unset)"})`);
  parts.push(`Logo: ${brand.logo_s3_url ? "set" : "(unset)"}`);

  return parts.join("\n");
}

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function isValidHttps(url: string): boolean {
  return /^https:\/\//.test(url);
}

async function applyTool(
  projectId: string,
  identity: any,
  toolCall: ToolCall,
): Promise<string> {
  identity.brand = identity.brand || {};
  identity.business = identity.business || {};
  identity.voice_and_tone = identity.voice_and_tone || {};
  identity.content_essentials = identity.content_essentials || {};
  identity.content_essentials.certifications = identity.content_essentials.certifications || [];
  identity.content_essentials.service_areas = identity.content_essentials.service_areas || [];
  identity.content_essentials.core_values = identity.content_essentials.core_values || [];
  identity.content_essentials.social_links = identity.content_essentials.social_links || {};

  const input = toolCall.input;

  switch (toolCall.name) {
    case "update_brand_color": {
      const field = String(input.field);
      const value = String(input.value);
      if (!VALID_COLOR_FIELDS.includes(field as any)) {
        throw new Error(`Invalid color field: ${field}`);
      }
      if (!isValidHex(value)) {
        throw new Error(`Invalid hex color: ${value}`);
      }
      identity.brand[field] = value.toUpperCase();
      return `${humanizeField(field)} updated to ${value.toUpperCase()}.`;
    }

    case "update_gradient": {
      if (typeof input.enabled === "boolean") {
        identity.brand.gradient_enabled = input.enabled;
      }
      if (input.direction) {
        identity.brand.gradient_direction = String(input.direction);
      }
      return `Gradient updated.`;
    }

    case "update_business_field": {
      const field = String(input.field);
      const value = String(input.value);
      if (!VALID_BUSINESS_FIELDS.includes(field as any)) {
        throw new Error(`Invalid business field: ${field}`);
      }
      identity.business[field] = value;
      return `Business ${humanizeField(field)} updated.`;
    }

    case "update_archetype": {
      const archetype = String(input.archetype);
      if (!VALID_ARCHETYPES.includes(archetype as any)) {
        throw new Error(`Invalid archetype: ${archetype}`);
      }
      identity.voice_and_tone.archetype = archetype;
      return `Archetype updated to ${archetype}.`;
    }

    case "update_voice_tone": {
      identity.voice_and_tone.tone_descriptor = String(input.tone_descriptor);
      return `Voice tone updated.`;
    }

    case "update_uvp": {
      identity.content_essentials.unique_value_proposition = String(input.text);
      return `Unique value proposition updated.`;
    }

    case "update_founding_story": {
      identity.content_essentials.founding_story = String(input.text);
      return `Founding story updated.`;
    }

    case "update_core_values": {
      if (!Array.isArray(input.values)) {
        throw new Error("values must be an array of strings");
      }
      identity.content_essentials.core_values = (input.values as unknown[]).map(String);
      return `Core values updated.`;
    }

    case "add_certification": {
      const value = String(input.value).trim();
      if (!value) throw new Error("Empty certification");
      if (!identity.content_essentials.certifications.includes(value)) {
        identity.content_essentials.certifications.push(value);
      }
      return `Certification "${value}" added.`;
    }

    case "remove_certification": {
      const value = String(input.value).trim();
      identity.content_essentials.certifications =
        identity.content_essentials.certifications.filter((c: string) => c !== value);
      return `Certification "${value}" removed.`;
    }

    case "add_service_area": {
      const value = String(input.value).trim();
      if (!value) throw new Error("Empty service area");
      if (!identity.content_essentials.service_areas.includes(value)) {
        identity.content_essentials.service_areas.push(value);
      }
      return `Service area "${value}" added.`;
    }

    case "remove_service_area": {
      const value = String(input.value).trim();
      identity.content_essentials.service_areas =
        identity.content_essentials.service_areas.filter((s: string) => s !== value);
      return `Service area "${value}" removed.`;
    }

    case "add_social_link": {
      const platform = String(input.platform);
      const url = String(input.url);
      if (!VALID_SOCIAL_PLATFORMS.includes(platform as any)) {
        throw new Error(`Invalid platform: ${platform}`);
      }
      if (!isValidHttps(url)) {
        throw new Error(`URL must be HTTPS: ${url}`);
      }
      identity.content_essentials.social_links[platform] = url;
      return `${platform} link added.`;
    }

    case "remove_social_link": {
      const platform = String(input.platform);
      delete identity.content_essentials.social_links[platform];
      return `${platform} link removed.`;
    }

    case "update_logo": {
      const url = String(input.url);
      if (!isValidHttps(url)) {
        throw new Error(`Logo URL must be HTTPS: ${url}`);
      }
      const s3Url = await downloadAndHostLogo(projectId, url);
      identity.brand.logo_s3_url = s3Url;
      return `Logo updated and hosted.`;
    }

    default:
      throw new Error(`Unknown tool: ${toolCall.name}`);
  }
}

function humanizeField(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function downloadAndHostLogo(
  projectId: string,
  logoUrl: string,
): Promise<string> {
  const response = await axios.get(logoUrl, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: { Accept: "image/*" },
  });

  const buffer = Buffer.from(response.data);
  const contentType = response.headers["content-type"] || "image/png";
  const ext = contentType.includes("svg")
    ? "svg"
    : contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
  const filename = `logo-${Date.now()}.${ext}`;
  const s3Key = buildMediaS3Key(projectId, filename);

  await uploadToS3(s3Key, buffer, contentType);
  return buildS3Url(s3Key);
}
