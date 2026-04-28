/**
 * Prompt Loader Service
 *
 * Reads agent prompt markdown files from the src/agents/ directory.
 * Caches in memory after first read in production. In dev (NODE_ENV !==
 * "production") the cache is bypassed so prompt edits on disk take
 * effect on the next agent run without requiring a server restart.
 *
 * Resolution order:
 *   1. __dirname (works in dev with tsx — points to src/agents/)
 *   2. src/agents/ relative to project root (works in prod when running from dist/)
 */

import path from "path";
import fs from "fs";

const IS_PROD = process.env.NODE_ENV === "production";

const AGENTS_DIR = (() => {
  // Dev (tsx): __dirname = .../src/agents — .md files are here
  const devDir = path.resolve(__dirname);
  if (fs.existsSync(path.join(devDir, "monthlyAgents"))) return devDir;

  // Prod: __dirname = .../dist/agents — .md files live in src/agents/
  const srcDir = path.join(process.cwd(), "src", "agents");
  if (fs.existsSync(srcDir)) return srcDir;

  return devDir;
})();

const cache = new Map<string, string>();

/**
 * Load an agent prompt from a markdown file.
 *
 * @param agentPath - Path relative to src/agents/, without extension.
 *   Examples: "monthlyAgents/Summary", "websiteAgents/SeoAnalysis"
 * @returns The prompt text (full file contents)
 */
export function loadPrompt(agentPath: string): string {
  if (IS_PROD && cache.has(agentPath)) return cache.get(agentPath)!;

  const filePath = path.join(AGENTS_DIR, `${agentPath}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `[PromptLoader] Agent prompt not found: ${filePath}`
    );
  }

  const content = fs.readFileSync(filePath, "utf-8").trim();
  if (IS_PROD) cache.set(agentPath, content);
  return content;
}

/**
 * Clear the prompt cache. Useful during development or testing.
 */
export function clearPromptCache(): void {
  cache.clear();
}
