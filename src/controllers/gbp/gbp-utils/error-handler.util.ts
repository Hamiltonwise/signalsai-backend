import express from "express";

/** Error helper */
export function handleError(res: express.Response, error: any, operation: string) {
  console.error(
    `${operation} Error:`,
    error?.response?.data || error?.message || error,
  );
  return res
    .status(500)
    .json({ error: `Failed to ${operation.toLowerCase()}` });
}
