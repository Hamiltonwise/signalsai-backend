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

import { db } from "../../database/connection";

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
