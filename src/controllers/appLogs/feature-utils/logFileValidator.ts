import { VALID_LOG_TYPES } from "./logFileConfig";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateLogType(logType: string): ValidationResult {
  if (!VALID_LOG_TYPES.includes(logType)) {
    return {
      isValid: false,
      error: `Invalid log type. Valid types: ${VALID_LOG_TYPES.join(", ")}`,
    };
  }
  return { isValid: true };
}

export function parseMaxLines(
  linesParam: string | undefined,
  defaultValue: number
): number {
  return parseInt(linesParam as string) || defaultValue;
}
