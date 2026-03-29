/**
 * GP Discovery -- WO-56
 *
 * GET  /api/user/referrals/discover?radius=5  -- find GPs not in referral history
 * POST /api/user/referrals/discover/outreach  -- generate introduction letter for a discovered GP
 */

import express from "express";
import axios from "axios";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";
import { generateOutreach, type OutreachContext } from "../../services/outreachEngine";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API;
const PLACES_API_BASE = "https://places.googleapis.com/v1";

/** Miles to meters */
function milesToMeters(miles: number): number {
  return Math.round(miles * 1609.344);
}

/** Haversine distance in miles between two lat/lng pairs */
function haversineDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface DiscoveredGP {
  name: string;
  address: string;
  distance: number; // miles, rounded to 1 decimal
  specialty: string;
  placeId: string;
  phone: string | null;
}

const gpDiscoveryRoutes = express.Router();

gpDiscoveryRoutes.get(
  "/referrals/discover",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.json({ success: true, gps: [], gated: true });

      // Check if org has PMS data (Stage 3 gate)
      const hasPMS = await db("pms_jobs").where({ organization_id: orgId }).first();
      if (!hasPMS) {
        return res.json({
          success: true,
          gps: [],
          gated: true,
          gate_message:
            "Upload your scheduling data to discover referral sources in your area who have never sent you a case.",
        });
      }

      // Get existing referral source names for this org (lowercase for matching)
      const hasTable = await db.schema.hasTable("referral_sources");
      const existingSources = new Set<string>();
      if (hasTable) {
        const sources = await db("referral_sources")
          .where({ organization_id: orgId })
          .select("gp_name", "name");
        for (const s of sources) {
          const name = (s.gp_name || s.name || "").toLowerCase().trim();
          if (name) existingSources.add(name);
        }
      }

      // Get the org's primary location for lat/lng
      const location = await db("locations")
        .where({ organization_id: orgId, is_primary: true })
        .first("lat", "lng", "city", "state", "specialty");

      if (!location?.lat || !location?.lng) {
        return res.json({
          success: true,
          gps: [],
          gated: false,
          existing_count: existingSources.size,
          message: "Practice location coordinates are required. Connect your Google Business Profile to enable discovery.",
        });
      }

      // Radius from query param, default 5 miles, clamp 1-25
      const radiusParam = Number(req.query.radius) || 5;
      const radiusMiles = Math.max(1, Math.min(25, radiusParam));

      // If no Places API key, return graceful fallback
      if (!GOOGLE_PLACES_API_KEY) {
        return res.json({
          success: true,
          gps: [],
          gated: false,
          existing_count: existingSources.size,
          radius: radiusMiles,
          message: "GP discovery requires the Google Places API key. Contact support to enable.",
        });
      }

      // Search for referral sources near the business -- vertical-aware
      const spec = (location.specialty || "").toLowerCase();

      // Vertical-specific referral source queries
      const REFERRAL_SOURCE_QUERIES: Record<string, string[]> = {
        dental: ["general dentist", "family dentist"],
        endo: ["general dentist", "family dentist"],
        ortho: ["general dentist", "family dentist", "pediatric dentist"],
        perio: ["general dentist", "periodontist"],
        chiro: ["family medicine", "orthopedic surgeon", "physical therapist"],
        physical_ther: ["orthopedic surgeon", "family medicine", "sports medicine"],
        optom: ["family medicine", "ophthalmologist"],
        attorney: ["insurance broker", "real estate agent", "financial advisor", "accountant"],
        lawyer: ["insurance broker", "real estate agent", "financial advisor", "accountant"],
        account: ["attorney", "financial advisor", "insurance broker", "bank"],
        cpa: ["attorney", "financial advisor", "insurance broker", "bank"],
        "financial adv": ["accountant", "attorney", "insurance broker", "real estate agent"],
        veterinar: ["animal shelter", "pet store", "dog trainer"],
        "real estate": ["mortgage broker", "home inspector", "insurance agent", "attorney"],
        medspa: ["dermatologist", "plastic surgeon", "family medicine"],
      };

      // Find matching queries or fall back to generic professional services
      let queries: string[] = ["general practitioner", "family medicine", "primary care physician"];
      for (const [key, q] of Object.entries(REFERRAL_SOURCE_QUERIES)) {
        if (spec.includes(key)) {
          queries = q;
          break;
        }
      }

      const allPlaces: any[] = [];
      const seenPlaceIds = new Set<string>();

      for (const query of queries) {
        try {
          const searchCity = location.city && location.state
            ? ` near ${location.city}, ${location.state}`
            : "";

          const response = await axios.post(
            `${PLACES_API_BASE}/places:searchText`,
            {
              textQuery: `${query}${searchCity}`,
              maxResultCount: 20,
              locationBias: {
                circle: {
                  center: {
                    latitude: location.lat,
                    longitude: location.lng,
                  },
                  radius: milesToMeters(radiusMiles),
                },
              },
            },
            {
              headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                "X-Goog-FieldMask":
                  "places.displayName,places.formattedAddress,places.location,places.id,places.nationalPhoneNumber,places.primaryTypeDisplayName",
              },
            },
          );

          for (const place of response.data.places || []) {
            if (!seenPlaceIds.has(place.id)) {
              seenPlaceIds.add(place.id);
              allPlaces.push(place);
            }
          }
        } catch (err: any) {
          console.warn(`[GPDiscovery] Search failed for "${query}":`, err.message);
        }
      }

      // Filter: remove places that match existing referral sources, calculate distance
      const discoveredGPs: DiscoveredGP[] = [];

      for (const place of allPlaces) {
        const displayName = place.displayName?.text || "";
        const nameLower = displayName.toLowerCase().trim();

        // Skip if already a known referral source
        if (existingSources.has(nameLower)) continue;

        // Check partial match (existing source name appears in place name or vice versa)
        let isExisting = false;
        for (const existing of existingSources) {
          if (nameLower.includes(existing) || existing.includes(nameLower)) {
            isExisting = true;
            break;
          }
        }
        if (isExisting) continue;

        // Calculate distance
        const placeLat = place.location?.latitude;
        const placeLng = place.location?.longitude;
        if (!placeLat || !placeLng) continue;

        const distance = haversineDistanceMiles(
          location.lat,
          location.lng,
          placeLat,
          placeLng,
        );

        // Only include within the requested radius
        if (distance > radiusMiles) continue;

        discoveredGPs.push({
          name: displayName,
          address: place.formattedAddress || "",
          distance: Math.round(distance * 10) / 10,
          specialty: place.primaryTypeDisplayName?.text || "General Practice",
          placeId: place.id,
          phone: place.nationalPhoneNumber || null,
        });
      }

      // Sort by distance
      discoveredGPs.sort((a, b) => a.distance - b.distance);

      return res.json({
        success: true,
        gps: discoveredGPs,
        gated: false,
        existing_count: existingSources.size,
        radius: radiusMiles,
      });
    } catch (error: any) {
      console.error("[GPDiscovery] Error:", error.message);
      return res.json({ success: true, gps: [], gated: false });
    }
  },
);

gpDiscoveryRoutes.post(
  "/referrals/discover/outreach",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const { gpName, gpAddress, distance } = req.body;
      if (!gpName) return res.status(400).json({ success: false, error: "gpName required" });

      const org = await db("organizations").where({ id: orgId }).first("name", "research_brief");
      const senderName = org?.name || "Doctor";

      // Extract irreplaceable_thing from research brief if available
      let irreplaceableThing: string | undefined;
      if (org?.research_brief) {
        try {
          const brief = typeof org.research_brief === "string" ? JSON.parse(org.research_brief) : org.research_brief;
          irreplaceableThing = brief?.irreplaceable_thing || brief?.differentiator || undefined;
        } catch { /* ignore */ }
      }

      const dataPoints: string[] = [];
      if (irreplaceableThing) dataPoints.push(`Differentiator: ${irreplaceableThing}`);
      if (distance) dataPoints.push(`Located ${distance} miles away`);

      const ctx: OutreachContext = {
        purpose: "gp_introduction",
        recipientName: `Dr. ${gpName}`,
        recipientRole: "General Practitioner",
        businessName: senderName,
        senderName,
        senderSpecialty: "Specialist",
        dataPoints,
        city: gpAddress || undefined,
        existingRelationship: false,
      };

      const result = await generateOutreach(ctx);

      return res.json({ success: true, letter: result });
    } catch (error: any) {
      console.error("[GPDiscovery] Introduction error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to generate introduction" });
    }
  },
);

export default gpDiscoveryRoutes;
