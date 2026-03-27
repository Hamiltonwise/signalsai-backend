/**
 * Websites API - Admin portal for website-builder data
 */

import type { Section } from "./templates";

export interface WebsiteProject {
  id: string;
  user_id: string;
  generated_hostname: string;
  display_name: string | null;
  custom_domain: string | null;
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

export interface SeoData {
  location_context?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  canonical_url?: string | null;
  robots?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  og_type?: string | null;
  max_image_preview?: string | null;
  schema_json?: Record<string, unknown>[] | null;
  scores?: Record<string, unknown> | null;
  insights?: Record<string, string> | null;
}

export interface WebsitePage {
  id: string;
  project_id: string;
  path: string;
  display_name: string | null;
  version: number;
  status: string;
  generation_status?: PageGenerationStatus | null;
  page_type?: "sections" | "artifact";
  artifact_s3_prefix?: string | null;
  sections: Section[];
  seo_data: SeoData | null;
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
// PAGE GENERATION STATUS
// =====================================================================

export type PageGenerationStatus = 'queued' | 'generating' | 'ready' | 'failed';

export interface PageGenerationStatusItem {
  id: string;
  path: string;
  status: string;
  generation_status: PageGenerationStatus;
  template_page_name: string | null;
  updated_at: string;
}

/**
 * Poll per-page generation status for a project
 */
export const fetchPagesGenerationStatus = async (
  projectId: string,
): Promise<{ success: boolean; data: PageGenerationStatusItem[] }> => {
  const response = await fetch(`${API_BASE}/${projectId}/pages/generation-status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch page generation status: ${response.statusText}`);
  }
  return response.json();
};

// =====================================================================
// CREATE ALL FROM TEMPLATE
// =====================================================================

export interface CreateAllFromTemplateRequest {
  templateId: string;
  placeId: string;
  pages: Array<{
    templatePageId: string;
    path: string;
    websiteUrl?: string | null;
  }>;
  businessName?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  phone?: string;
  category?: string;
  primaryColor?: string;
  accentColor?: string;
  practiceSearchString?: string;
  rating?: number;
  reviewCount?: number;
}

/**
 * Create all pages from a template and kick off N8N pipeline per page
 */
export const createAllFromTemplate = async (
  projectId: string,
  data: CreateAllFromTemplateRequest,
): Promise<{ success: boolean; data: Array<{ id: string; path: string; templatePageId: string; generation_status: string }> }> => {
  const response = await fetch(`${API_BASE}/${projectId}/create-all-from-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create pages from template');
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
 * Create a blank page (no template, no pipeline)
 */
export const createBlankPage = async (
  projectId: string,
  data: { path: string; display_name?: string },
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await fetch(`${API_BASE}/${projectId}/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: data.path,
      sections: [],
      display_name: data.display_name,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create page");
  }

  return response.json();
};

/**
 * Upload an artifact page (React app zip build)
 */
export const uploadArtifactPage = async (
  projectId: string,
  data: { file: File; path: string; display_name?: string },
): Promise<{ success: boolean; data: WebsitePage }> => {
  const formData = new FormData();
  formData.append("file", data.file);
  formData.append("path", data.path);
  if (data.display_name) {
    formData.append("display_name", data.display_name);
  }

  const response = await fetch(`${API_BASE}/${projectId}/pages/artifact`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to upload artifact page");
  }

  return response.json();
};

/**
 * Replace an artifact page's build with a new zip
 */
export const replaceArtifactBuild = async (
  projectId: string,
  pageId: string,
  file: File,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_BASE}/${projectId}/pages/${pageId}/artifact`,
    {
      method: "PUT",
      body: formData,
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to replace artifact build");
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

export interface FileValue {
  url: string;
  name: string;
  type: string;
  s3Key: string;
}

export interface FormSection {
  title: string;
  fields: [string, string | FileValue][];
}

/** Contents can be flat key-value (legacy) or ordered sections array (new) */
export type FormContents = Record<string, string | FileValue> | FormSection[];

export interface FormSubmission {
  id: string;
  project_id: string;
  form_name: string;
  contents: FormContents;
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

// =====================================================================
// SEO
// =====================================================================

/**
 * Update page SEO data
 */
export const updatePageSeo = async (
  projectId: string,
  pageId: string,
  seoData: SeoData,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await fetch(`${API_BASE}/${projectId}/pages/${pageId}/seo`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seo_data: seoData }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update SEO data");
  }
  return response.json();
};

/**
 * Update post SEO data
 */
export const updatePostSeo = async (
  projectId: string,
  postId: string,
  seoData: SeoData,
): Promise<{ success: boolean; data: unknown }> => {
  const response = await fetch(`${API_BASE}/${projectId}/posts/${postId}/seo`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seo_data: seoData }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update post SEO data");
  }
  return response.json();
};

/**
 * AI-generate SEO data for a specific section
 */
export const generateSeo = async (
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: Record<string, unknown>,
): Promise<{ success: boolean; section: string; generated: Record<string, unknown>; insight: string }> => {
  const path = entityType === "page"
    ? `${API_BASE}/${projectId}/pages/${entityId}/seo/generate`
    : `${API_BASE}/${projectId}/posts/${entityId}/seo/generate`;
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to generate SEO data");
  }
  return response.json();
};

/**
 * Generate ALL SEO sections in a single request (fetches shared context once)
 */
export const generateAllSeo = async (
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: Record<string, unknown>,
): Promise<{ success: boolean; results: Array<{ section: string; generated: Record<string, unknown>; insight: string }> }> => {
  const path = entityType === "page"
    ? `${API_BASE}/${projectId}/pages/${entityId}/seo/generate-all`
    : `${API_BASE}/${projectId}/posts/${entityId}/seo/generate-all`;
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to generate all SEO data");
  }
  return response.json();
};

/**
 * Analyze existing SEO data for a page or post section (insights only, no regeneration)
 */
export const analyzeSeo = async (
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: Record<string, unknown>,
): Promise<{ success: boolean; section: string; insight: string }> => {
  const path = entityType === "page"
    ? `${API_BASE}/${projectId}/pages/${entityId}/seo/analyze`
    : `${API_BASE}/${projectId}/posts/${entityId}/seo/analyze`;
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to analyze SEO data");
  }
  return response.json();
};

/**
 * Start a bulk SEO generation job
 */
export const aiGeneratePostContent = async (
  projectId: string,
  data: { post_type_id: string; title: string; reference_url?: string; reference_content?: string },
): Promise<{ success: boolean; data: { content: string } }> => {
  const response = await fetch(`${API_BASE}/${projectId}/posts/ai-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to generate post content");
  }
  return response.json();
};

export const updatePageDisplayName = async (
  projectId: string,
  path: string,
  displayName: string | null,
): Promise<{ success: boolean }> => {
  const response = await fetch(`${API_BASE}/${projectId}/pages/display-name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, display_name: displayName }),
  });
  if (!response.ok) throw new Error("Failed to update display name");
  return response.json();
};

export const startBulkSeoGenerate = async (
  projectId: string,
  entityType: "page" | "post",
  postTypeId?: string,
  pagePaths?: string[],
): Promise<{ success: boolean; job_id: string; already_active?: boolean }> => {
  const response = await fetch(`${API_BASE}/${projectId}/seo/bulk-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_type: entityType, post_type_id: postTypeId, page_paths: pagePaths }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to start bulk SEO generation");
  }
  return response.json();
};

/**
 * Poll bulk SEO generation progress
 */
export interface BulkSeoStatus {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  total_count: number;
  completed_count: number;
  failed_count: number;
  failed_items: Array<{ id: string; title: string; error: string }> | null;
}

export const getBulkSeoStatus = async (
  projectId: string,
  jobId: string,
): Promise<{ success: boolean; data: BulkSeoStatus }> => {
  const response = await fetch(`${API_BASE}/${projectId}/seo/bulk-generate/${jobId}/status`, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch bulk SEO status");
  }
  return response.json();
};

/**
 * Check for an active bulk SEO job
 */
export const getActiveBulkSeoJob = async (
  projectId: string,
  entityType: "page" | "post",
  postTypeId?: string,
): Promise<{ success: boolean; data: BulkSeoStatus | null }> => {
  const params = new URLSearchParams({ entity_type: entityType });
  if (postTypeId) params.set("post_type_id", postTypeId);
  const response = await fetch(`${API_BASE}/${projectId}/seo/bulk-generate/active?${params.toString()}`, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to check active SEO job");
  }
  return response.json();
};

/**
 * Fetch all page/post SEO meta for uniqueness checking
 */
export const fetchAllSeoMeta = async (
  projectId: string,
): Promise<{
  success: boolean;
  data: {
    pages: Array<{ id: string; path: string; meta_title: string | null; meta_description: string | null }>;
    posts: Array<{ id: string; title: string; slug: string; meta_title: string | null; meta_description: string | null }>;
  };
}> => {
  const response = await fetch(`${API_BASE}/${projectId}/seo/all-meta`);
  if (!response.ok) throw new Error("Failed to fetch SEO meta");
  return response.json();
};

// =====================================================================
// AI COMMAND
// =====================================================================

export interface AiCommandTargets {
  pages?: string[] | "all";
  posts?: string[] | "all";
  layouts?: string[] | "all";
}

export interface AiCommandBatchStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  executed: number;
  failed: number;
}

export interface AiCommandBatch {
  id: string;
  project_id: string;
  prompt: string;
  targets: AiCommandTargets;
  status: "analyzing" | "ready" | "executing" | "completed" | "failed";
  summary: string | null;
  stats: AiCommandBatchStats;
  created_at: string;
  updated_at: string;
}

export interface AiCommandRecommendation {
  id: string;
  batch_id: string;
  target_type: "page_section" | "layout" | "post" | "create_redirect" | "update_redirect" | "delete_redirect" | "create_page" | "create_post" | "create_menu" | "update_menu" | "update_post_meta" | "update_page_path";
  target_id: string;
  target_label: string;
  target_meta: Record<string, unknown>;
  recommendation: string;
  instruction: string;
  current_html: string;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  execution_result: { success: boolean; error?: string; edited_html?: string } | null;
  sort_order: number;
  created_at: string;
}

export const createAiCommandBatch = async (
  projectId: string,
  data: { prompt?: string; targets?: AiCommandTargets; batch_type?: "ai_editor" | "ui_checker" | "link_checker" },
): Promise<{ success: boolean; data: AiCommandBatch }> => {
  const response = await fetch(`${API_BASE}/${projectId}/ai-command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create AI command batch");
  return response.json();
};

export const fetchAiCommandBatch = async (
  projectId: string,
  batchId: string,
): Promise<{ success: boolean; data: AiCommandBatch }> => {
  const response = await fetch(`${API_BASE}/${projectId}/ai-command/${batchId}`);
  if (!response.ok) throw new Error("Failed to fetch AI command batch");
  return response.json();
};

export const fetchAiCommandRecommendations = async (
  projectId: string,
  batchId: string,
  filters?: { status?: string; target_type?: string },
): Promise<{ success: boolean; data: AiCommandRecommendation[] }> => {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.target_type) params.append("target_type", filters.target_type);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const response = await fetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}/recommendations${qs}`,
  );
  if (!response.ok) throw new Error("Failed to fetch recommendations");
  return response.json();
};

export const updateAiCommandRecommendation = async (
  projectId: string,
  batchId: string,
  recId: string,
  status: "approved" | "rejected",
  referenceData?: { reference_url?: string; reference_content?: string },
): Promise<{ success: boolean; data: AiCommandRecommendation }> => {
  const response = await fetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}/recommendations/${recId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...referenceData }),
    },
  );
  if (!response.ok) throw new Error("Failed to update recommendation");
  return response.json();
};

export const bulkUpdateAiCommandRecommendations = async (
  projectId: string,
  batchId: string,
  status: "approved" | "rejected",
  filters?: { target_type?: string },
): Promise<{ success: boolean; data: { updated: number } }> => {
  const response = await fetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}/recommendations/bulk`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...filters }),
    },
  );
  if (!response.ok) throw new Error("Failed to bulk update recommendations");
  return response.json();
};

export const executeAiCommandBatch = async (
  projectId: string,
  batchId: string,
): Promise<{ success: boolean; data: { status: string } }> => {
  const response = await fetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}/execute`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error("Failed to execute AI command batch");
  return response.json();
};

// =====================================================================
// REDIRECTS
// =====================================================================

export interface Redirect {
  id: string;
  project_id: string;
  from_path: string;
  to_path: string;
  type: number;
  is_wildcard: boolean;
  created_at: string;
  updated_at: string;
}

export const listRedirects = async (
  projectId: string,
): Promise<{ success: boolean; data: Redirect[] }> => {
  const response = await fetch(`${API_BASE}/${projectId}/redirects`);
  if (!response.ok) throw new Error("Failed to list redirects");
  return response.json();
};

export const createRedirect = async (
  projectId: string,
  data: { from_path: string; to_path: string; type?: number },
): Promise<{ success: boolean; data: Redirect }> => {
  const response = await fetch(`${API_BASE}/${projectId}/redirects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to create redirect");
  }
  return response.json();
};

export const updateRedirect = async (
  projectId: string,
  redirectId: string,
  data: Partial<{ from_path: string; to_path: string; type: number }>,
): Promise<{ success: boolean; data: Redirect }> => {
  const response = await fetch(`${API_BASE}/${projectId}/redirects/${redirectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update redirect");
  return response.json();
};

export const deleteRedirect = async (
  projectId: string,
  redirectId: string,
): Promise<{ success: boolean }> => {
  const response = await fetch(`${API_BASE}/${projectId}/redirects/${redirectId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete redirect");
  return response.json();
};

export const listAiCommandBatches = async (
  projectId: string,
): Promise<{ success: boolean; data: AiCommandBatch[] }> => {
  const response = await fetch(`${API_BASE}/${projectId}/ai-command`);
  if (!response.ok) throw new Error("Failed to list AI command batches");
  return response.json();
};

export const renameAiCommandBatch = async (
  projectId: string,
  batchId: string,
  summary: string,
): Promise<{ success: boolean; data: AiCommandBatch }> => {
  const response = await fetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    },
  );
  if (!response.ok) throw new Error("Failed to rename batch");
  return response.json();
};

export const deleteAiCommandBatch = async (
  projectId: string,
  batchId: string,
): Promise<{ success: boolean }> => {
  const response = await fetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error("Failed to delete AI command batch");
  return response.json();
};
