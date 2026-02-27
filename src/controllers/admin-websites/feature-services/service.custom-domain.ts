/**
 * Custom Domain Service
 *
 * Business logic for connecting, verifying, and disconnecting
 * custom domains on website projects.
 */

import dns from "dns";
import { promisify } from "util";
import { db } from "../../../database/connection";

const resolve4 = promisify(dns.resolve4);
const PROJECTS_TABLE = "website_builder.projects";
const RENDERER_IP = process.env.SITE_RENDERER_IP || "";

type ServiceError = { status: number; code: string; message: string };
type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: ServiceError };

// ---------------------------------------------------------------------------
// Connect domain (save to DB, clear verification)
// ---------------------------------------------------------------------------

export async function connectDomain(
  projectId: string,
  domain: string
): Promise<Result<{ custom_domain: string; server_ip: string }>> {
  // Validate domain format
  const cleaned = domain.trim().toLowerCase();
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(cleaned)) {
    return {
      error: {
        status: 400,
        code: "INVALID_DOMAIN",
        message: "Invalid domain format. Example: www.example.com",
      },
    };
  }

  // Check project exists
  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  // Check domain is not already used by another project
  const existing = await db(PROJECTS_TABLE)
    .where("custom_domain", cleaned)
    .whereNot("id", projectId)
    .first();

  if (existing) {
    return {
      error: {
        status: 409,
        code: "DOMAIN_TAKEN",
        message: "This domain is already connected to another project",
      },
    };
  }

  // Save domain, clear verification
  await db(PROJECTS_TABLE).where("id", projectId).update({
    custom_domain: cleaned,
    domain_verified_at: null,
    updated_at: db.fn.now(),
  });

  console.log(`[Custom Domain] Connected ${cleaned} to project ${projectId}`);

  return {
    data: {
      custom_domain: cleaned,
      server_ip: RENDERER_IP,
    },
  };
}

// ---------------------------------------------------------------------------
// Verify domain (DNS A record check)
// ---------------------------------------------------------------------------

export async function verifyDomain(
  projectId: string
): Promise<Result<{ verified: boolean; custom_domain: string; resolved_ips?: string[] }>> {
  if (!RENDERER_IP) {
    return {
      error: {
        status: 500,
        code: "CONFIG_ERROR",
        message: "SITE_RENDERER_IP not configured on server",
      },
    };
  }

  const project = await db(PROJECTS_TABLE)
    .select("id", "custom_domain", "domain_verified_at")
    .where("id", projectId)
    .first();

  if (!project) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  if (!project.custom_domain) {
    return {
      error: {
        status: 400,
        code: "NO_DOMAIN",
        message: "No custom domain connected to this project",
      },
    };
  }

  // Already verified
  if (project.domain_verified_at) {
    return {
      data: {
        verified: true,
        custom_domain: project.custom_domain,
      },
    };
  }

  // DNS lookup
  let resolvedIps: string[];
  try {
    resolvedIps = await resolve4(project.custom_domain);
  } catch {
    return {
      data: {
        verified: false,
        custom_domain: project.custom_domain,
        resolved_ips: [],
      },
    };
  }

  const matches = resolvedIps.includes(RENDERER_IP);

  if (matches) {
    await db(PROJECTS_TABLE).where("id", projectId).update({
      domain_verified_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    console.log(`[Custom Domain] Verified ${project.custom_domain} for project ${projectId}`);
  }

  return {
    data: {
      verified: matches,
      custom_domain: project.custom_domain,
      resolved_ips: resolvedIps,
    },
  };
}

// ---------------------------------------------------------------------------
// Disconnect domain
// ---------------------------------------------------------------------------

export async function disconnectDomain(
  projectId: string
): Promise<Result<{ disconnected: boolean }>> {
  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  await db(PROJECTS_TABLE).where("id", projectId).update({
    custom_domain: null,
    domain_verified_at: null,
    updated_at: db.fn.now(),
  });

  console.log(`[Custom Domain] Disconnected domain from project ${projectId}`);

  return { data: { disconnected: true } };
}

// ---------------------------------------------------------------------------
// Get domain status
// ---------------------------------------------------------------------------

export async function getDomainStatus(
  projectId: string
): Promise<Result<{
  custom_domain: string | null;
  domain_verified_at: string | null;
  server_ip: string;
}>> {
  const project = await db(PROJECTS_TABLE)
    .select("id", "custom_domain", "domain_verified_at")
    .where("id", projectId)
    .first();

  if (!project) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  return {
    data: {
      custom_domain: project.custom_domain,
      domain_verified_at: project.domain_verified_at,
      server_ip: RENDERER_IP,
    },
  };
}
