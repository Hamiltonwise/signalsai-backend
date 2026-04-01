/**
 * Instant Website Generator
 *
 * Creates a website_builder.projects record and homepage during account creation.
 * Uses checkup data (Google Places, reviews, rating, category, hours) to build
 * a real website preview instantly, no async pipeline needed.
 *
 * Called synchronously after account creation in the checkup flow.
 * Wrapped in try/catch so it never blocks account creation.
 */

import { v4 as uuid } from "uuid";
import { db } from "../database/connection";

const PROJECTS_TABLE = "website_builder.projects";
const PAGES_TABLE = "website_builder.pages";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface CheckupWebsiteInput {
  orgId: number;
  orgName: string;
  placeId?: string | null;
  checkupData?: any;
  category?: string | null;
}

interface ReviewQuote {
  text: string;
  author: string;
  rating: number;
}

// -----------------------------------------------------------------------
// Hostname from business name
// -----------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function generateHostnameFromName(name: string): string {
  const slug = slugify(name);
  if (!slug) {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `site-${num}`;
  }
  // Append short random suffix for uniqueness
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${slug}-${suffix}`;
}

// -----------------------------------------------------------------------
// Extract best review quotes as testimonials
// -----------------------------------------------------------------------

function extractTestimonials(checkupData: any): ReviewQuote[] {
  const quotes: ReviewQuote[] = [];

  // Try reviews from checkupData.place.reviews (raw Places API data)
  const placeReviews = checkupData?.place?.reviews || [];
  for (const r of placeReviews) {
    const text = r?.text?.text || r?.text || "";
    if (text && text.length > 20) {
      quotes.push({
        text: text.length > 300 ? text.slice(0, 297) + "..." : text,
        author: r?.authorAttribution?.displayName || r?.author || "Verified Customer",
        rating: r?.rating || 5,
      });
    }
  }

  // Also try reviews from the findings-level data
  if (quotes.length === 0 && checkupData?.reviews) {
    const rawReviews = Array.isArray(checkupData.reviews)
      ? checkupData.reviews
      : [];
    for (const r of rawReviews) {
      const text = typeof r === "string" ? r : r?.text || r?.snippet || "";
      if (text && text.length > 20) {
        quotes.push({
          text: text.length > 300 ? text.slice(0, 297) + "..." : text,
          author: r?.author || "Verified Customer",
          rating: r?.rating || 5,
        });
      }
    }
  }

  // Try praise_patterns from research brief if available
  if (quotes.length === 0 && checkupData?.praisePatterns) {
    for (const p of checkupData.praisePatterns.slice(0, 5)) {
      quotes.push({
        text: typeof p === "string" ? p : p?.text || "",
        author: "Verified Customer",
        rating: 5,
      });
    }
  }

  // Return top 5, prioritizing 4 and 5 star reviews
  return quotes
    .filter((q) => q.rating >= 4)
    .slice(0, 5);
}

// -----------------------------------------------------------------------
// Build hours display
// -----------------------------------------------------------------------

function formatHours(checkupData: any): string {
  const hours = checkupData?.place?.regularOpeningHours?.weekdayDescriptions;
  if (!hours || !Array.isArray(hours)) return "";

  return hours
    .map((h: string) => `<li class="py-1 border-b border-gray-100 last:border-0">${escapeHtml(h)}</li>`)
    .join("\n");
}

// -----------------------------------------------------------------------
// HTML escaping
// -----------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// -----------------------------------------------------------------------
// Derive a tagline from review themes or category
// -----------------------------------------------------------------------

function deriveTagline(orgName: string, checkupData: any, category?: string | null): string {
  // Try to extract themes from checkup findings
  const findings = checkupData?.findings || [];
  const praiseThemes = checkupData?.reviewThemes || [];

  // If there are review themes, use the most positive one
  if (praiseThemes.length > 0) {
    const theme = typeof praiseThemes[0] === "string"
      ? praiseThemes[0]
      : praiseThemes[0]?.theme || praiseThemes[0]?.title || "";
    if (theme) return `Known for ${theme.toLowerCase()}`;
  }

  // Category-based fallbacks using universal language
  const cat = (category || "").toLowerCase();
  if (cat.includes("endodont")) return "Expert care when it matters most";
  if (cat.includes("orthodont")) return "Transforming smiles, building confidence";
  if (cat.includes("dentist")) return "Your trusted partner in oral health";
  if (cat.includes("chiropract")) return "Restoring movement, restoring life";
  if (cat.includes("physical therap")) return "Getting you back to what you love";
  if (cat.includes("optometr")) return "Clarity of vision, clarity of care";
  if (cat.includes("veterinar")) return "Compassionate care for your family";
  if (cat.includes("attorney") || cat.includes("lawyer")) return "Protecting what matters to you";
  if (cat.includes("accountant") || cat.includes("cpa") || cat.includes("financial")) return "Your financial peace of mind";

  return "Trusted by your community";
}

// -----------------------------------------------------------------------
// Build homepage sections (HTML content matching Section[] format)
// -----------------------------------------------------------------------

function buildHomepageSections(
  orgName: string,
  checkupData: any,
  category?: string | null,
): Array<{ name: string; content: string }> {
  const rating = checkupData?.rating || checkupData?.place?.rating || null;
  const reviewCount = checkupData?.reviewCount || checkupData?.place?.userRatingCount || null;
  const address = checkupData?.place?.formattedAddress || checkupData?.address || "";
  const phone = checkupData?.place?.nationalPhoneNumber || checkupData?.phone || "";
  const website = checkupData?.place?.websiteUri || "";
  const tagline = deriveTagline(orgName, checkupData, category);
  const testimonials = extractTestimonials(checkupData);
  const hoursHtml = formatHours(checkupData);
  const escapedName = escapeHtml(orgName);
  const specialty = checkupData?.place?.primaryTypeDisplayName?.text
    || checkupData?.market?.specialty
    || category
    || "";

  // Photos from Google Places
  const photos = checkupData?.place?.photos || [];
  const heroPhotoUrl = photos.length > 0
    ? `https://places.googleapis.com/v1/${photos[0].name}/media?maxWidthPx=1200&key=GOOGLE_API_KEY`
    : "";

  const sections: Array<{ name: string; content: string }> = [];

  // ── Hero Section ──
  const ratingStars = rating
    ? `<div class="flex items-center gap-2 mt-4">
        <span class="text-yellow-400 text-xl">${"★".repeat(Math.round(rating))}</span>
        <span class="text-gray-600">${rating} rating${reviewCount ? ` from ${reviewCount} reviews` : ""}</span>
      </div>`
    : "";

  sections.push({
    name: "hero",
    content: `<section class="relative bg-gradient-to-br from-[#212D40] to-[#2a3a50] text-white py-24 px-6">
  <div class="max-w-4xl mx-auto text-center">
    <h1 class="text-5xl font-bold tracking-tight mb-4">${escapedName}</h1>
    <p class="text-xl text-gray-300 max-w-2xl mx-auto">${escapeHtml(tagline)}</p>
    ${ratingStars}
    ${specialty ? `<p class="mt-3 text-sm text-gray-400 uppercase tracking-widest">${escapeHtml(specialty)}</p>` : ""}
    <div class="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
      ${phone ? `<a href="tel:${escapeHtml(phone)}" class="inline-flex items-center justify-center px-8 py-3 bg-[#D56753] text-white font-semibold rounded-xl hover:brightness-110 transition-all">Call Now</a>` : ""}
      <a href="#contact" class="inline-flex items-center justify-center px-8 py-3 border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/10 transition-all">Get in Touch</a>
    </div>
  </div>
</section>`,
  });

  // ── Testimonials Section ──
  if (testimonials.length > 0) {
    const testimonialCards = testimonials
      .map(
        (t) => `<div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div class="text-yellow-400 mb-3">${"★".repeat(t.rating)}</div>
      <p class="text-gray-700 mb-4 leading-relaxed">"${escapeHtml(t.text)}"</p>
      <p class="text-sm font-semibold text-[#212D40]">${escapeHtml(t.author)}</p>
    </div>`,
      )
      .join("\n    ");

    sections.push({
      name: "testimonials",
      content: `<section class="py-20 px-6 bg-gray-50">
  <div class="max-w-6xl mx-auto">
    <h2 class="text-3xl font-bold text-[#212D40] text-center mb-4">What Our Customers Say</h2>
    <p class="text-gray-500 text-center mb-12 max-w-xl mx-auto">Real reviews from real people who chose ${escapedName}.</p>
    <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
    ${testimonialCards}
    </div>
  </div>
</section>`,
    });
  }

  // ── About / Why Us Section ──
  sections.push({
    name: "about",
    content: `<section class="py-20 px-6">
  <div class="max-w-4xl mx-auto text-center">
    <h2 class="text-3xl font-bold text-[#212D40] mb-6">Why ${escapedName}</h2>
    <div class="grid gap-8 md:grid-cols-3 mt-10">
      <div class="text-center">
        <div class="w-14 h-14 bg-[#D56753]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg class="w-7 h-7 text-[#D56753]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <h3 class="font-semibold text-[#212D40] mb-2">Proven Results</h3>
        <p class="text-gray-500 text-sm">Trusted by customers throughout the community with a track record of excellence.</p>
      </div>
      <div class="text-center">
        <div class="w-14 h-14 bg-[#D56753]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg class="w-7 h-7 text-[#D56753]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <h3 class="font-semibold text-[#212D40] mb-2">Responsive Service</h3>
        <p class="text-gray-500 text-sm">Fast responses, easy scheduling, and a team that values your time.</p>
      </div>
      <div class="text-center">
        <div class="w-14 h-14 bg-[#D56753]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg class="w-7 h-7 text-[#D56753]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
        </div>
        <h3 class="font-semibold text-[#212D40] mb-2">Community Focused</h3>
        <p class="text-gray-500 text-sm">Deeply rooted in the local community, serving neighbors who become family.</p>
      </div>
    </div>
  </div>
</section>`,
  });

  // ── Contact / Hours Section ──
  const contactParts: string[] = [];
  if (address) {
    contactParts.push(`<div class="mb-6">
        <h3 class="font-semibold text-[#212D40] mb-1">Location</h3>
        <p class="text-gray-600">${escapeHtml(address)}</p>
      </div>`);
  }
  if (phone) {
    contactParts.push(`<div class="mb-6">
        <h3 class="font-semibold text-[#212D40] mb-1">Phone</h3>
        <p class="text-gray-600"><a href="tel:${escapeHtml(phone)}" class="text-[#D56753] hover:underline">${escapeHtml(phone)}</a></p>
      </div>`);
  }
  if (website) {
    contactParts.push(`<div class="mb-6">
        <h3 class="font-semibold text-[#212D40] mb-1">Website</h3>
        <p class="text-gray-600"><a href="${escapeHtml(website)}" target="_blank" rel="noopener" class="text-[#D56753] hover:underline">${escapeHtml(website)}</a></p>
      </div>`);
  }

  const hoursBlock = hoursHtml
    ? `<div>
        <h3 class="font-semibold text-[#212D40] mb-3">Hours</h3>
        <ul class="text-gray-600 text-sm">${hoursHtml}</ul>
      </div>`
    : "";

  sections.push({
    name: "contact",
    content: `<section id="contact" class="py-20 px-6 bg-[#212D40] text-white">
  <div class="max-w-4xl mx-auto">
    <h2 class="text-3xl font-bold text-center mb-12">Get in Touch</h2>
    <div class="grid gap-12 md:grid-cols-2">
      <div>
        ${contactParts.join("\n        ") || `<p class="text-gray-300">Contact us to learn more about our services.</p>`}
      </div>
      ${hoursBlock ? `<div>${hoursBlock}</div>` : ""}
    </div>
  </div>
</section>`,
  });

  // ── Footer Section ──
  sections.push({
    name: "footer",
    content: `<footer class="py-8 px-6 bg-gray-900 text-gray-400 text-center text-sm">
  <p>&copy; ${new Date().getFullYear()} ${escapedName}. All rights reserved.</p>
  <p class="mt-2">Powered by <a href="https://getalloro.com" class="text-[#D56753] hover:underline" target="_blank" rel="noopener">Alloro</a></p>
</footer>`,
  });

  return sections;
}

// -----------------------------------------------------------------------
// Build wrapper (full HTML shell with Tailwind CDN)
// -----------------------------------------------------------------------

function buildWrapper(orgName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(orgName)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; }
  </style>
</head>
<body>
{{slot}}
</body>
</html>`;
}

// -----------------------------------------------------------------------
// Main: generate website project + homepage
// -----------------------------------------------------------------------

export async function generateInstantWebsite(input: CheckupWebsiteInput): Promise<{
  projectId: string;
  hostname: string;
  previewUrl: string;
} | null> {
  const { orgId, orgName, placeId, checkupData, category } = input;

  // Check if a project already exists for this org
  const existing = await db(PROJECTS_TABLE)
    .where({ organization_id: orgId })
    .first();

  if (existing) {
    console.log(`[InstantWebsite] Project already exists for org ${orgId}, skipping`);
    return {
      projectId: existing.id,
      hostname: existing.generated_hostname,
      previewUrl: `https://${existing.generated_hostname}.sites.getalloro.com`,
    };
  }

  const projectId = uuid();
  const hostname = generateHostnameFromName(orgName);
  const wrapper = buildWrapper(orgName);
  const sections = buildHomepageSections(orgName, checkupData || {}, category);

  // Create project
  await db(PROJECTS_TABLE).insert({
    id: projectId,
    organization_id: orgId,
    generated_hostname: hostname,
    display_name: orgName,
    selected_place_id: placeId || null,
    status: "LIVE",
    primary_color: "#D56753",
    accent_color: "#212D40",
    wrapper,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Create homepage
  const pageId = uuid();
  await db(PAGES_TABLE).insert({
    id: pageId,
    project_id: projectId,
    path: "/",
    version: 1,
    status: "published",
    generation_status: "ready",
    sections: JSON.stringify(sections),
    display_name: "Home",
    sort_order: 0,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const previewUrl = `https://${hostname}.sites.getalloro.com`;

  // Update org with website status
  await db("organizations").where({ id: orgId }).update({
    patientpath_status: "preview_ready",
    patientpath_preview_url: previewUrl,
  });

  // Write notification
  await db("notifications").insert({
    organization_id: orgId,
    title: "Your website preview is ready",
    message: `We built a custom website for ${orgName} using your real data and reviews. Take a look.`,
    type: "system",
    read: false,
    metadata: JSON.stringify({
      source: "instant_website_generator",
      preview_url: previewUrl,
      project_id: projectId,
    }),
    created_at: new Date(),
    updated_at: new Date(),
  }).catch(() => {});

  console.log(`[InstantWebsite] Created project ${projectId} for org ${orgId} -> ${previewUrl}`);

  return { projectId, hostname, previewUrl };
}
