import path from "path";

export const LOG_FILES: Record<string, string> = {
  "agent-run": path.join(__dirname, "../../../logs/agent-run.log"),
  email: path.join(__dirname, "../../../logs/email.log"),
  "scraping-tool": path.join(__dirname, "../../../logs/scraping-tool.log"),
  "website-scrape": path.join(__dirname, "../../../logs/website-scrape.log"),
};

export const VALID_LOG_TYPES: string[] = Object.keys(LOG_FILES);

export const DEFAULT_LOG_TYPE = "agent-run";

export const DEFAULT_MAX_LINES = 500;

export function getLogFilePath(logType: string): string {
  return LOG_FILES[logType];
}
