/**
 * Ghost Writer Agent -- Execution Service
 *
 * Runs daily at 8 AM PT. Queries dream_team_tasks sourced from
 * Fireflies transcripts, extracts book-worthy content using Claude,
 * tags passages by book and chapter, and creates dream_team_tasks
 * with extracted material.
 *
 * Writes "content.ghost_writer_extract" event with tagged passages.
 */

import { db } from "../../database/connection";
import Anthropic from "@anthropic-ai/sdk";

// -- Types ------------------------------------------------------------------

interface TaggedPassage {
  bookNumber: 1 | 2 | 3;
  bookTitle: string;
  candidateChapter: string;
  emotionalWeight: 1 | 2 | 3 | 4 | 5;
  summary: string;
  rawText: string;
  contradictsPrevious: boolean;
}

interface GhostWriterExtract {
  transcriptsProcessed: number;
  passagesTagged: number;
  passages: TaggedPassage[];
  extractedAt: string;
}

// -- Constants --------------------------------------------------------------

const LLM_MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

const BOOK_TITLES: Record<number, string> = {
  1: "What Your Business Has Been Trying to Tell You",
  2: "The Permission Structure",
  3: "Heroes & Founders",
};

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

// -- Core -------------------------------------------------------------------

/**
 * Run the daily Ghost Writer scan.
 * Finds recent Fireflies transcripts and extracts book-worthy content.
 */
export async function runGhostWriterDaily(): Promise<GhostWriterExtract> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find recent Fireflies-sourced tasks that have transcript content
  const recentTranscripts = await db("dream_team_tasks")
    .where("source_type", "fireflies")
    .where("created_at", ">=", oneDayAgo)
    .whereNotNull("source_meeting_title")
    .select("id", "title", "description", "source_meeting_title", "source_meeting_id")
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[GhostWriter] Failed to query transcripts:", message);
      return [];
    });

  if (recentTranscripts.length === 0) {
    console.log("[GhostWriter] No new transcripts found in last 24h.");
    const emptyResult: GhostWriterExtract = {
      transcriptsProcessed: 0,
      passagesTagged: 0,
      passages: [],
      extractedAt: new Date().toISOString(),
    };
    await writeExtractEvent(emptyResult);
    return emptyResult;
  }

  // Also check behavioral_events for any stored transcript content
  const transcriptEvents = await db("behavioral_events")
    .where("event_type", "like", "fireflies.%")
    .where("created_at", ">=", oneDayAgo)
    .select("properties")
    .catch(() => []);

  // Aggregate text from tasks and events
  const contentBlocks: string[] = [];

  for (const task of recentTranscripts) {
    const block = [
      `Meeting: ${task.source_meeting_title}`,
      task.title,
      task.description || "",
    ].join("\n");
    contentBlocks.push(block);
  }

  for (const evt of transcriptEvents) {
    try {
      const props = typeof evt.properties === "string"
        ? JSON.parse(evt.properties)
        : evt.properties;
      if (props?.transcript) {
        contentBlocks.push(props.transcript);
      }
    } catch {
      // skip malformed
    }
  }

  const combinedText = contentBlocks.join("\n\n---\n\n");

  // Extract passages via Claude
  const passages = await extractPassages(combinedText);

  // Create a dream_team_task with the extracted material
  if (passages.length > 0) {
    await createGhostWriterTask(passages);
  }

  const result: GhostWriterExtract = {
    transcriptsProcessed: recentTranscripts.length,
    passagesTagged: passages.length,
    passages,
    extractedAt: new Date().toISOString(),
  };

  await writeExtractEvent(result);

  console.log(
    `[GhostWriter] Processed ${recentTranscripts.length} transcripts, tagged ${passages.length} passages.`
  );

  return result;
}

// -- Extraction -------------------------------------------------------------

async function extractPassages(text: string): Promise<TaggedPassage[]> {
  if (!text.trim()) return [];

  try {
    const client = getAnthropic();

    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 4000,
      system: `You are the Ghost Writer agent for Alloro. You scan meeting transcripts and content for passages worthy of three books:

Book 1: "What Your Business Has Been Trying to Tell You" -- business framework book about reading signals from your practice
Book 2: "The Permission Structure" -- memoir-adjacent book about why business owners feel guilty wanting freedom
Book 3: "Heroes & Founders" -- movement manifesto about veterans who built businesses

Tag each worthy passage with:
- bookNumber (1, 2, or 3)
- candidateChapter (your best guess at which chapter theme)
- emotionalWeight (1-5): 5 = room went quiet, 4 = clear framework/principle, 3 = supporting evidence, 1-2 = background context
- summary (one sentence)
- rawText (the exact passage)
- contradictsPrevious (true if this contradicts an earlier tagged passage, which may indicate evolution in thinking)

Return a JSON array. Only tag passages with emotional weight 3+. If nothing qualifies, return [].
No em-dashes. Complete sentences only.`,
      messages: [
        {
          role: "user",
          content: `Scan this content for book-worthy passages:\n\n${text.slice(0, 50000)}`,
        },
      ],
    });

    const responseText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed)
      ? parsed.map((p: any) => ({
          bookNumber: p.bookNumber || 1,
          bookTitle: BOOK_TITLES[p.bookNumber] || BOOK_TITLES[1],
          candidateChapter: p.candidateChapter || "Unassigned",
          emotionalWeight: p.emotionalWeight || 3,
          summary: p.summary || "",
          rawText: p.rawText || "",
          contradictsPrevious: p.contradictsPrevious || false,
        }))
      : [];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GhostWriter] Claude extraction failed:", message);
    return [];
  }
}

// -- Task Creation ----------------------------------------------------------

async function createGhostWriterTask(passages: TaggedPassage[]): Promise<void> {
  const bookCounts = passages.reduce(
    (acc, p) => {
      acc[p.bookNumber] = (acc[p.bookNumber] || 0) + 1;
      return acc;
    },
    {} as Record<number, number>
  );

  const bookSummary = Object.entries(bookCounts)
    .map(([num, count]) => `Book ${num}: ${count} passages`)
    .join(", ");

  const highWeight = passages.filter((p) => p.emotionalWeight >= 4);

  try {
    await db("dream_team_tasks").insert({
      owner_name: "Corey",
      title: `Ghost Writer: ${passages.length} passages tagged (${bookSummary})`,
      description: [
        `${passages.length} passages extracted from today's transcripts.`,
        highWeight.length > 0
          ? `${highWeight.length} high-weight passages (emotional weight 4-5) flagged for priority review.`
          : "No high-weight passages today.",
        "",
        "Top passages:",
        ...highWeight.slice(0, 3).map(
          (p) =>
            `  - Book ${p.bookNumber} (weight ${p.emotionalWeight}): ${p.summary}`
        ),
      ].join("\n"),
      status: "open",
      priority: highWeight.length > 0 ? "high" : "normal",
      source_type: "ghost_writer",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GhostWriter] Failed to create task:", message);
  }
}

// -- Event Writing ----------------------------------------------------------

async function writeExtractEvent(extract: GhostWriterExtract): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "content.ghost_writer_extract",
      properties: JSON.stringify({
        transcripts_processed: extract.transcriptsProcessed,
        passages_tagged: extract.passagesTagged,
        passages: extract.passages.map((p) => ({
          book_number: p.bookNumber,
          book_title: p.bookTitle,
          candidate_chapter: p.candidateChapter,
          emotional_weight: p.emotionalWeight,
          summary: p.summary,
          contradicts_previous: p.contradictsPrevious,
        })),
        extracted_at: extract.extractedAt,
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GhostWriter] Failed to write extract event:", message);
  }
}
