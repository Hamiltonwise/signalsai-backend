/**
 * Websites API - Admin portal for website-builder data
 */

import type { Section } from "./templates";

export interface WebsiteProject {
  id: string;
  user_id: string;
  generated_hostname: string;
  status: string;
  selected_place_id: string | null;
  selected_website_url: string | null;
  template_id: string | null;
  wrapper: string;
  header: string;
  footer: string;
  primary_color: string | null;
  accent_color: string | null;
  step_gbp_scrape: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  organization?: {
    id: number;
    name: string;
    subscription_tier: string;
  } | null;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export type EditChatHistory = Record<string, ChatHistoryMessage[]>;

export interface WebsitePage {
  id: string;
  project_id: string;
  path: string;
  version: number;
  status: string;
  sections: Section[];
  edit_chat_history: EditChatHistory | null;
  created_at: string;
  updated_at: string;
}

export interface WebsiteProjectWithPages extends WebsiteProject {
  pages: WebsitePage[];
}

export interface FetchWebsitesRequest {
  status?: string;
  page?: number;
  limit?: number;
}

export interface WebsitesResponse {
  success: boolean;
  data: WebsiteProject[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WebsiteDetailResponse {
  success: boolean;
  data: WebsiteProjectWithPages;
}

export interface StatusesResponse {
  success: boolean;
  statuses: string[];
}

const API_BASE = "/api/admin/websites";

/**
 * Fetch all website projects with pagination
 */
export const fetchWebsites = async (
  filters: FetchWebsitesRequest = {},
): Promise<WebsitesResponse> => {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  });

  const response = await fetch(
    `${API_BASE}${params.toString() ? `?${params.toString()}` : ""}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch websites: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Fetch a single website project with pages
 */
export const fetchWebsiteDetail = async (
  id: string,
): Promise<WebsiteDetailResponse> => {
  const response = await fetch(`${API_BASE}/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch website: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Get unique statuses for filter dropdown
 */
export const fetchStatuses = async (): Promise<StatusesResponse> => {
  const response = await fetch(`${API_BASE}/statuses`);

  if (!response.ok) {
    throw new Error(`Failed to fetch statuses: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Create a new website project
 */
export const createWebsite = async (data: {
  user_id?: string;
  hostname?: string;
}): Promise<{ success: boolean; data: WebsiteProject }> => {
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create website");
  }

  return response.json();
};

/**
 * Delete a website project
 */
export const deleteWebsite = async (
  id: string,
): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete website");
  }

  return response.json();
};

/**
 * Update a website project
 */
export const updateWebsite = async (
  id: string,
  data: Partial<WebsiteProject>,
): Promise<{ success: boolean; data: WebsiteProject }> => {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update website");
  }

  return response.json();
};

// =====================================================================
// PIPELINE
// =====================================================================

export interface StartPipelineRequest {
  projectId: string;
  placeId: string;
  templateId?: string;
  templatePageId?: string;
  path?: string;
  websiteUrl?: string | null;
  pageContext?: string;
  practiceSearchString?: string;
  businessName?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  phone?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  primaryColor?: string;
  accentColor?: string;
  scrapedData?: string | null;
}

/**
 * Trigger the N8N pipeline to generate a website page
 */
export const startPipeline = async (
  data: StartPipelineRequest,
): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_BASE}/start-pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to start pipeline");
  }

  return response.json();
};

// =====================================================================
// STATUS POLLING
// =====================================================================

export interface WebsiteStatusResponse {
  id: string;
  status: string;
  selected_place_id: string | null;
  selected_website_url: string | null;
  step_gbp_scrape: Record<string, unknown> | null;
  step_website_scrape: Record<string, unknown> | null;
  step_image_analysis: Record<string, unknown> | null;
  updated_at: string;
}

/**
 * Poll website project status (lightweight endpoint)
 */
export const pollWebsiteStatus = async (
  id: string,
): Promise<WebsiteStatusResponse> => {
  const response = await fetch(`${API_BASE}/${id}/status`);

  if (!response.ok) {
    throw new Error(`Failed to fetch website status: ${response.statusText}`);
  }

  return response.json();
};

// =====================================================================
// WEBSITE SCRAPE
// =====================================================================

export interface ScrapeResponse {
  success: boolean;
  baseUrl: string;
  pages: Record<string, string>;
  images: string[];
  elapsedMs: number;
  charLength: number;
  estimatedTokens: number;
  error?: string;
}

/**
 * Scrape a website for multi-page HTML content + images
 */
export const scrapeWebsite = async (url: string): Promise<ScrapeResponse> => {
  const response = await fetch(`${API_BASE}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to scrape website");
  }

  return response.json();
};

// =====================================================================
// PAGE EDITOR
// =====================================================================

/**
 * Fetch a single page by ID
 */
export const fetchPage = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await fetch(`${API_BASE}/${projectId}/pages/${pageId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch page");
  }

  return response.json();
};

/**
 * Create a draft from a published page (idempotent)
 */
export const createDraftFromPage = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await fetch(
    `${API_BASE}/${projectId}/pages/${pageId}/create-draft`,
    { method: "POST" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create draft");
  }

  return response.json();
};

/**
 * Update a draft page's sections and/or chat history
 */
export const updatePageSections = async (
  projectId: string,
  pageId: string,
  sections: Section[],
  editChatHistory?: EditChatHistory,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const body: Record<string, unknown> = { sections };
  if (editChatHistory !== undefined) {
    body.edit_chat_history = editChatHistory;
  }

  const response = await fetch(`${API_BASE}/${projectId}/pages/${pageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update page");
  }

  return response.json();
};

/**
 * Publish a draft page
 */
export const publishPage = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await fetch(
    `${API_BASE}/${projectId}/pages/${pageId}/publish`,
    { method: "POST" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to publish page");
  }

  return response.json();
};

/**
 * Delete a page version
 */
export const deletePageVersion = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_BASE}/${projectId}/pages/${pageId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete page version");
  }

  return response.json();
};

/**
 * Delete ALL versions of a page at a given path
 */
export const deletePageByPath = async (
  projectId: string,
  path: string,
): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(
    `${API_BASE}/${projectId}/pages/by-path?path=${encodeURIComponent(path)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete page");
  }

  return response.json();
};

export interface EditComponentRequest {
  alloroClass: string;
  currentHtml: string;
  instruction: string;
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface EditDebugInfo {
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  inputTokens: number;
  outputTokens: number;
}

export interface EditComponentResponse {
  success: boolean;
  editedHtml: string | null;
  message?: string;
  rejected?: boolean;
  debug?: EditDebugInfo;
}

/**
 * Send an edit instruction to Claude for a specific component
 */
export const editPageComponent = async (
  projectId: string,
  pageId: string,
  payload: EditComponentRequest,
): Promise<EditComponentResponse> => {
  const response = await fetch(
    `${API_BASE}/${projectId}/pages/${pageId}/edit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to edit component");
  }

  return response.json();
};

/**
 * Send an edit instruction to Claude for a layout component (header/footer)
 */
export const editLayoutComponent = async (
  projectId: string,
  payload: EditComponentRequest,
): Promise<EditComponentResponse> => {
  const response = await fetch(`${API_BASE}/${projectId}/edit-layout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to edit layout component");
  }

  return response.json();
};

/**
 * Fetch the page editor system prompt from admin settings
 */
export const fetchEditorSystemPrompt = async (): Promise<string> => {
  const response = await fetch(`${API_BASE}/editor/system-prompt`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch system prompt");
  }

  const data = await response.json();
  return data.prompt;
};

// =====================================================================
// CUSTOM DOMAIN
// =====================================================================

export interface ConnectDomainResponse {
  success: boolean;
  data: { custom_domain: string; server_ip: string };
}

export interface VerifyDomainResponse {
  success: boolean;
  data: { verified: boolean; custom_domain: string; resolved_ips?: string[] };
}

/** Connect a custom domain to a project (admin) */
export const connectDomain = async (
  projectId: string,
  domain: string,
): Promise<ConnectDomainResponse> => {
  const response = await fetch(`${API_BASE}/${projectId}/connect-domain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to connect domain");
  }

  return response.json();
};

/** Verify DNS for a project's custom domain (admin) */
export const verifyDomainAdmin = async (
  projectId: string,
): Promise<VerifyDomainResponse> => {
  const response = await fetch(`${API_BASE}/${projectId}/verify-domain`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to verify domain");
  }

  return response.json();
};

/** Disconnect custom domain from a project (admin) */
export const disconnectDomain = async (
  projectId: string,
): Promise<{ success: boolean }> => {
  const response = await fetch(`${API_BASE}/${projectId}/disconnect-domain`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to disconnect domain");
  }

  return response.json();
};

// =====================================================================
// ORGANIZATION LINKING
// =====================================================================

/**
 * Link or unlink a website to/from an organization
 */
export const linkWebsiteToOrganization = async (
  projectId: string,
  organizationId: number | null,
): Promise<{ success: boolean; data: WebsiteProject }> => {
  const token = localStorage.getItem("auth_token");
  const response = await fetch(`${API_BASE}/${projectId}/link-organization`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ organizationId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to link organization");
  }

  return response.json();
};

// =====================================================================
// CONTACT FORM
// =====================================================================

export interface ContactFormData {
  name: string;
  phone: string;
  email: string;
  service?: string;
  message?: string;
  captchaToken: string;
}

// =====================================================================
// RECIPIENTS
// =====================================================================

export interface RecipientsResponse {
  success: boolean;
  data: {
    recipients: string[];
    orgUsers: { name: string; email: string; role: string }[];
  };
}

export const fetchRecipients = async (
  projectId: string,
): Promise<RecipientsResponse> => {
  const response = await fetch(`${API_BASE}/${projectId}/recipients`);
  if (!response.ok) throw new Error("Failed to fetch recipients");
  return response.json();
};

export const updateRecipients = async (
  projectId: string,
  recipients: string[],
): Promise<{ success: boolean; data: { recipients: string[] } }> => {
  const response = await fetch(`${API_BASE}/${projectId}/recipients`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipients }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update recipients");
  }
  return response.json();
};

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================

export interface FormSubmission {
  id: string;
  project_id: string;
  form_name: string;
  contents: Record<string, string>;
  recipients_sent_to: string[];
  submitted_at: string;
  is_read: boolean;
  is_flagged?: boolean;
  flag_reason?: string;
}

export interface FormSubmissionsResponse {
  success: boolean;
  data: FormSubmission[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  unreadCount: number;
  flaggedCount: number;
  verifiedCount: number;
  optinsCount: number;
}

export const fetchFormSubmissions = async (
  projectId: string,
  page = 1,
  limit = 20,
  filter?: string,
): Promise<FormSubmissionsResponse> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filter) params.set("filter", filter);
  const response = await fetch(`${API_BASE}/${projectId}/form-submissions?${params}`);
  if (!response.ok) throw new Error("Failed to fetch form submissions");
  return response.json();
};

export const fetchFormSubmission = async (
  projectId: string,
  submissionId: string,
): Promise<{ success: boolean; data: FormSubmission }> => {
  const response = await fetch(`${API_BASE}/${projectId}/form-submissions/${submissionId}`);
  if (!response.ok) throw new Error("Failed to fetch submission");
  return response.json();
};

export const toggleFormSubmissionRead = async (
  projectId: string,
  submissionId: string,
  is_read: boolean,
): Promise<{ success: boolean }> => {
  const response = await fetch(`${API_BASE}/${projectId}/form-submissions/${submissionId}/read`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_read }),
  });
  if (!response.ok) throw new Error("Failed to update submission");
  return response.json();
};

export const deleteFormSubmission = async (
  projectId: string,
  submissionId: string,
): Promise<{ success: boolean }> => {
  const response = await fetch(`${API_BASE}/${projectId}/form-submissions/${submissionId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete submission");
  return response.json();
};

/**
 * Submit a contact form from a rendered site
 */
export const submitContactForm = async (
  data: ContactFormData,
): Promise<{ success: boolean }> => {
  const response = await fetch("/api/websites/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to submit contact form");
  }

  return response.json();
};
