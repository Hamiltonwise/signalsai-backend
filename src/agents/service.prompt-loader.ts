/**
 * Prompt Loader Service
 *
 * Reads agent prompt markdown files from the src/agents/ directory.
 * Caches in memory after first read. Use clearPromptCache() for dev/testing.
 *
 * Resolution order:
 *   1. __dirname (works in dev with tsx — points to src/agents/)
 *   2. src/agents/ relative to project root (works in prod when running from dist/)
 */

import path from "path";
import fs from "fs";

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
  if (cache.has(agentPath)) return cache.get(agentPath)!;

  const filePath = path.join(AGENTS_DIR, `${agentPath}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `[PromptLoader] Agent prompt not found: ${filePath}`
    );
  }

  const content = fs.readFileSync(filePath, "utf-8").trim();
  cache.set(agentPath, content);
  return content;
}

/**
 * Clear the prompt cache. Useful during development or testing.
 */
export function clearPromptCache(): void {
  cache.clear();
}
