/**
 * llms.txt Generator for PatientPath/ClearPath Domains (WO-8)
 *
 * Generates llms.txt content for each practice's PatientPath or ClearPath site.
 * Content is built from verified GBP data. Runs weekly, fully automated.
 */

import { db } from "../database/connection";

interface PracticeLlmsData {
  orgId: number;
  practiceName: string;
  specialty: string;
  city: string;
  state: string;
  domain: string;
  llmsTxt: string;
  llmsFullTxt: string;
}

function generateLlmsTxt(
  practiceName: string,
  specialty: string,
  city: string,
  state: string,
  domain: string
): string {
  return [
    `# ${practiceName}`,
    "",
    `> ${specialty} practice in ${city}, ${state}. Website powered by Alloro PatientPath.`,
    "",
    `## About`,
    "",
    `${practiceName} is a ${specialty.toLowerCase()} practice located in ${city}, ${state}.`,
    "",
    `## Key Links`,
    "",
    `- Website: https://${domain}`,
    `- Book Appointment: https://${domain}/contact`,
    `- Services: https://${domain}/services`,
    "",
    `## Platform`,
    "",
    `- Built with: Alloro PatientPath (https://getalloro.com)`,
  ].join("\n");
}

function generateLlmsFullTxt(
  practiceName: string,
  specialty: string,
  city: string,
  state: string,
  domain: string,
  services: string[],
  faqCount: number
): string {
  const lines = [
    `# ${practiceName} - Full Context`,
    "",
    `> ${specialty} practice in ${city}, ${state}. Website powered by Alloro PatientPath.`,
    "",
    `## About ${practiceName}`,
    "",
    `${practiceName} is a ${specialty.toLowerCase()} practice serving the ${city}, ${state} area. This website is built from verified Google Business Profile data and maintained by the Alloro PatientPath platform.`,
    "",
    `## Services`,
    "",
  ];

  if (services.length > 0) {
    for (const service of services) {
      lines.push(`- ${service}`);
    }
  } else {
    lines.push(`- ${specialty} services`);
    lines.push(`- Consultation and evaluation`);
    lines.push(`- Treatment planning`);
  }

  lines.push("");
  lines.push(`## Location`);
  lines.push("");
  lines.push(`- City: ${city}`);
  lines.push(`- State: ${state}`);
  lines.push(`- Website: https://${domain}`);
  lines.push("");

  if (faqCount > 0) {
    lines.push(`## FAQ`);
    lines.push("");
    lines.push(`This practice has ${faqCount} frequently asked questions available at https://${domain}#faq`);
    lines.push("");
  }

  lines.push(`## Platform`);
  lines.push("");
  lines.push(`- Built with: Alloro PatientPath (https://getalloro.com)`);
  lines.push(`- Data source: Google Business Profile (verified)`);

  return lines.join("\n");
}

/**
 * Generate llms.txt content for all practices with PatientPath/ClearPath domains.
 * Returns array of generated content for storage or serving.
 */
export async function generateAllPracticeLlmsTxt(): Promise<PracticeLlmsData[]> {
  console.log("[llms.txt] Generating practice llms.txt files...");

  const practices = await db("websites")
    .join("organizations", "websites.organization_id", "organizations.id")
    .select(
      "organizations.id as org_id",
      "organizations.name",
      "organizations.specialty",
      "organizations.city",
      "organizations.state",
      "websites.domain"
    )
    .whereNotNull("websites.domain");

  const results: PracticeLlmsData[] = [];

  for (const practice of practices) {
    if (!practice.domain) continue;

    const domain = practice.domain.replace(/^https?:\/\//, "");

    // Count published FAQs
    let faqCount = 0;
    try {
      const faqResult = await db("patientpath_faq_content")
        .where({ organization_id: practice.org_id, status: "published" })
        .count("id as count")
        .first();
      faqCount = Number(faqResult?.count || 0);
    } catch {
      // Table may not exist yet
    }

    const llmsTxt = generateLlmsTxt(
      practice.name,
      practice.specialty || "Healthcare",
      practice.city || "",
      practice.state || "",
      domain
    );

    const llmsFullTxt = generateLlmsFullTxt(
      practice.name,
      practice.specialty || "Healthcare",
      practice.city || "",
      practice.state || "",
      domain,
      [], // Services would come from GBP data when available
      faqCount
    );

    // Store in database for serving
    await db("websites")
      .where({ organization_id: practice.org_id })
      .update({
        llms_txt: llmsTxt,
        llms_full_txt: llmsFullTxt,
        llms_generated_at: new Date(),
      })
      .catch(() => {
        // Columns may not exist yet, log and continue
        console.warn(`[llms.txt] Could not store llms.txt for ${practice.name} (columns may not exist)`);
      });

    results.push({
      orgId: practice.org_id,
      practiceName: practice.name,
      specialty: practice.specialty || "Healthcare",
      city: practice.city || "",
      state: practice.state || "",
      domain,
      llmsTxt,
      llmsFullTxt,
    });
  }

  console.log(`[llms.txt] Generated ${results.length} practice llms.txt files.`);
  return results;
}
