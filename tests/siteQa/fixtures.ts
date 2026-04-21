import type { Section } from "../../src/services/siteQa/types";

/**
 * Coastal Endodontic Studio (calm-beauty-2180) — live defects on sandbox as of
 * 2026-04-21. Each defect listed in the Work Order appears here so the Site QA
 * Agent can be proven against it end-to-end.
 */
export const coastalSections: Section[] = [
  {
    type: "hero",
    data: {
      heading: "Expert Root Canal Care,Close to Home.",
      subheading:
        "Coastal Endodontic Studio provides state-of-the-art microendodontics to the Monmouth County community.",
    },
  },
  {
    type: "about",
    data: {
      body: "We take the time to answer every question, so you feel confident and comfortable before, during, and after treatment.",
    },
  },
  {
    type: "services",
    data: {
      services: [
        {
          title: "Endodontic Treatment",
          description:
            "2:32 PM / Claude responded: Save your natural tooth with our state-of-the-art technology.",
        },
        {
          title: "Retreatment",
          description: "Sometimes a prior root canal needs revisiting. We offer precise retreatment.",
        },
      ],
    },
  },
  {
    type: "gallery",
    data: {
      images: [
        {
          src: "https://cdn.example.com/coastal-1.jpg",
          alt: "Duplicate outdoor portrait",
        },
        {
          src: "https://cdn.example.com/coastal-2.jpg",
          alt: "Welcoming reception area",
        },
      ],
    },
  },
];

export const coastalFooter =
  "© 2025 Coastal Endodontic Studio. All rights reserved.";

/**
 * ARCS (calm-clinic-3597) — live defects on sandbox as of 2026-04-21.
 */
export const arcsSections: Section[] = [
  {
    type: "hero",
    data: {
      heading: "Save Your Tooth.Trust the Specialists.",
      subheading: "Atlantic Regional Center for Surgery",
    },
  },
  {
    type: "doctors",
    data: {
      heading: "Doctors Block Doctors Block",
      doctors: [
        { name: "Dr. A. Smith", photo: "https://cdn.example.com/smith.jpg" },
      ],
    },
  },
  {
    type: "services",
    data: {
      heading: "Services Block Services Block",
      services: [
        { title: "Root Canal Therapy" },
        { title: "Apicoectomy", description: "Micro-surgical approach for persistent infection." },
      ],
    },
  },
  {
    type: "about",
    data: {
      body:
        "We take the time to answer every question, so you feel confident and comfortable before, during, and after treatment. Our office uses up-to-date technology throughout.",
    },
  },
];

export const arcsFooter = "© 2026 Atlantic Regional Center for Surgery";

/**
 * Clean fixture used for negative tests: a page that should pass every gate.
 */
export const cleanSections: Section[] = [
  {
    type: "hero",
    data: {
      heading: "We answer on the first ring on Tuesdays before 10am",
      subheading:
        "Dr. Reyes has practiced in downtown Red Bank since 2012 and still answers her own emergency line on weekends.",
    },
  },
  {
    type: "services",
    data: {
      services: [
        {
          title: "Adult orthodontics",
          description:
            "Consults run 45 minutes. Dr. Reyes reviews x-rays with you on her laptop in the room, not a clinical photo on a screen down the hall.",
        },
      ],
    },
  },
  {
    type: "doctors",
    data: {
      doctors: [
        {
          name: "Dr. Reyes",
          photo: "https://cdn.example.com/reyes.jpg",
          bio: "Graduate of Rutgers orthodontics residency. Still treats her 2012 first patients.",
        },
      ],
    },
  },
  {
    type: "locations",
    data: {
      locations: [
        {
          name: "Red Bank",
          address: "12 Monmouth St",
          hours: "Mon-Fri 8-5, Sat 9-1",
        },
      ],
    },
  },
];

export const cleanFooter = `© ${new Date().getUTCFullYear()} Reyes Orthodontics`;
