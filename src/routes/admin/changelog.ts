/**
 * Changelog API -- auto-generated from GitHub commits.
 *
 * GET /api/admin/changelog
 *   Returns the last 50 commits on sandbox, grouped by date,
 *   plus which commits are ahead of main (pending production deploy).
 *
 * Uses GitHub API so it works on EC2 without local git access.
 * Falls back gracefully if GitHub is unreachable.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const changelogRoutes = express.Router();

const GITHUB_OWNER = "Hamiltonwise";
const GITHUB_REPO = "alloro";
const SANDBOX_BRANCH = "sandbox";

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  stats?: {
    total: number;
  };
  files?: Array<{ filename: string }>;
}

interface ChangelogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
  filesChanged: number;
  aheadOfMain: boolean;
}

interface ChangelogGroup {
  date: string;
  commits: ChangelogEntry[];
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Alloro-Changelog",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

changelogRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      // Fetch sandbox commits and compare in parallel
      const [sandboxRes, compareRes] = await Promise.all([
        fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=${SANDBOX_BRANCH}&per_page=50`,
          { headers: getHeaders() }
        ),
        fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/compare/main...${SANDBOX_BRANCH}`,
          { headers: getHeaders() }
        ),
      ]);

      if (!sandboxRes.ok) {
        return res.json({
          success: true,
          groups: [],
          aheadCount: 0,
          error: `GitHub API returned ${sandboxRes.status}`,
        });
      }

      const sandboxCommits: GitHubCommit[] = await sandboxRes.json();

      // Build set of commit SHAs that are ahead of main
      const aheadShas = new Set<string>();
      if (compareRes.ok) {
        const compareData = await compareRes.json();
        if (Array.isArray(compareData.commits)) {
          for (const c of compareData.commits) {
            aheadShas.add(c.sha);
          }
        }
      }

      // Transform commits into changelog entries
      const entries: ChangelogEntry[] = sandboxCommits.map((c) => {
        const firstLine = c.commit.message.split("\n")[0];
        return {
          hash: c.sha.substring(0, 8),
          message: firstLine,
          author: c.commit.author.name,
          date: c.commit.author.date,
          filesChanged: c.files?.length ?? 0,
          aheadOfMain: aheadShas.has(c.sha),
        };
      });

      // Group by date (YYYY-MM-DD)
      const groupMap = new Map<string, ChangelogEntry[]>();
      for (const entry of entries) {
        const dateKey = entry.date.substring(0, 10);
        if (!groupMap.has(dateKey)) {
          groupMap.set(dateKey, []);
        }
        groupMap.get(dateKey)!.push(entry);
      }

      const groups: ChangelogGroup[] = Array.from(groupMap.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, commits]) => ({ date, commits }));

      return res.json({
        success: true,
        groups,
        aheadCount: aheadShas.size,
        totalCommits: entries.length,
      });
    } catch (err: any) {
      console.error("[changelog] GitHub API error:", err.message);
      return res.json({
        success: true,
        groups: [],
        aheadCount: 0,
        error: "Could not reach GitHub API. Changelog unavailable.",
      });
    }
  }
);

export default changelogRoutes;
