/**
 * Video Status Processor -- BullMQ job handler
 *
 * Runs every 5 minutes. Polls HeyGen for pending/processing videos
 * in published_content and updates their status and URL on completion.
 * Writes "content.video_completed" behavioral event when a video finishes.
 */

import type { Job } from "bullmq";
import { db } from "../../database/connection";
import { getVideoStatus, isHeyGenConfigured } from "../../services/heygenService";

export async function processVideoStatus(job: Job): Promise<void> {
  console.log(`[VideoStatus] Processing job ${job.id}...`);

  if (!isHeyGenConfigured()) {
    console.log("[VideoStatus] HeyGen not configured, skipping.");
    return;
  }

  let updatedCount = 0;
  let completedCount = 0;

  try {
    // Find all published_content with pending or processing video status
    const pendingVideos = await db("published_content")
      .whereIn("video_status", ["pending", "processing"])
      .whereNotNull("video_id")
      .select("id", "video_id", "title", "slug", "video_status");

    if (pendingVideos.length === 0) {
      console.log("[VideoStatus] No pending videos to check.");
      return;
    }

    console.log(
      `[VideoStatus] Checking ${pendingVideos.length} pending video(s)...`
    );

    for (const record of pendingVideos) {
      try {
        const result = await getVideoStatus(record.video_id);

        // Only update if status changed
        if (result.status !== record.video_status) {
          const updateData: Record<string, string | undefined> = {
            video_status: result.status,
          };

          if (result.videoUrl) {
            updateData.video_url = result.videoUrl;
          }

          await db("published_content")
            .where("id", record.id)
            .update(updateData);

          updatedCount++;

          // Write completion event
          if (result.status === "completed") {
            completedCount++;
            await db("behavioral_events").insert({
              event_type: "content.video_completed",
              properties: JSON.stringify({
                content_id: record.id,
                slug: record.slug,
                title: record.title,
                video_id: record.video_id,
                video_url: result.videoUrl || null,
                estimated_duration: result.estimatedDuration || null,
              }),
            });

            console.log(
              `[VideoStatus] Video completed for "${record.title}" (${record.video_id})`
            );
          }

          if (result.status === "failed") {
            console.warn(
              `[VideoStatus] Video failed for "${record.title}": ${result.error || "unknown error"}`
            );
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[VideoStatus] Error checking video ${record.video_id}:`,
          message
        );
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[VideoStatus] Failed to query pending videos:", message);
  }

  console.log(
    `[VideoStatus] Done: ${updatedCount} updated, ${completedCount} completed.`
  );
}
