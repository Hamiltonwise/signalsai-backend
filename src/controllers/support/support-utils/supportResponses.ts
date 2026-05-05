import { Response } from "express";

export function sendSuccess(
  res: Response,
  data: unknown,
  statusCode = 200
): Response {
  return res.status(statusCode).json({
    success: true,
    data,
    error: null,
  });
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 500,
  details: unknown = null
): Response {
  return res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      code,
      message,
      details,
    },
  });
}
