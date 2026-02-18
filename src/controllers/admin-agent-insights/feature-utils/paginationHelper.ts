/**
 * Pagination utilities for admin agent insights.
 *
 * Consolidates pagination logic (offset calculation, metadata building)
 * that was duplicated across summary and recommendations endpoints.
 */

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Parse page and limit from query string values into validated numbers.
 *
 * @param page - Page number string (defaults to "1")
 * @param limit - Limit string (defaults to "50")
 * @returns Parsed pagination params with calculated offset
 */
export function parsePaginationParams(
  page?: string,
  limit?: string
): PaginationParams {
  const pageNum = parseInt(page || "1", 10);
  const limitNum = parseInt(limit || "50", 10);
  const offset = (pageNum - 1) * limitNum;

  return { page: pageNum, limit: limitNum, offset };
}

/**
 * Build pagination metadata from a total count and current params.
 *
 * @param total - Total number of items
 * @param page - Current page number
 * @param limit - Items per page
 * @returns PaginationMeta object
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
