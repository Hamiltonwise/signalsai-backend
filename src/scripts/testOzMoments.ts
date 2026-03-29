/**
 * Test Oz Moment Generator -- simulates checkup data for 3 business types
 * and evaluates whether the Claude-generated hooks are surprising or generic.
 *
 * Run: npx tsx src/scripts/testOzMoments.ts
 */

import "dotenv/config";
import { generateOzMoments, type OzMomentData } from "../services/ozMoment";

const scenarios: Array<{ label: string; data: OzMomentData }> = [
  {
    label: "ENDODONTIST IN PHOENIX (behind competitor)",
    data: {
      clientName: "Desert Ridge Endodontics",
      clientPlaceId: null,
      clientRating: 4.7,
      clientReviewCount: 38,
      clientReviews: [
        { text: "Dr. Chen saved my tooth when two other dentists said it needed to come out. Painless procedure, I was in and out in 45 minutes.", rating: 5, author: "Maria G.", when: "2 months ago" },
        { text: "Very professional and modern office. The 3D imaging was impressive. Only downside was the 3 week wait for an appointment.", rating: 4, author: "James R.", when: "3 months ago" },
        { text: "I was terrified of getting a root canal but Dr. Chen made it completely painless. His staff is incredibly kind.", rating: 5, author: "Sarah T.", when: "1 month ago" },
        { text: "Great experience overall. Wish they had Saturday hours though, had to take time off work.", rating: 4, author: "Robert M.", when: "4 months ago" },
        { text: "The best endodontist in the East Valley. I've referred all my patients here for years.", rating: 5, author: "Dr. Lisa Patel", when: "5 months ago" },
      ],
      clientHasWebsite: true,
      clientPhotoCount: 6,
      clientCategory: "endodontist",
      clientCity: "Phoenix",
      competitorName: "Scottsdale Endodontic Associates",
      competitorPlaceId: null,
      competitorRating: 4.9,
      competitorReviewCount: 127,
      competitorReviews: [
        { text: "Same day emergency appointment. They got me in within 2 hours of calling. Can't say enough good things.", rating: 5, author: "Mike D.", when: "2 weeks ago" },
        { text: "Modern facility with the latest technology. Dr. Patel explained everything before starting. Very transparent about costs.", rating: 5, author: "Jennifer K.", when: "1 month ago" },
        { text: "I drove 45 minutes past two other endodontists to come here. Worth every minute of the drive.", rating: 5, author: "David L.", when: "3 weeks ago" },
        { text: "The online booking system made it so easy. I booked at 11pm and had a confirmation by 8am.", rating: 5, author: "Amy W.", when: "1 month ago" },
        { text: "Beautiful new office. They even have a coffee bar in the waiting room. Felt more like a spa than a dental office.", rating: 5, author: "Chris B.", when: "2 months ago" },
      ],
      competitorHasWebsite: true,
      competitorPhotoCount: 47,
      competitorHours: "Mon-Fri 7am-6pm, Sat 8am-2pm",
      marketRank: 4,
      totalCompetitors: 12,
      avgRating: 4.6,
      avgReviews: 55,
      vertical: "dental",
      avgCaseValue: 1500,
    },
  },
  {
    label: "PLUMBER IN AUSTIN (market leader)",
    data: {
      clientName: "Radiant Plumbing & Air Conditioning",
      clientPlaceId: null,
      clientRating: 4.9,
      clientReviewCount: 312,
      clientReviews: [
        { text: "These guys are the real deal. Fixed a slab leak other plumbers couldn't find. The thermal imaging camera was next level.", rating: 5, author: "Tom H.", when: "1 week ago" },
        { text: "Expensive but worth it. They showed up on time, wore booties, and cleaned up after themselves. Never had that experience with a plumber before.", rating: 5, author: "Karen S.", when: "2 weeks ago" },
        { text: "The unicorn truck is iconic. My kids waved at it in the neighborhood. Great marketing and even better service.", rating: 5, author: "Dan P.", when: "3 weeks ago" },
        { text: "Had a pipe burst at 2am on a Sunday. They were here by 3am. Saved my entire first floor from flooding.", rating: 5, author: "Lisa M.", when: "1 month ago" },
        { text: "Only complaint: they're so popular it took 4 days to get an appointment for non-emergency work.", rating: 4, author: "Steve R.", when: "2 months ago" },
      ],
      clientHasWebsite: true,
      clientPhotoCount: 34,
      clientCategory: "plumber",
      clientCity: "Austin",
      competitorName: "ABC Home & Commercial Services",
      competitorPlaceId: null,
      competitorRating: 4.5,
      competitorReviewCount: 287,
      competitorReviews: [
        { text: "Good price but the technician was in and out in 15 minutes. Didn't explain what he did.", rating: 3, author: "Nancy J.", when: "1 month ago" },
        { text: "They offer financing which was helpful for the water heater replacement. Service was fine, nothing special.", rating: 4, author: "Bill T.", when: "2 months ago" },
        { text: "Third time using them. Consistent, reliable, fair pricing. Not fancy but gets the job done.", rating: 4, author: "Rita C.", when: "3 weeks ago" },
        { text: "Had to call back because the original fix didn't hold. They came back for free which I appreciated.", rating: 3, author: "Mark G.", when: "1 month ago" },
        { text: "The $49 diagnostic fee is a nice touch. You know upfront what you're paying before any work starts.", rating: 5, author: "Jen L.", when: "2 months ago" },
      ],
      competitorHasWebsite: true,
      competitorPhotoCount: 12,
      competitorHours: "Mon-Fri 8am-5pm",
      marketRank: 1,
      totalCompetitors: 24,
      avgRating: 4.3,
      avgReviews: 89,
      vertical: "home_services",
      avgCaseValue: 300,
    },
  },
  {
    label: "ATTORNEY IN DENVER (struggling)",
    data: {
      clientName: "Morrison Family Law",
      clientPlaceId: null,
      clientRating: 4.2,
      clientReviewCount: 11,
      clientReviews: [
        { text: "Sarah Morrison handled my divorce with incredible empathy. She understood this wasn't just about paperwork.", rating: 5, author: "Anonymous", when: "4 months ago" },
        { text: "Responsive and professional. The retainer was steep but the outcome was worth it.", rating: 4, author: "Michael B.", when: "6 months ago" },
        { text: "Good attorney but the office is hard to find. No signage from the street. Parking was a nightmare.", rating: 3, author: "Diane S.", when: "8 months ago" },
      ],
      clientHasWebsite: false,
      clientPhotoCount: 2,
      clientCategory: "attorney",
      clientCity: "Denver",
      competitorName: "Colorado Legal Group",
      competitorPlaceId: null,
      competitorRating: 4.8,
      competitorReviewCount: 89,
      competitorReviews: [
        { text: "Free consultation was incredibly helpful. They explained the entire process before I committed.", rating: 5, author: "Rachel T.", when: "2 weeks ago" },
        { text: "Their blog articles helped me understand Colorado family law before I even called. That's how I found them.", rating: 5, author: "Kevin M.", when: "1 month ago" },
        { text: "Smooth process from start to finish. The client portal let me track everything online.", rating: 5, author: "Amanda L.", when: "3 weeks ago" },
        { text: "I found them through a Google search for 'family lawyer near me'. Their reviews convinced me to call.", rating: 5, author: "Greg W.", when: "1 month ago" },
        { text: "A bit pricey but the peace of mind was worth it. They handled everything so I didn't have to.", rating: 4, author: "Susan P.", when: "2 months ago" },
      ],
      competitorHasWebsite: true,
      competitorPhotoCount: 28,
      competitorHours: "Mon-Fri 8am-6pm, Sat 9am-1pm",
      marketRank: 14,
      totalCompetitors: 22,
      avgRating: 4.5,
      avgReviews: 34,
      vertical: "legal",
      avgCaseValue: 3000,
    },
  },
];

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  OZ MOMENT GENERATOR -- LIVE TEST");
  console.log("═══════════════════════════════════════════════════════\n");

  for (const scenario of scenarios) {
    console.log(`\n▸ ${scenario.label}`);
    console.log("─".repeat(60));

    const start = Date.now();
    const moments = await generateOzMoments(scenario.data);
    const elapsed = Date.now() - start;

    if (moments.length === 0) {
      console.log("  ✗ No moments generated\n");
      continue;
    }

    for (const [i, m] of moments.entries()) {
      console.log(`\n  Moment ${i + 1} (shareability: ${m.shareability}/10):`);
      console.log(`  HOOK: ${m.hook}`);
      console.log(`  IMPL: ${m.implication}`);
      console.log(`  ACT:  ${m.action}`);
    }

    console.log(`\n  ⏱ ${elapsed}ms`);
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  EVALUATION CRITERIA:");
  console.log("  - Does the HOOK make you stop scrolling?");
  console.log("  - Is it SPECIFIC (named competitor, real number)?");
  console.log("  - Would you TEXT this to a colleague?");
  console.log("  - Does it reveal something the owner DIDN'T KNOW?");
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch(console.error);
