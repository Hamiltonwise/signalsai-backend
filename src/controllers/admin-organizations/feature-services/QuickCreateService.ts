/**
 * Quick Account Creator Service
 *
 * Accepts a Google Places placeId, pulls business data, creates org + user + location,
 * and triggers the full hydration pipeline (website, rankings, welcome intelligence,
 * trial emails). One click, full account with data.
 *
 * Used by: POST /api/admin/organizations/quick-create
 */

import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../../../database/connection";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { UserModel } from "../../../models/UserModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { LocationModel } from "../../../models/LocationModel";
import { generateReferralCode } from "../../../utils/referralCode";
import { getPlaceDetails } from "../../places/feature-services/GooglePlacesApiService";
import { BehavioralEventModel } from "../../../models/BehavioralEventModel";

const BCRYPT_SALT_ROUNDS = 12;

export type AccountType = "prospect" | "paying" | "partner" | "foundation" | "case_study" | "internal";

export interface QuickCreateInput {
  placeId: string;
  email: string;
  accountType: AccountType;
  firstName?: string;
  lastName?: string;
  skipTrialEmails?: boolean;
  trialDays?: number;
}

export interface QuickCreateResult {
  success: boolean;
  organizationId: number;
  userId: number;
  locationId: number;
  tempPassword: string;
  orgName: string;
  email: string;
  accountType: AccountType;
  websitePreviewUrl: string | null;
  message: string;
}

/**
 * Generate a human-readable temporary password.
 * Format: Word-Word-####  (easy to read aloud, meets complexity requirements)
 */
function generateTempPassword(): string {
  const words = [
    "Coral", "Summit", "River", "Cedar", "Maple", "Atlas", "Haven", "Pixel",
    "Solar", "Storm", "Arrow", "Blaze", "Crest", "Delta", "Eagle", "Frost",
    "Grove", "Harbor", "Ivory", "Jasper", "Lunar", "Noble", "Onyx", "Pearl",
  ];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${w1}-${w2}-${num}`;
}

/**
 * Extract city and state from Google Places address components.
 */
function extractCityState(place: any): { city: string; state: string; stateAbbr: string } {
  const components = place.addressComponents || [];
  let city = "";
  let state = "";
  let stateAbbr = "";
  for (const c of components) {
    const types = c.types || [];
    if (types.includes("locality")) city = c.longText || c.shortText || "";
    if (types.includes("administrative_area_level_1")) {
      state = c.longText || "";
      stateAbbr = c.shortText || "";
    }
  }
  return { city, state, stateAbbr };
}

/**
 * Quick-create an organization from a Google Places placeId.
 *
 * 1. Pulls business data from Google Places API
 * 2. Creates org + user + location in a single transaction
 * 3. Triggers full hydration pipeline (website, rankings, emails)
 */
export async function quickCreateFromPlace(
  input: QuickCreateInput
): Promise<QuickCreateResult> {
  const { placeId, email, accountType, firstName, lastName, skipTrialEmails, trialDays } = input;

  // Validate email
  const normalizedEmail = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(normalizedEmail)) {
    throw { statusCode: 400, message: "Invalid email format" };
  }

  // Check email uniqueness
  const existingUser = await UserModel.findByEmail(normalizedEmail);
  if (existingUser) {
    throw { statusCode: 409, message: "A user with this email already exists" };
  }

  // 1. Pull business data from Google Places
  let place: any;
  try {
    place = await getPlaceDetails(placeId);
  } catch (err: any) {
    throw { statusCode: 400, message: `Failed to fetch business data from Google: ${err.message}` };
  }

  if (!place) {
    throw { statusCode: 404, message: "Business not found in Google Places" };
  }

  const businessName = place.displayName?.text || place.displayName || "Unnamed Business";
  const { city, state, stateAbbr } = extractCityState(place);
  const category = place.primaryTypeDisplayName?.text || place.primaryType || "";
  const types = place.types || [];
  const rating = place.rating || null;
  const reviewCount = place.userRatingCount || 0;
  const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || null;
  const website = place.websiteUri || null;
  const address = place.formattedAddress || "";

  // 2. Generate temp password
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_SALT_ROUNDS);

  // 3. Create org + user + location in transaction
  const { user, org, locationRecord } = await db.transaction(async (trx) => {
    // Create user
    const newUser = await UserModel.create({
      email: normalizedEmail,
      password_hash: passwordHash,
    }, trx);

    await trx("users").where({ id: newUser.id }).update({
      email_verified: true,
      force_password_change: true,
      first_name: firstName?.trim() || null,
      last_name: lastName?.trim() || null,
    });

    // Create organization
    const newOrg = await OrganizationModel.create({
      name: businessName,
      referral_code: await generateReferralCode(),
    }, trx);

    // Set org properties
    const trialDaysActual = trialDays || 30; // Default 30 days for admin-created
    const trialEnd = new Date(Date.now() + trialDaysActual * 24 * 60 * 60 * 1000);

    await trx("organizations").where({ id: newOrg.id }).update({
      subscription_tier: "DFY",
      subscription_status: "active",
      onboarding_completed: true,
      onboarding_wizard_completed: true,
      operational_jurisdiction: address,
      account_type: accountType,
      trial_start_at: new Date(),
      trial_end_at: trialEnd,
      trial_status: "active",
      organization_type: "health", // Default, can be changed later
      checkup_data: JSON.stringify({
        score: null, // Will be populated by analyze
        place: {
          placeId,
          name: businessName,
          rating,
          reviewCount,
          category,
          types,
          phone,
          website,
          address,
          city,
          state,
          stateAbbr,
          photos: place.photos || [],
          reviews: place.reviews || [],
          regularOpeningHours: place.regularOpeningHours || null,
          editorialSummary: place.editorialSummary || null,
          businessStatus: place.businessStatus || null,
        },
        topCompetitor: null,
        market: { city, state, stateAbbr, specialty: category },
      }),
      business_data: JSON.stringify({
        checkup_place_id: placeId,
        checkup_data: { place: { placeId, name: businessName, rating, reviewCount } },
      }),
      setup_progress: JSON.stringify({
        step1_api_connected: false,
        step2_pms_uploaded: false,
        dismissed: false,
        completed: false,
      }),
    });

    // Link user to org
    await OrganizationUserModel.create({
      organization_id: newOrg.id,
      user_id: newUser.id,
      role: "admin",
    }, trx);

    // Create primary location
    const loc = await LocationModel.create({
      organization_id: newOrg.id,
      name: businessName,
      domain: website ? new URL(website).hostname.replace("www.", "") : null,
      is_primary: true,
    } as any, trx);

    // Vocabulary config
    const CATEGORY_TO_VERTICAL: Record<string, string> = {
      endodontist: "endodontics", orthodontist: "orthodontics", dentist: "general_dentistry",
      chiropractor: "chiropractic", "physical therapist": "physical_therapy",
      optometrist: "optometry", veterinarian: "veterinary", attorney: "legal",
      lawyer: "legal", accountant: "financial_advisor", cpa: "financial_advisor",
      "financial advisor": "financial_advisor", "real estate agent": "real_estate",
    };
    const vertical = CATEGORY_TO_VERTICAL[category.toLowerCase()] || "general";
    const hasVocabTable = await trx.schema.hasTable("vocabulary_configs");
    if (hasVocabTable) {
      const existingVocab = await trx("vocabulary_configs").where({ org_id: newOrg.id }).first();
      if (!existingVocab) {
        await trx("vocabulary_configs").insert({
          org_id: newOrg.id,
          vertical,
          overrides: JSON.stringify({}),
        });
      }
    }

    return { user: newUser, org: newOrg, locationRecord: loc };
  });

  console.log(`[QuickCreate] Account created: ${normalizedEmail} -> org ${org.id} (${businessName})`);

  // Track event
  BehavioralEventModel.create({
    event_type: "admin.quick_create",
    org_id: org.id,
    properties: { placeId, accountType, businessName, createdBy: "admin" },
  }).catch(() => {});

  // 4. Trigger hydration pipeline (all non-blocking)
  let websitePreviewUrl: string | null = null;

  // Website generation
  try {
    const { generateInstantWebsite } = await import("../../../services/instantWebsiteGenerator");
    const checkupData = {
      place: {
        placeId,
        name: businessName,
        rating,
        reviewCount,
        category,
        types,
        phone,
        website,
        address,
        photos: place.photos || [],
        reviews: place.reviews || [],
        regularOpeningHours: place.regularOpeningHours || null,
        editorialSummary: place.editorialSummary || null,
      },
    };
    const result = await generateInstantWebsite({
      orgId: org.id,
      orgName: businessName,
      placeId,
      checkupData,
      category,
    });
    if (result) {
      websitePreviewUrl = result.previewUrl;
      console.log(`[QuickCreate] Website generated: ${result.previewUrl}`);
    }
  } catch (iwErr: any) {
    console.error(`[QuickCreate] Website generation failed (non-blocking):`, iwErr.message);
  }

  // PatientPath build
  try {
    const { getMindsQueue } = await import("../../../workers/queues");
    const ppQueue = getMindsQueue("patientpath-build");
    await ppQueue.add(
      `patientpath:build:${org.id}`,
      { orgId: org.id, placeId },
      { jobId: `patientpath-build-${org.id}`, attempts: 3, backoff: { type: "exponential", delay: 30000 } }
    );
  } catch (ppErr: any) {
    console.error(`[QuickCreate] PatientPath enqueue failed:`, ppErr.message);
  }

  // Seed initial ranking snapshot
  try {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    await db("weekly_ranking_snapshots").insert({
      org_id: org.id,
      week_start: weekStart.toISOString().split("T")[0],
      keyword: `${businessName} in ${city || "your area"}`,
      client_review_count: reviewCount,
    }).catch(() => {});
  } catch (snapErr: any) {
    console.error(`[QuickCreate] Snapshot seed failed:`, snapErr.message);
  }

  // Welcome Intelligence (4h delayed)
  try {
    const { getMindsQueue } = await import("../../../workers/queues");
    const wiQueue = getMindsQueue("welcome-intelligence");
    await wiQueue.add(
      `welcome:intel:${org.id}`,
      {
        orgId: org.id,
        userId: user.id,
        email: normalizedEmail,
        practiceName: businessName,
        placeId,
        specialty: category,
        city,
        stateAbbr,
        checkupScore: null,
        topCompetitorName: null,
      },
      {
        jobId: `welcome-intel-${org.id}`,
        delay: 4 * 60 * 60 * 1000,
        attempts: 2,
        backoff: { type: "exponential", delay: 60000 },
      }
    );
  } catch (wiErr: any) {
    console.error(`[QuickCreate] Welcome Intelligence enqueue failed:`, wiErr.message);
  }

  // Trial email sequence (skip if explicitly requested)
  if (!skipTrialEmails) {
    try {
      const { getMindsQueue } = await import("../../../workers/queues");
      const trialQueue = getMindsQueue("trial-email");
      const trialDaysSchedule = [
        { day: 1, delayMs: 0 },
        { day: 3, delayMs: 2 * 24 * 60 * 60 * 1000 },
        { day: 5, delayMs: 4 * 24 * 60 * 60 * 1000 },
        { day: 6, delayMs: 5 * 24 * 60 * 60 * 1000 },
        { day: 7, delayMs: 6 * 24 * 60 * 60 * 1000 },
      ];
      for (const { day, delayMs } of trialDaysSchedule) {
        await trialQueue.add(
          `trial:day${day}:${org.id}`,
          { orgId: org.id, day },
          { jobId: `trial-day${day}-${org.id}`, delay: delayMs, attempts: 3, backoff: { type: "exponential", delay: 60000 } }
        );
      }
    } catch (trialErr: any) {
      console.error(`[QuickCreate] Trial email enqueue failed:`, trialErr.message);
    }
  }

  // Welcome email with temp credentials
  try {
    const { sendEmail } = await import("../../../emails/emailService");
    const derivedFirstName = firstName || normalizedEmail.split("@")[0].replace(/[._-]/g, " ").split(" ")[0];
    const capitalizedName = derivedFirstName.charAt(0).toUpperCase() + derivedFirstName.slice(1);

    await sendEmail({
      recipients: [normalizedEmail],
      subject: `Your ${businessName} account is ready`,
      body: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
          <p style="font-size: 16px; color: #1A1D23; line-height: 1.6;">Hi ${capitalizedName},</p>
          <p style="font-size: 16px; color: #1A1D23; line-height: 1.6;">Your Alloro account for <strong>${businessName}</strong> is set up and ready to go.</p>
          <div style="background: #F8F9FA; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #6B7280;">Your login credentials:</p>
            <p style="margin: 0 0 4px; font-size: 15px; color: #1A1D23;"><strong>Email:</strong> ${normalizedEmail}</p>
            <p style="margin: 0; font-size: 15px; color: #1A1D23;"><strong>Temporary password:</strong> ${tempPassword}</p>
          </div>
          <p style="font-size: 14px; color: #6B7280; line-height: 1.5;">You will be asked to change your password on first login.</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${process.env.APP_URL || "https://sandbox.getalloro.com"}/login" style="display: inline-block; background: #D56753; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-size: 15px; font-weight: 600;">Sign In</a>
          </div>
          <p style="font-size: 16px; color: #1A1D23; line-height: 1.6;">We have already started building your competitive intelligence. Your dashboard will have insights waiting for you.</p>
          <p style="font-size: 16px; color: #1A1D23; line-height: 1.6;">Corey at Alloro</p>
        </div>
      `,
    });
    console.log(`[QuickCreate] Welcome email sent to ${normalizedEmail}`);
  } catch (emailErr: any) {
    console.error(`[QuickCreate] Welcome email failed (non-blocking):`, emailErr.message);
  }

  return {
    success: true,
    organizationId: org.id,
    userId: user.id,
    locationId: locationRecord.id,
    tempPassword,
    orgName: businessName,
    email: normalizedEmail,
    accountType,
    websitePreviewUrl,
    message: `Account created for "${businessName}" (${normalizedEmail}). Temp password: ${tempPassword}`,
  };
}
