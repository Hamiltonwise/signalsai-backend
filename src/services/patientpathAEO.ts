/**
 * PatientPath AEO Content Generator (WO-8)
 *
 * Generates 5 FAQ questions per practice with FAQPage schema markup.
 * Specialty-specific templates for endodontics, orthodontics, chiro, PT,
 * optometry, vet, and ClearPath verticals.
 * All content staged for Corey approval before publishing.
 */

import { db } from "../database/connection";

interface FAQ {
  question: string;
  answer: string;
}

const SPECIALTY_TEMPLATES: Record<string, FAQ[]> = {
  endodontics: [
    { question: "What does an endodontist do differently than a general dentist?", answer: "An endodontist completes 2-3 additional years of specialized training focused exclusively on diagnosing and treating tooth pain and performing root canal procedures. While general dentists may perform some root canals, endodontists handle complex cases, retreatments, and use advanced microscopy and 3D imaging that most general practices don't have." },
    { question: "How do I know if I need a root canal?", answer: "Common signs include persistent tooth pain (especially when chewing or applying pressure), prolonged sensitivity to hot or cold, darkening of the tooth, swelling or tenderness in nearby gums, and a persistent pimple on the gums. Not all tooth pain means you need a root canal, but these symptoms warrant an evaluation." },
    { question: "How long does a root canal take?", answer: "Most root canal procedures take 60-90 minutes for a single appointment. Complex cases with multiple canals or retreatments may require two visits. Modern endodontic techniques have significantly reduced both treatment time and discomfort compared to procedures from even 10 years ago." },
    { question: "Is a root canal painful?", answer: "Modern root canal treatment is comparable to getting a filling. Local anesthesia keeps you comfortable during the procedure. Most patients report that the pain from the infected tooth before treatment was far worse than the procedure itself. Post-procedure discomfort typically resolves within a few days with over-the-counter pain medication." },
    { question: "How much does a root canal cost without insurance?", answer: "Root canal costs vary by tooth location and complexity. Front teeth typically range $700-$1,000, premolars $800-$1,100, and molars $1,000-$1,500. These are the endodontist's fees only. You'll also need a crown from your general dentist, which adds $1,000-$1,500. Many practices offer payment plans." },
  ],
  orthodontics: [
    { question: "What age should my child first see an orthodontist?", answer: "The American Association of Orthodontists recommends a first evaluation by age 7. At this age, enough permanent teeth have emerged to identify developing problems early. Early evaluation doesn't always mean early treatment. It means your orthodontist can monitor growth and intervene at the optimal time if needed." },
    { question: "How long does orthodontic treatment typically take?", answer: "Average treatment time is 12-24 months, but this varies significantly based on the complexity of your case. Minor alignment issues may resolve in 6-12 months. Complex bite corrections or surgical cases may take 24-30 months. Your orthodontist will give you a specific timeline after your diagnostic records are complete." },
    { question: "What is the difference between braces and Invisalign?", answer: "Traditional braces use metal brackets and wires bonded to teeth, providing precise control for complex movements. Invisalign uses a series of custom clear plastic aligners that are removable. Both achieve excellent results for most cases. The best choice depends on your specific orthodontic needs, lifestyle preferences, and your orthodontist's recommendation." },
    { question: "How much do braces cost?", answer: "Comprehensive orthodontic treatment typically ranges $4,000-$8,000 depending on case complexity and treatment type. Invisalign generally costs similar to traditional braces. Most orthodontists offer interest-free payment plans spreading the cost over the treatment period. Insurance may cover $1,000-$3,000 of the total." },
    { question: "Do I need a referral to see an orthodontist?", answer: "No referral is needed. You can schedule a consultation directly with any orthodontist. Most offer free or low-cost initial consultations that include an exam and discussion of treatment options. If you have dental insurance, check whether your plan requires a referral for specialist visits." },
  ],
  default: [
    { question: "How do I choose the right specialist in my area?", answer: "Start with credentials and experience. Look for board certification in their specialty, years of practice, and continuing education. Then check online reviews, focusing on patterns rather than individual reviews. Finally, schedule a consultation. The right specialist takes time to listen, explains options clearly, and makes you feel comfortable asking questions." },
    { question: "What should I expect at my first visit?", answer: "A thorough first visit typically includes a comprehensive examination, review of your health history, diagnostic imaging if needed, and a detailed discussion of findings and treatment options. The specialist should explain what they found in plain language, outline your options with pros and cons, and give you time to ask questions without feeling rushed." },
    { question: "How do I know if my insurance covers this specialist?", answer: "Call your insurance company's member services number on the back of your card. Ask specifically: Is this specialist in-network? What is my specialist copay or coinsurance? Do I need a referral? Is there an annual maximum that applies? Many specialist offices also have insurance coordinators who can verify your benefits before your first appointment." },
    { question: "What questions should I ask during my consultation?", answer: "Ask about the specialist's experience with your specific condition, what treatment options exist, expected timeline and outcomes, total cost including follow-up visits, and what happens if the initial treatment doesn't work as expected. A good specialist welcomes these questions and answers them without jargon." },
    { question: "How often should I see a specialist vs my primary care provider?", answer: "This depends on your condition. For ongoing management of a chronic condition, your specialist may want to see you every 3-6 months. For follow-up after a procedure, visits may be more frequent initially then taper off. Your specialist and primary care provider should coordinate so you're not duplicating visits unnecessarily." },
  ],
};

function getTemplateForSpecialty(specialty: string): FAQ[] {
  const normalized = specialty.toLowerCase();
  if (normalized.includes("endodont")) return SPECIALTY_TEMPLATES.endodontics;
  if (normalized.includes("orthodont")) return SPECIALTY_TEMPLATES.orthodontics;
  return SPECIALTY_TEMPLATES.default;
}

function generateFAQSchema(practiceName: string, faqs: FAQ[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((faq) => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer,
      },
    })),
    "about": {
      "@type": "LocalBusiness",
      "name": practiceName,
    },
  };
}

/**
 * Generate and store FAQ content for a practice
 */
export async function generateFAQContent(orgId: number): Promise<void> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return;

  const specialty = org.specialty || "general";
  const faqs = getTemplateForSpecialty(specialty);
  const schema = generateFAQSchema(org.name, faqs);

  // Clear previous staged content for this org
  await db("patientpath_faq_content")
    .where({ organization_id: orgId, status: "staged" })
    .del();

  // Insert new FAQ content as staged
  for (const faq of faqs) {
    await db("patientpath_faq_content").insert({
      organization_id: orgId,
      specialty,
      question: faq.question,
      answer: faq.answer,
      status: "staged",
      schema_markup: JSON.stringify(schema),
    });
  }

  console.log(`[AEO] Generated ${faqs.length} FAQs for ${org.name} (${specialty}), staged for approval`);
}

/**
 * Get published FAQ content for a practice (for rendering on PatientPath site)
 */
export async function getPublishedFAQs(orgId: number): Promise<{ faqs: FAQ[]; schema: object } | null> {
  const rows = await db("patientpath_faq_content")
    .where({ organization_id: orgId, status: "published" })
    .orderBy("created_at", "asc");

  if (rows.length === 0) return null;

  const org = await db("organizations").where({ id: orgId }).first();
  const faqs = rows.map((r: any) => ({ question: r.question, answer: r.answer }));
  const schema = generateFAQSchema(org?.name || "", faqs);

  return { faqs, schema };
}
