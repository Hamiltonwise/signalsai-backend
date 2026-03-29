/**
 * Podcast Scout Agent -- Execution Service
 *
 * Runs weekly Monday 5am PT.
 * Uses webFetch to search for podcasts in business/healthcare/
 * entrepreneurship niches. Generates pitch drafts via Claude
 * (or template fallback). Writes "content.podcast_opportunity"
 * event and creates dream_team_task for Corey with pitch draft.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../database/connection";
import { fetchRSS, fetchPage, extractText } from "../webFetch";

// -- Types ------------------------------------------------------------------

interface PodcastOpportunity {
  podcastName: string;
  host: string;
  category: string;
  recentEpisodeTitle: string;
  recentEpisodeUrl: string;
  topicGap: string;
  pitchDraft: string;
  estimatedAudienceSize: string;
  fitScore: number;
  conversionEstimate: string;
}

interface PodcastScoutResult {
  scannedAt: string;
  sourcesChecked: number;
  opportunitiesFound: number;
  opportunities: PodcastOpportunity[];
  mode: "ai" | "template";
}

// -- Podcast RSS Sources to Monitor -----------------------------------------

const PODCAST_SOURCES: Array<{
  name: string;
  host: string;
  url: string;
  category: string;
  estimatedAudience: string;
}> = [
  {
    name: "My First Million",
    host: "Sam Parr & Shaan Puri",
    url: "https://feeds.megaphone.fm/HSW2823591368",
    category: "Entrepreneurship / Small Business",
    estimatedAudience: "500k+",
  },
  {
    name: "The Game w/ Alex Hormozi",
    host: "Alex Hormozi",
    url: "https://feeds.megaphone.fm/TPG2643498588",
    category: "Entrepreneurship / Small Business",
    estimatedAudience: "1M+",
  },
  {
    name: "Dental A-Team",
    host: "Kiera Dent",
    url: "https://feeds.buzzsprout.com/454110.rss",
    category: "Healthcare / Dental Specialty",
    estimatedAudience: "20k+",
  },
  {
    name: "The Dentalpreneur Podcast",
    host: "Dr. Mark Costes",
    url: "https://feeds.buzzsprout.com/49679.rss",
    category: "Healthcare / Dental Specialty",
    estimatedAudience: "15k+",
  },
  {
    name: "Bunker Labs",
    host: "Bunker Labs Team",
    url: "https://feeds.simplecast.com/DhWkFo_f",
    category: "Veteran Entrepreneurship",
    estimatedAudience: "10k+",
  },
];

// -- Template Pitches -------------------------------------------------------

function generateTemplatePitch(
  source: typeof PODCAST_SOURCES[number],
  recentEpisode: string
): PodcastOpportunity {
  return {
    podcastName: source.name,
    host: source.host,
    category: source.category,
    recentEpisodeTitle: recentEpisode,
    recentEpisodeUrl: "",
    topicGap: "How business clarity is giving specialists insights they cannot get from their accountant or marketing agency",
    pitchDraft: `${source.host.split("&")[0].split(",")[0].trim()},

I just listened to "${recentEpisode}" and [specific observation about what made it valuable].

There is a story your audience has not heard yet: what happens when you give a specialist a real-time picture of their competitive landscape, and they discover their biggest referral source switched to a competitor three months ago without them knowing.

I am Corey Wise, USAF veteran, founder of Alloro, an AI platform that tells business owners what their business has been trying to tell them. Speaking at AAE in April.

The angle: most practice owners are making six-figure decisions with zero competitive data. I built the tool that changes that, and the stories from early users are striking.

Would love to be a guest. Happy to work around your schedule.

Corey`,
    estimatedAudienceSize: source.estimatedAudience,
    fitScore: 7,
    conversionEstimate: "Estimated 5-15 Checkup submissions within 30 days of air date",
  };
}

// -- Core -------------------------------------------------------------------

/**
 * Run the Podcast Scout. Scan podcast feeds, identify opportunities,
 * generate pitch drafts.
 */
export async function runPodcastScout(): Promise<PodcastScoutResult> {
  const opportunities: PodcastOpportunity[] = [];
  let sourcesChecked = 0;

  // Check which podcasts have already been pitched
  const pitchedPodcasts = await getPitchedPodcasts();

  for (const source of PODCAST_SOURCES) {
    sourcesChecked++;

    // Skip if already pitched
    if (pitchedPodcasts.includes(source.name.toLowerCase())) {
      continue;
    }

    try {
      const feedResult = await fetchRSS(source.url);
      const recentEpisode =
        feedResult.success && feedResult.items && feedResult.items.length > 0
          ? feedResult.items[0].title
          : "their most recent episode";

      const recentEpisodeUrl =
        feedResult.success && feedResult.items && feedResult.items.length > 0
          ? feedResult.items[0].link
          : "";

      const opportunity = await generatePitch(
        source,
        recentEpisode,
        recentEpisodeUrl
      );
      opportunities.push(opportunity);
    } catch (err: any) {
      console.warn(
        `[PodcastScout] Error processing ${source.name}:`,
        err.message
      );
      // Still add a template opportunity
      opportunities.push(generateTemplatePitch(source, "their most recent episode"));
    }
  }

  // Sort by fit score, take top 5
  const topOpportunities = opportunities
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 5);

  // Write events and create tasks
  for (const opp of topOpportunities) {
    await writeOpportunityEvent(opp);
    await createPitchTask(opp);
  }

  const result: PodcastScoutResult = {
    scannedAt: new Date().toISOString(),
    sourcesChecked,
    opportunitiesFound: topOpportunities.length,
    opportunities: topOpportunities,
    mode: topOpportunities.some((o) => o.pitchDraft.includes("[specific observation"))
      ? "template"
      : "ai",
  };

  await writeSummaryEvent(result);

  console.log(
    `[PodcastScout] Scan complete: ${topOpportunities.length} opportunities from ${sourcesChecked} sources`
  );

  return result;
}

// -- Pitch Generation -------------------------------------------------------

async function generatePitch(
  source: typeof PODCAST_SOURCES[number],
  recentEpisode: string,
  recentEpisodeUrl: string
): Promise<PodcastOpportunity> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return generateTemplatePitch(source, recentEpisode);
  }

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are the Podcast Scout for Corey Wise, founder of Alloro. Generate a podcast pitch. Return ONLY valid JSON.

Podcast: ${source.name}
Host: ${source.host}
Category: ${source.category}
Recent Episode: "${recentEpisode}"
Estimated Audience: ${source.estimatedAudience}

About Corey: USAF veteran, SDVOSB founder, built Alloro (AI-powered business clarity for licensed specialists), speaking at AAE in April. Built a free Referral Base Checkup that shows specialists their competitive landscape in 2 minutes.

Pitch Rules:
1. Open with a specific reference to the recent episode (proves we listened)
2. Name the gap: what their audience has not heard yet
3. Position Corey's specific story for that gap
4. One-line credibility anchor
5. Clear, low-friction ask
6. No em-dashes. No generic flattery. No "I love your show."
7. Under 150 words

Return JSON:
{
  "topicGap": "string - what this audience has not heard yet",
  "pitchDraft": "string - the complete pitch email",
  "fitScore": number (1-10, how well Corey's story fits this audience),
  "conversionEstimate": "string - estimated Checkup submissions within 30 days"
}`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const parsed = JSON.parse(text);

    return {
      podcastName: source.name,
      host: source.host,
      category: source.category,
      recentEpisodeTitle: recentEpisode,
      recentEpisodeUrl,
      topicGap: parsed.topicGap || "",
      pitchDraft: parsed.pitchDraft || "",
      estimatedAudienceSize: source.estimatedAudience,
      fitScore: parsed.fitScore || 5,
      conversionEstimate: parsed.conversionEstimate || "Unknown",
    };
  } catch (err: any) {
    console.error(
      `[PodcastScout] Claude API failed for ${source.name}:`,
      err.message
    );
    return generateTemplatePitch(source, recentEpisode);
  }
}

// -- Data Queries -----------------------------------------------------------

async function getPitchedPodcasts(): Promise<string[]> {
  try {
    const events = await db("behavioral_events")
      .where("event_type", "content.podcast_opportunity")
      .where("created_at", ">=", db.raw("NOW() - INTERVAL '90 days'"))
      .orderBy("created_at", "desc")
      .limit(50);

    return events.map((e: any) => {
      const props =
        typeof e.properties === "string"
          ? JSON.parse(e.properties)
          : e.properties;
      return (props?.podcast_name || "").toLowerCase();
    });
  } catch {
    return [];
  }
}

// -- Writers ----------------------------------------------------------------

async function writeOpportunityEvent(opp: PodcastOpportunity): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "content.podcast_opportunity",
      properties: JSON.stringify({
        podcast_name: opp.podcastName,
        host: opp.host,
        category: opp.category,
        recent_episode: opp.recentEpisodeTitle,
        topic_gap: opp.topicGap,
        fit_score: opp.fitScore,
        estimated_audience: opp.estimatedAudienceSize,
        conversion_estimate: opp.conversionEstimate,
      }),
    });
  } catch (err: any) {
    console.error(
      "[PodcastScout] Failed to write opportunity event:",
      err.message
    );
  }
}

async function createPitchTask(opp: PodcastOpportunity): Promise<void> {
  try {
    await db("dream_team_tasks").insert({
      agent_name: "podcast_scout",
      task_type: "podcast_pitch_review",
      title: `Review pitch: ${opp.podcastName}`,
      description: opp.pitchDraft,
      priority: opp.fitScore >= 8 ? "high" : "medium",
      status: "pending",
      metadata: JSON.stringify({
        podcast_name: opp.podcastName,
        host: opp.host,
        category: opp.category,
        fit_score: opp.fitScore,
        conversion_estimate: opp.conversionEstimate,
      }),
      created_at: new Date(),
      updated_at: new Date(),
    });
  } catch (err: any) {
    // dream_team_tasks table may not exist yet, log and continue
    console.warn(
      "[PodcastScout] Could not create pitch task (table may not exist):",
      err.message
    );
  }
}

async function writeSummaryEvent(result: PodcastScoutResult): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "content.podcast_scout_summary",
      properties: JSON.stringify({
        scanned_at: result.scannedAt,
        sources_checked: result.sourcesChecked,
        opportunities_found: result.opportunitiesFound,
        mode: result.mode,
        podcasts: result.opportunities.map((o) => ({
          name: o.podcastName,
          fit_score: o.fitScore,
          category: o.category,
        })),
      }),
    });
  } catch (err: any) {
    console.error(
      "[PodcastScout] Failed to write summary event:",
      err.message
    );
  }
}
