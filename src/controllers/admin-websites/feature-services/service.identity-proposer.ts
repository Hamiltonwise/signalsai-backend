/**
 * Identity Proposer Service
 *
 * Takes a natural-language instruction, calls Claude with the `propose_updates`
 * tool, returns typed proposals for admin review. Applies only the proposals
 * the admin explicitly approves.
 *
 * Replaces the old service.identity-update.ts immediate-apply chat flow.
 */

import axios from "axios";
import { db } from "../../../database/connection";
import {
  runWithTools,
  type ToolSchema,
  type ToolCall,
} from "../../../agents/service.llm-runner";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { uploadToS3 } from "../../../utils/core/s3";
import {
  buildMediaS3Key,
  buildS3Url,
} from "../../admin-media/feature-utils/util.s3-helpers";

const PROJECTS_TABLE = "website_builder.projects";
const LOG_PREFIX = "[IdentityProposer]";

function log(msg: string, data?: Record<string, unknown>): void {
  console.log(`${LOG_PREFIX} ${msg}`, data ? JSON.stringify(data) : "");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProposalAction = "NEW" | "UPDATE" | "DELETE";

export interface IdentityProposal {
  id: string;
  action: ProposalAction;
  path: string;
  current_value: unknown;
  proposed_value: unknown;
  summary: string;
  reason: string;
  array_item?: boolean;
  critical: boolean;
  critical_reason?: string;
}

export interface ApplyResult {
  identity: any;
  appliedCount: number;
  skippedCount: number;
  warnings: string[];
}

// Critical paths (authoritative — server always enforces these regardless of LLM output)
const CRITICAL_PATH_PREFIXES = [
  "business.place_id",
  "business.name",
  "business.category",
  "brand.logo_s3_url",
  "voice_and_tone.archetype",
  "version",
  "warmed_up_at",
  "sources_used",
  "raw_inputs",
  "extracted_assets",
];

function isCriticalPath(path: string): boolean {
  return CRITICAL_PATH_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}.`),
  );
}

function criticalReasonFor(path: string): string {
  if (path === "business.place_id")
    return "Changing the place_id invalidates the GBP link; consider re-running warmup instead.";
  if (path === "business.name" || path === "business.category")
    return "Used across all generated content; changing after pages exist causes inconsistency.";
  if (path === "brand.logo_s3_url")
    return "Direct edit bypasses the download+host flow. Safer to update via the Summary tab logo field.";
  if (path === "voice_and_tone.archetype")
    return "Drives tone across all generated pages. Existing pages won't reflect the new archetype until regenerated.";
  if (path.startsWith("raw_inputs"))
    return "Frozen warmup snapshot. Editing breaks re-derivation.";
  if (path.startsWith("extracted_assets"))
    return "Derived data. Editing diverges from the source of truth.";
  if (
    path === "version" ||
    path === "warmed_up_at" ||
    path.startsWith("sources_used")
  )
    return "Identity metadata / audit trail.";
  return "This path is marked critical.";
}

// ---------------------------------------------------------------------------
// Tool schema
// ---------------------------------------------------------------------------

const PROPOSE_UPDATES_TOOL: ToolSchema = {
  name: "propose_updates",
  description:
    "Submit the full list of proposed updates for admin review. Must be called exactly once.",
  input_schema: {
    type: "object",
    properties: {
      proposals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["NEW", "UPDATE", "DELETE"] },
            path: { type: "string" },
            current_value: {},
            proposed_value: {},
            summary: { type: "string" },
            reason: { type: "string" },
            array_item: { type: "boolean" },
            critical: { type: "boolean" },
            critical_reason: { type: "string" },
          },
          required: ["action", "path", "summary", "reason", "critical"],
        },
      },
    },
    required: ["proposals"],
  },
};

// ---------------------------------------------------------------------------
// PUBLIC: generateProposals
// ---------------------------------------------------------------------------

export async function generateProposals(
  projectId: string,
  instruction: string,
): Promise<IdentityProposal[]> {
  log("Generating proposals", { projectId, instruction: instruction.slice(0, 200) });

  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) throw new Error(`Project ${projectId} not found`);
  const identity = parseIdentity(project.project_identity);
  if (!identity) {
    throw new Error("Project has no identity yet — run warmup first");
  }

  const prompt = loadPrompt("websiteAgents/builder/IdentityProposer");
  const summary = buildIdentitySummary(identity);

  const userMessage = `## CURRENT IDENTITY (summary)\n${summary}\n\n## USER INSTRUCTION\n${instruction}\n\nProduce proposals via the propose_updates tool.`;

  const result = await runWithTools({
    systemPrompt: prompt,
    userMessage,
    tools: [PROPOSE_UPDATES_TOOL],
    toolChoice: { type: "tool", name: "propose_updates" },
    maxTokens: 2048,
    costContext: {
      projectId,
      eventType: "identity-propose",
      metadata: { instruction_preview: instruction.slice(0, 200) },
    },
  });

  const call = result.toolCalls.find((c) => c.name === "propose_updates");
  if (!call) {
    log("LLM did not call propose_updates");
    return [];
  }

  const rawProposals = Array.isArray(call.input.proposals)
    ? (call.input.proposals as any[])
    : [];

  return rawProposals.map((p, idx) => normalizeProposal(p, idx, identity));
}

function normalizeProposal(
  raw: any,
  idx: number,
  identity: any,
): IdentityProposal {
  const path = String(raw.path || "");
  const serverCritical = isCriticalPath(path);
  const llmCritical = !!raw.critical;
  const critical = serverCritical || llmCritical;

  // If server says it's critical but LLM didn't set critical_reason, fill in a default
  const critical_reason = critical
    ? raw.critical_reason || criticalReasonFor(path)
    : undefined;

  // Backfill current_value from the identity if the LLM didn't supply it
  let current_value = raw.current_value;
  if (current_value === undefined && path) {
    current_value = readPath(identity, path) ?? null;
  }

  return {
    id: `prop-${idx}`,
    action: (raw.action || "UPDATE") as ProposalAction,
    path,
    current_value: current_value ?? null,
    proposed_value: raw.proposed_value ?? null,
    summary: String(raw.summary || ""),
    reason: String(raw.reason || ""),
    array_item: !!raw.array_item,
    critical,
    critical_reason,
  };
}

// ---------------------------------------------------------------------------
// PUBLIC: applyProposals
// ---------------------------------------------------------------------------

export async function applyProposals(
  projectId: string,
  approvedProposals: IdentityProposal[],
): Promise<ApplyResult> {
  log("Applying proposals", { projectId, count: approvedProposals.length });

  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) throw new Error(`Project ${projectId} not found`);
  const identity = parseIdentity(project.project_identity);
  if (!identity) {
    throw new Error("Project has no identity yet — run warmup first");
  }

  const warnings: string[] = [];
  let appliedCount = 0;
  let skippedCount = 0;

  for (const p of approvedProposals) {
    try {
      await applyOne(projectId, identity, p);
      appliedCount++;
    } catch (err: any) {
      skippedCount++;
      warnings.push(`${p.id} (${p.path}): ${err?.message || "apply failed"}`);
    }
  }

  identity.last_updated_at = new Date().toISOString();

  const primaryColor = identity.brand?.primary_color || null;
  const accentColor = identity.brand?.accent_color || null;

  await db(PROJECTS_TABLE).where("id", projectId).update({
    project_identity: JSON.stringify(identity),
    primary_color: primaryColor,
    accent_color: accentColor,
    updated_at: db.fn.now(),
  });

  return { identity, appliedCount, skippedCount, warnings };
}

async function applyOne(
  projectId: string,
  identity: any,
  proposal: IdentityProposal,
): Promise<void> {
  const { action, path, proposed_value, array_item } = proposal;

  // Validate path resolves
  if (!path) {
    throw new Error("Empty path");
  }

  // Special-case: brand.logo_s3_url UPDATE with a non-Alloro URL triggers download
  if (
    action === "UPDATE" &&
    path === "brand.logo_s3_url" &&
    typeof proposed_value === "string" &&
    /^https:\/\//i.test(proposed_value) &&
    !proposed_value.includes("alloro")
  ) {
    const hosted = await downloadAndHostLogo(projectId, proposed_value);
    writePath(identity, path, hosted);
    return;
  }

  // Type validation for known fields
  validateProposedValue(path, proposed_value);

  switch (action) {
    case "NEW": {
      if (array_item) {
        const current = readPath(identity, path);
        if (current === null || current === undefined) {
          writePath(identity, path, [proposed_value]);
        } else if (Array.isArray(current)) {
          current.push(proposed_value);
          writePath(identity, path, current);
        } else {
          throw new Error(`Path ${path} is not an array`);
        }
      } else {
        writePath(identity, path, proposed_value);
      }
      return;
    }
    case "UPDATE": {
      writePath(identity, path, proposed_value);
      return;
    }
    case "DELETE": {
      if (array_item) {
        const current = readPath(identity, path);
        if (Array.isArray(current)) {
          const idx = current.findIndex(
            (x) => JSON.stringify(x) === JSON.stringify(proposed_value),
          );
          if (idx >= 0) {
            current.splice(idx, 1);
            writePath(identity, path, current);
          } else {
            throw new Error("Item not found in array");
          }
        } else {
          throw new Error(`Path ${path} is not an array`);
        }
      } else {
        writePath(identity, path, null);
      }
      return;
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ---------------------------------------------------------------------------
// VALIDATION
// ---------------------------------------------------------------------------

const VALID_ARCHETYPES = [
  "family-friendly",
  "pediatric",
  "luxury-cosmetic",
  "specialist-clinical",
  "budget-accessible",
];

function validateProposedValue(path: string, value: unknown): void {
  if (path === "voice_and_tone.archetype" && value !== null) {
    if (typeof value !== "string" || !VALID_ARCHETYPES.includes(value)) {
      throw new Error(`Invalid archetype: ${value}`);
    }
  }
  if (path === "brand.gradient_text_color" && value !== null) {
    if (value !== "white" && value !== "dark") {
      throw new Error(
        `Invalid gradient_text_color: ${value} (must be "white" or "dark")`,
      );
    }
  }
  if (path === "brand.gradient_preset" && value !== null) {
    const valid = [
      "smooth",
      "lean-primary",
      "lean-accent",
      "soft-lean-primary",
      "soft-lean-accent",
      "warm-middle",
      "quick-transition",
      "long-transition",
    ];
    if (typeof value !== "string" || !valid.includes(value)) {
      throw new Error(
        `Invalid gradient_preset: ${value} (must be one of ${valid.join(", ")})`,
      );
    }
  }
  if (
    (path === "brand.primary_color" ||
      path === "brand.accent_color" ||
      path === "brand.gradient_from" ||
      path === "brand.gradient_to") &&
    value !== null
  ) {
    if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
      throw new Error(`Invalid hex color: ${value}`);
    }
  }
  if (
    (path.startsWith("content_essentials.social_links.") ||
      path === "brand.logo_s3_url") &&
    typeof value === "string" &&
    value.length > 0 &&
    !/^https:\/\//i.test(value)
  ) {
    throw new Error(`URL must be HTTPS: ${value}`);
  }
}

// ---------------------------------------------------------------------------
// PATH WALKING
// ---------------------------------------------------------------------------

function readPath(obj: any, path: string): unknown {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function writePath(obj: any, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] === null || cur[p] === undefined) {
      cur[p] = {};
    }
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

// ---------------------------------------------------------------------------
// CONTEXT SUMMARY (~500 tokens of current identity state)
// ---------------------------------------------------------------------------

function buildIdentitySummary(identity: any): string {
  const b = identity.business || {};
  const br = identity.brand || {};
  const v = identity.voice_and_tone || {};
  const ce = identity.content_essentials || {};

  const lines: string[] = [];
  lines.push(`business.name: ${b.name || "(unset)"}`);
  lines.push(`business.category: ${b.category || "(unset)"}`);
  lines.push(`business.place_id: ${b.place_id || "(unset)"}`);

  lines.push(`brand.primary_color: ${br.primary_color || "(unset)"}`);
  lines.push(`brand.accent_color: ${br.accent_color || "(unset)"}`);
  lines.push(
    `brand.gradient: enabled=${!!br.gradient_enabled}, from=${br.gradient_from || "null"}, to=${br.gradient_to || "null"}, direction=${br.gradient_direction || "to-br"}`,
  );
  lines.push(`brand.logo_s3_url: ${br.logo_s3_url ? "(set)" : "(unset)"}`);

  lines.push(`voice_and_tone.archetype: ${v.archetype || "(unset)"}`);
  lines.push(`voice_and_tone.tone_descriptor: ${v.tone_descriptor || "(unset)"}`);

  lines.push(`content_essentials.unique_value_proposition: ${trunc(ce.unique_value_proposition, 100) || "(unset)"}`);
  lines.push(`content_essentials.founding_story: ${trunc(ce.founding_story, 100) || "(unset)"}`);
  lines.push(`content_essentials.core_values: ${arrSummary(ce.core_values)}`);
  lines.push(`content_essentials.certifications: ${arrSummary(ce.certifications)}`);
  lines.push(`content_essentials.service_areas: ${arrSummary(ce.service_areas)}`);
  lines.push(`content_essentials.review_themes: ${arrSummary(ce.review_themes)}`);
  lines.push(
    `content_essentials.social_links: ${socialSummary(ce.social_links)}`,
  );

  return lines.join("\n");
}

function trunc(s: unknown, n: number): string {
  if (!s || typeof s !== "string") return "";
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

function arrSummary(arr: unknown): string {
  if (!Array.isArray(arr) || arr.length === 0) return "[]";
  return `[${arr.length} items: ${arr.slice(0, 3).join(", ")}${arr.length > 3 ? "..." : ""}]`;
}

function socialSummary(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "{}";
  const keys = Object.keys(obj).filter(
    (k) => (obj as any)[k] && typeof (obj as any)[k] === "string",
  );
  return keys.length > 0 ? `{${keys.join(", ")}}` : "{}";
}

function parseIdentity(value: unknown): any {
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

// ---------------------------------------------------------------------------
// LOGO DOWNLOAD
// ---------------------------------------------------------------------------

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
