/**
 * Referral Source Sync -- The Pipe Between PMS Data and Intelligence
 *
 * PMS uploads contain rich referral data (source names, counts, production).
 * This service populates the referral_sources table that the Monday email,
 * GP discovery, drift detection, and dashboard all read from.
 *
 * Called after PMS upload (processFileUpload) and on PMS job approval.
 * Also called by the migration that backfills from existing PMS data.
 */

import { db } from "../database/connection";
import { getLocationScope } from "./locationScope/locationScope";

/**
 * Find a column value by trying multiple header name variations.
 * Doctors export from Edge, Dentrix, Eaglesoft, OpenDental -- all different headers.
 * Returns the first non-empty match or empty string.
 */
function findColumn(row: Record<string, string>, candidates: string[]): string {
  // Exact match first
  for (const key of candidates) {
    const val = row[key];
    if (val && String(val).trim()) return String(val).trim();
  }
  // Normalized match: strip spaces, underscores, hyphens, case
  const rowKeys = Object.keys(row);
  for (const candidate of candidates) {
    const norm = candidate.toLowerCase().replace(/[\s_-]/g, "");
    for (const rowKey of rowKeys) {
      const rowNorm = rowKey.toLowerCase().replace(/[\s_-]/g, "");
      if (rowNorm === norm) {
        const val = row[rowKey];
        if (val && String(val).trim()) return String(val).trim();
      }
    }
  }
  // Fuzzy: row key contains candidate or vice versa
  for (const candidate of candidates) {
    const stem = candidate.toLowerCase().replace(/[\s_-]/g, "");
    for (const rowKey of rowKeys) {
      const normalizedKey = rowKey.toLowerCase().replace(/[\s_-]/g, "");
      if (normalizedKey.includes(stem) || stem.includes(normalizedKey)) {
        const val = row[rowKey];
        if (val && String(val).trim()) return String(val).trim();
      }
    }
  }
  return "";
}

export async function syncReferralSourcesFromPmsJob(
  orgId: number,
  rawData: Record<string, string>[],
  locationScope?: number[],
): Promise<{ synced: number; skipped: number; zeroSourcesDetected?: boolean; headersSeen?: string[] }> {
  const hasTable = await db.schema.hasTable("referral_sources");
  if (!hasTable) return { synced: 0, skipped: 0 };

  if (!Array.isArray(rawData) || rawData.length === 0) return { synced: 0, skipped: 0 };

  // Card G-foundation: validate scope (referral_sources lacks location_id
  // today; the caller's pms_jobs row carries location and is the
  // authoritative scope. Validation here is misuse detection only.)
  if (locationScope !== undefined) await getLocationScope(orgId, locationScope);

  // Aggregate referral sources
  const sources = new Map<string, {
    count: number;
    production: number;
    lastDate: string | null;
    type: string;
    months: Record<string, { count: number; production: number }>;
  }>();

  for (const row of rawData) {
    // Flexible column detection: match against common header variations
    // Covers ALL verticals: dental PMS, home services CRM, accounting, legal, veterinary
    const name = findColumn(row, [
      // Universal
      "Referral Source", "referral_source", "Source", "source",
      "Referred By", "referred_by", "Referrer", "referrer",
      "Lead Source", "lead_source", "Channel", "channel",
      "Provider", "provider",
      // Dental PMS (Dentrix, Eaglesoft, Open Dental, Edge, OrthoTrac, Dolphin)
      "Referring Doctor", "referring_doctor", "Referring Provider", "referring_provider",
      "GP Name", "gp_name", "Doctor", "doctor",
      "Ref Doctor", "Ref Source", "Referring Dentist", "Referring Practice",
      "Referring Doctor/Other", "Referred BY", "Referred To", "Last Name",
      "Referral",
      // Home services (CRM, call tracking, lead management)
      "How Did You Hear About Us", "How Found", "Marketing Source",
      "Ad Source", "Campaign", "campaign", "Ad Campaign",
      "Booking Source", "Booking Channel",
      // CPA / Financial / Legal (client referral tracking)
      "Referral Partner", "Referring Attorney", "Referring CPA",
      "Referring Firm", "Business Source", "Client Source",
      // Veterinary
      "Referring Vet", "Referring Veterinarian", "Referring Clinic",
    ]);

    if (!name) continue;

    const production = parseFloat(
      String(findColumn(row, [
        "Production", "production", "Amount", "amount", "Fee", "fee",
        "Revenue", "revenue", "Value", "value", "Total", "total",
        "Net Production", "net_production", "Gross Production",
        "Case Value", "case_value", "Procedure Amount",
        // Dentrix specific
        "Treatment Plan Total", "Production Total",
        // Eaglesoft specific
        "Cost",
        // OrthoTrac/Dolphin specific
        "Charges", "Contracts", "Payments",
      ]) || "0").replace(/[$,]/g, "")
    ) || 0;

    const refs = parseInt(String(findColumn(row, [
      "Number of Referrals", "referral_count", "Count", "count",
      "Referrals", "referrals", "Qty", "qty", "Patients", "patients",
      "Cases", "cases", "Starts", "starts", "New Patients", "new_patients",
      // Dentrix specific
      "Total Referrals", "Listed Referrals",
      // Open Dental
      "Patient Count",
      // Home services / general
      "Jobs", "jobs", "Leads", "leads", "Bookings", "bookings",
      "Calls", "calls", "Appointments", "appointments",
    ]) || "1")) || 1;

    const dateStr = findColumn(row, [
      "Date", "date", "Appointment Date", "appointment_date",
      "Referral Date", "referral_date", "Visit Date", "visit_date",
      "Service Date", "service_date", "Appt Date", "appt_date",
      // Dentrix/Eaglesoft specific
      "First Visit Date", "Date Became New Patient", "Profile Created Date",
      // Open Dental specific
      "Date Refer", "Date Done",
    ]) || null;
    const month = dateStr ? dateStr.substring(0, 7) : "unknown";

    const nameLower = name.toLowerCase();
    // Classify source type: marketing (digital channels), partner (referral relationships), or self (walk-in/direct)
    const isDigital = nameLower.includes("google") || nameLower.includes("yelp") ||
      nameLower.includes("facebook") || nameLower.includes("instagram") ||
      nameLower.includes("angi") || nameLower.includes("homeadvisor") ||
      nameLower.includes("thumbtack") || nameLower.includes("nextdoor") ||
      nameLower.includes("website") || nameLower.includes("internet") ||
      nameLower.includes("online") || nameLower.includes("ad") ||
      nameLower.includes("seo") || nameLower.includes("ppc");
    const isSelf = nameLower.includes("self") || nameLower.includes("direct") ||
      nameLower.includes("walk-in") || nameLower.includes("walkin");
    const sourceType = isDigital ? "digital" : isSelf ? "self" : "partner";

    if (!sources.has(name)) {
      sources.set(name, { count: 0, production: 0, lastDate: null, type: sourceType, months: {} });
    }
    const src = sources.get(name)!;
    src.count += refs;
    src.production += production;
    if (dateStr && (!src.lastDate || dateStr > src.lastDate)) src.lastDate = dateStr;
    if (!src.months[month]) src.months[month] = { count: 0, production: 0 };
    src.months[month].count += refs;
    src.months[month].production += production;
  }

  let synced = 0;
  let skipped = 0;

  for (const [name, data] of sources) {
    const monthKeys = Object.keys(data.months).filter(m => m !== "unknown").sort();
    const totalMonths = monthKeys.length || 1;
    const monthlyAvg = data.count / totalMonths;

    const lastMonth = monthKeys[monthKeys.length - 1];
    const recentCount = lastMonth ? (data.months[lastMonth]?.count || 0) : 0;

    const prior3 = monthKeys.slice(-4, -1);
    const prior3Total = prior3.reduce((sum, m) => sum + (data.months[m]?.count || 0), 0);
    const prior3Avg = prior3.length > 0 ? prior3Total / prior3.length : monthlyAvg;

    try {
      await db("referral_sources")
        .insert({
          organization_id: orgId,
          name,
          gp_name: name,
          referral_count: data.count,
          total_referrals: data.count,
          total_production: data.production,
          recent_referral_count: recentCount,
          monthly_average: Math.round(monthlyAvg * 10) / 10,
          prior_3_month_avg: Math.round(prior3Avg * 10) / 10,
          last_referral_date: data.lastDate ? new Date(data.lastDate) : null,
          source_type: data.type,
          monthly_breakdown: JSON.stringify(data.months),
        })
        .onConflict(["organization_id", "name"])
        .merge();
      synced++;
    } catch {
      skipped++;
    }
  }

  if (synced === 0 && sources.size === 0) {
    const sampleHeaders = rawData.length > 0 ? Object.keys(rawData[0]).join(", ") : "empty";
    console.warn(`[ReferralSourceSync] Org ${orgId}: ZERO sources found. Headers: [${sampleHeaders}]. ${rawData.length} rows examined.`);
  }

  console.log(`[ReferralSourceSync] Org ${orgId}: synced ${synced}, skipped ${skipped}, unique sources: ${sources.size}`);
  return {
    synced,
    skipped,
    zeroSourcesDetected: synced === 0 && sources.size === 0,
    headersSeen: rawData.length > 0 ? Object.keys(rawData[0]) : [],
  };
}
