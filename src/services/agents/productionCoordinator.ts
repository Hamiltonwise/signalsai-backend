/**
 * Production Coordinator Agent -- Execution Service
 *
 * On-demand function triggered after content creation.
 * Accepts contentType, rawContent, and targetPlatforms.
 * Generates a production checklist covering transcription,
 * clip extraction, thumbnail needs, and publishing schedule.
 *
 * Writes "content.production_queue" event.
 * Returns { checklist, estimatedCompletionTime, platforms[] }.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../database/connection";
import {
  createVideo,
  isHeyGenConfigured,
  type HeyGenVideoResult,
} from "../heygenService";

// -- Types ------------------------------------------------------------------

interface ProductionChecklistItem {
  step: number;
  name: string;
  status: "pending" | "in_progress" | "complete" | "blocked";
  description: string;
  estimatedMinutes: number;
  assignedTo: string;
}

interface ProductionQueueResult {
  checklist: ProductionChecklistItem[];
  estimatedCompletionTime: string;
  platforms: PlatformSchedule[];
  contentType: string;
  createdAt: string;
}

interface PlatformSchedule {
  platform: string;
  contentFormat: string;
  publishDay: string;
  publishTime: string;
  status: "queued" | "ready" | "published";
}

// -- Constants --------------------------------------------------------------

const DEFAULT_PUBLISH_SCHEDULE: Record<string, { day: string; time: string; format: string }> = {
  blog: { day: "Monday", time: "8:00 AM PT", format: "AEO-format post" },
  linkedin: { day: "Tuesday", time: "8:00 AM PT", format: "Long-form post" },
  youtube: { day: "Wednesday", time: "10:00 AM PT", format: "Full video" },
  instagram: { day: "Thursday", time: "12:00 PM PT", format: "Short-form clip" },
  tiktok: { day: "Friday", time: "12:00 PM PT", format: "Short-form clip" },
};

// -- Core -------------------------------------------------------------------

/**
 * Generate a production checklist for a piece of content.
 */
export async function generateProductionChecklist(
  contentType: string,
  rawContent: string,
  targetPlatforms: string[]
): Promise<ProductionQueueResult> {
  const checklist: ProductionChecklistItem[] = [];
  let stepNum = 0;

  // Step 1: Transcription (if audio/video)
  const needsTranscription = ["video", "audio", "recording", "podcast"].includes(
    contentType.toLowerCase()
  );
  if (needsTranscription) {
    stepNum++;
    checklist.push({
      step: stepNum,
      name: "Transcription",
      status: "pending",
      description:
        "Submit to Fireflies for full transcript with speaker identification and timestamps.",
      estimatedMinutes: 30,
      assignedTo: "automated",
    });
  }

  // Step 2: HeyGen Rendering (if video)
  const needsRendering = ["video", "recording"].includes(contentType.toLowerCase());
  if (needsRendering) {
    stepNum++;
    checklist.push({
      step: stepNum,
      name: "HeyGen Rendering",
      status: "pending",
      description:
        "Digital twin rendering with Navy #212D40 backgrounds and Terracotta #D56753 accents. Auto-generated styled captions.",
      estimatedMinutes: 60,
      assignedTo: "automated",
    });
  }

  // Step 3: Clip Extraction (if video and short-form platforms targeted)
  const shortFormPlatforms = targetPlatforms.filter((p) =>
    ["instagram", "tiktok", "shorts"].includes(p.toLowerCase())
  );
  if (needsRendering && shortFormPlatforms.length > 0) {
    stepNum++;
    checklist.push({
      step: stepNum,
      name: "Clip Extraction",
      status: "pending",
      description:
        "Extract top 3 clips via OpusClip. Minimum virality score: 85+. Each clip needs a hook in the first 3 seconds.",
      estimatedMinutes: 20,
      assignedTo: "automated",
    });
  }

  // Step 4: Ghost Writer Brief
  stepNum++;
  checklist.push({
    step: stepNum,
    name: "Ghost Writer Brief",
    status: "pending",
    description:
      "Extract key quotes, core themes, LinkedIn caption draft, YouTube description, and 3 social media posts.",
    estimatedMinutes: 15,
    assignedTo: "ghost_writer",
  });

  // Step 5: Copy Package
  stepNum++;
  checklist.push({
    step: stepNum,
    name: "Copy Package",
    status: "pending",
    description:
      "Full written content package: LinkedIn post, YouTube description with timestamps, blog post in AEO format, Instagram caption, email snippet.",
    estimatedMinutes: 30,
    assignedTo: "cmo_agent",
  });

  // Step 6: Quality Gates
  stepNum++;
  checklist.push({
    step: stepNum,
    name: "Quality Gates",
    status: "pending",
    description:
      "Hook check, voice check, CTA check, brand check (Navy + Terracotta palette). All assets must pass before staging.",
    estimatedMinutes: 10,
    assignedTo: "system_conductor",
  });

  // Step 7: Stage for Review
  stepNum++;
  checklist.push({
    step: stepNum,
    name: "Stage for Monday Review",
    status: "pending",
    description:
      "All assets organized in Notion. Each marked draft/ready. Publish schedule attached.",
    estimatedMinutes: 5,
    assignedTo: "automated",
  });

  // Build platform schedules
  const platforms: PlatformSchedule[] = targetPlatforms.map((platform) => {
    const schedule = DEFAULT_PUBLISH_SCHEDULE[platform.toLowerCase()];
    return {
      platform,
      contentFormat: schedule?.format || "Custom format",
      publishDay: schedule?.day || "TBD",
      publishTime: schedule?.time || "TBD",
      status: "queued" as const,
    };
  });

  // Calculate estimated completion time
  const totalMinutes = checklist.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const completionDate = new Date(Date.now() + totalMinutes * 60 * 1000);
  const estimatedCompletionTime = completionDate.toISOString();

  const result: ProductionQueueResult = {
    checklist,
    estimatedCompletionTime,
    platforms,
    contentType,
    createdAt: new Date().toISOString(),
  };

  // Write the production queue event
  await writeProductionQueueEvent(result);

  console.log(
    `[ProductionCoordinator] Checklist generated: ${checklist.length} steps, ${platforms.length} platforms, ~${totalMinutes} min total.`
  );

  return result;
}

// -- Video Generation -------------------------------------------------------

interface PublishedContentRecord {
  id: number;
  title: string;
  body: string;
  slug: string;
}

/**
 * Generate a HeyGen video from a published_content record.
 * 1. Condenses the body into a 60-90 second video script via Claude
 * 2. Calls HeyGen to generate the video
 * 3. Stores video_id and status on the content record
 * 4. Writes "content.video_queued" behavioral event
 */
export async function generateVideoFromContent(
  content: PublishedContentRecord
): Promise<HeyGenVideoResult> {
  if (!isHeyGenConfigured()) {
    console.log("[ProductionCoordinator] HeyGen not configured, skipping video generation.");
    return {
      success: false,
      status: "failed",
      error: "HeyGen is not configured. Set HEYGEN_API_KEY to enable video generation.",
    };
  }

  // Step 1: Condense the article body into a 60-90 second video script
  let script: string;
  try {
    script = await condenseToVideoScript(content.title, content.body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ProductionCoordinator] Script generation failed:", message);
    return {
      success: false,
      status: "failed",
      error: `Failed to generate video script: ${message}`,
    };
  }

  // Step 2: Call HeyGen
  const result = await createVideo({
    script,
    title: content.title,
  });

  if (!result.success || !result.videoId) {
    console.error(
      `[ProductionCoordinator] HeyGen video creation failed for "${content.title}": ${result.error}`
    );
    return result;
  }

  // Step 3: Store video_id and status on the content record
  try {
    await db("published_content").where("id", content.id).update({
      video_id: result.videoId,
      video_status: result.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ProductionCoordinator] Failed to update content record:", message);
  }

  // Step 4: Write behavioral event
  try {
    await db("behavioral_events").insert({
      event_type: "content.video_queued",
      properties: JSON.stringify({
        content_id: content.id,
        slug: content.slug,
        title: content.title,
        video_id: result.videoId,
        script_length: script.length,
        estimated_duration: result.estimatedDuration,
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ProductionCoordinator] Failed to write video_queued event:", message);
  }

  console.log(
    `[ProductionCoordinator] Video queued for "${content.title}" (video_id: ${result.videoId})`
  );

  return result;
}

/**
 * Use Claude to condense an article body into a 60-90 second video script.
 * Under 3000 characters (HeyGen limit).
 */
async function condenseToVideoScript(
  title: string,
  body: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: take the first ~2500 chars of the body as a rough script
    console.warn(
      "[ProductionCoordinator] No ANTHROPIC_API_KEY, using truncated body as script."
    );
    const truncated = body.replace(/[#*_\[\]()]/g, "").slice(0, 2500);
    return truncated;
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are a video scriptwriter for Alloro, a business clarity platform for licensed specialists.

Convert this blog article into a 60-90 second spoken video script. Return ONLY the script text, nothing else.

Title: ${title}

Article:
${body.slice(0, 8000)}

Rules:
- Write for spoken delivery, not reading. Short sentences. Natural rhythm.
- Open with a hook that names the pain point in the first 10 seconds.
- One core insight from the article, explained simply.
- End with a clear call to action: "Run your free Business Clarity Checkup at alloro.io"
- No em-dashes. Use commas, periods, or semicolons.
- No jargon: no "leverage," "optimize," "empower," "solution," "platform," "dashboard."
- Maximum 2800 characters (this is a hard limit for the video rendering engine).
- Do not include stage directions, timestamps, or speaker labels.`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Enforce the 3000 char limit
  return text.slice(0, 3000);
}

// -- Event Writing ----------------------------------------------------------

async function writeProductionQueueEvent(
  result: ProductionQueueResult
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "content.production_queue",
      properties: JSON.stringify({
        content_type: result.contentType,
        checklist_steps: result.checklist.length,
        platforms: result.platforms.map((p) => p.platform),
        estimated_completion: result.estimatedCompletionTime,
        checklist: result.checklist,
        platform_schedule: result.platforms,
        created_at: result.createdAt,
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "[ProductionCoordinator] Failed to write production queue event:",
      message
    );
  }
}
