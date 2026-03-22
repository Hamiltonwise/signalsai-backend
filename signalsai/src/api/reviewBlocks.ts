/**
 * Review Blocks API - Admin portal for managing review block templates
 */

import type { Section } from "./templates";

// =====================================================================
// TYPES
// =====================================================================

export interface ReviewBlock {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  description: string | null;
  sections: Section[];
  created_at: string;
  updated_at: string;
}

const TEMPLATES_BASE = "/api/admin/websites/templates";

// =====================================================================
// CRUD
// =====================================================================

export const fetchReviewBlocks = async (
  templateId: string
): Promise<{ success: boolean; data: ReviewBlock[] }> => {
  const response = await fetch(`${TEMPLATES_BASE}/${templateId}/review-blocks`);
  if (!response.ok) throw new Error(`Failed to fetch review blocks: ${response.statusText}`);
  return response.json();
};

export const fetchReviewBlock = async (
  templateId: string,
  reviewBlockId: string
): Promise<{ success: boolean; data: ReviewBlock }> => {
  const response = await fetch(`${TEMPLATES_BASE}/${templateId}/review-blocks/${reviewBlockId}`);
  if (!response.ok) throw new Error(`Failed to fetch review block: ${response.statusText}`);
  return response.json();
};

export const createReviewBlock = async (
  templateId: string,
  data: { name: string; description?: string; sections?: Section[] }
): Promise<{ success: boolean; data: ReviewBlock }> => {
  const response = await fetch(`${TEMPLATES_BASE}/${templateId}/review-blocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to create review block: ${response.statusText}`);
  }
  return response.json();
};

export const updateReviewBlock = async (
  templateId: string,
  reviewBlockId: string,
  data: Partial<Pick<ReviewBlock, "name" | "sections" | "description">>
): Promise<{ success: boolean; data: ReviewBlock }> => {
  const response = await fetch(`${TEMPLATES_BASE}/${templateId}/review-blocks/${reviewBlockId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to update review block: ${response.statusText}`);
  }
  return response.json();
};

export const deleteReviewBlock = async (
  templateId: string,
  reviewBlockId: string
): Promise<{ success: boolean }> => {
  const response = await fetch(`${TEMPLATES_BASE}/${templateId}/review-blocks/${reviewBlockId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`Failed to delete review block: ${response.statusText}`);
  return response.json();
};

// =====================================================================
// SYNC
// =====================================================================

export const triggerReviewSync = async (
  projectId: string
): Promise<{ success: boolean; data: { jobId: string } }> => {
  const response = await fetch(`/api/admin/websites/${projectId}/reviews/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to trigger review sync: ${response.statusText}`);
  }
  return response.json();
};
