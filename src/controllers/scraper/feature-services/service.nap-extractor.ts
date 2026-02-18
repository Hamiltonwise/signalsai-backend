/**
 * NAP (Name, Address, Phone) extraction service for the scraper module.
 *
 * Extracts business contact information from a web page using multiple
 * strategies: Schema.org structured data, meta tags, semantic HTML,
 * and regex pattern matching.
 *
 * All extraction runs inside the browser context via page.evaluate().
 */

import { Page } from "puppeteer";
import { NAPDetails } from "../feature-utils/scraper.types";
import { log } from "../feature-utils/util.scraper-logger";

/**
 * Extract NAP (Name, Address, Phone) details from a Puppeteer page.
 *
 * Extraction strategies by field:
 *
 * **Business Name** (priority order):
 *   1. Schema.org LocalBusiness / Organization / MedicalBusiness / Dentist / Physician
 *   2. OG `site_name` meta tag
 *   3. First <h1> (if < 100 chars)
 *   4. Title tag (cleaned — splits on |, -, etc.)
 *
 * **Phone Numbers** (max 5):
 *   - Regex: US formats + international +prefix
 *   - tel: links
 *   - Deduplicated, length validated (10-15 digits)
 *
 * **Addresses** (max 3):
 *   - Regex: US street addresses with ZIP
 *   - Semantic selectors: [class*="address"], [itemtype*="PostalAddress"], <address>
 *   - Length/format validated
 *
 * **Emails** (max 3):
 *   - mailto: links (most reliable)
 *   - Body text regex
 *   - Filters false positives (example.com, yourdomain, .png, .jpg)
 */
export async function extractNAPDetails(page: Page): Promise<NAPDetails> {
  const napData = await page.evaluate(() => {
    const result: {
      businessName: string | null;
      addresses: string[];
      phoneNumbers: string[];
      emails: string[];
    } = {
      businessName: null,
      addresses: [],
      phoneNumbers: [],
      emails: [],
    };

    // ============ BUSINESS NAME DETECTION ============
    // Priority: Schema.org > OG title > h1 > title tag

    // Try Schema.org LocalBusiness or Organization
    const schemaScripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    );
    schemaScripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent || "");
        const schemas = Array.isArray(data) ? data : [data];
        for (const schema of schemas) {
          if (
            schema["@type"] &&
            (schema["@type"].includes("LocalBusiness") ||
              schema["@type"].includes("Organization") ||
              schema["@type"] === "LocalBusiness" ||
              schema["@type"] === "Organization" ||
              schema["@type"] === "MedicalBusiness" ||
              schema["@type"] === "Dentist" ||
              schema["@type"] === "Physician")
          ) {
            if (schema.name && !result.businessName) {
              result.businessName = schema.name;
            }
            if (schema.address) {
              const addr = schema.address;
              if (typeof addr === "string") {
                result.addresses.push(addr);
              } else if (addr.streetAddress) {
                const parts = [
                  addr.streetAddress,
                  addr.addressLocality,
                  addr.addressRegion,
                  addr.postalCode,
                  addr.addressCountry,
                ].filter(Boolean);
                result.addresses.push(parts.join(", "));
              }
            }
            if (schema.telephone) {
              result.phoneNumbers.push(schema.telephone);
            }
            if (schema.email) {
              result.emails.push(schema.email);
            }
          }
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    });

    // Fallback to OG site_name
    if (!result.businessName) {
      const ogSiteName = document.querySelector(
        'meta[property="og:site_name"]'
      );
      if (ogSiteName) {
        result.businessName = ogSiteName.getAttribute("content");
      }
    }

    // Fallback to first h1
    if (!result.businessName) {
      const h1 = document.querySelector("h1");
      if (h1 && h1.textContent) {
        const text = h1.textContent.trim();
        if (text.length < 100) {
          result.businessName = text;
        }
      }
    }

    // Final fallback to title tag (cleaned)
    if (!result.businessName) {
      const title = document.title;
      if (title) {
        result.businessName = title.split(/[|\-\u2013\u2014]/)[0].trim();
      }
    }

    // ============ PHONE NUMBER DETECTION ============
    const bodyText = document.body.innerText || "";

    const phonePatterns = [
      /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
    ];

    const phoneSet = new Set<string>(result.phoneNumbers);
    phonePatterns.forEach((pattern) => {
      const matches = bodyText.match(pattern);
      if (matches) {
        matches.forEach((phone) => {
          const cleaned = phone.replace(/[^\d+]/g, "");
          if (cleaned.length >= 10 && cleaned.length <= 15) {
            phoneSet.add(phone.trim());
          }
        });
      }
    });

    const telLinks = document.querySelectorAll('a[href^="tel:"]');
    telLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (href) {
        const phone = href.replace("tel:", "").trim();
        if (phone.length >= 10) {
          phoneSet.add(phone);
        }
      }
    });

    result.phoneNumbers = [...phoneSet].slice(0, 5);

    // ============ ADDRESS DETECTION ============
    const addressPatterns = [
      /\d{1,5}\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Highway|Hwy)\.?(?:\s*,?\s*(?:Suite|Ste|Apt|Unit|#)\s*[\w\d-]+)?(?:\s*,?\s*[\w\s]+)?(?:\s*,?\s*[A-Z]{2})?\s*\d{5}(?:-\d{4})?/gi,
    ];

    const addressSet = new Set<string>(result.addresses);

    const addressSelectors = [
      '[class*="address"]',
      '[class*="location"]',
      '[class*="contact"]',
      '[itemtype*="PostalAddress"]',
      "address",
      "[data-address]",
    ];

    addressSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 10 && text.length < 200) {
          if (
            /\d/.test(text) &&
            /street|st\.|avenue|ave\.|road|rd\.|blvd|drive|dr\.|suite|ste|city|state|\d{5}/i.test(
              text
            )
          ) {
            addressSet.add(text.replace(/\s+/g, " ").trim());
          }
        }
      });
    });

    addressPatterns.forEach((pattern) => {
      const matches = bodyText.match(pattern);
      if (matches) {
        matches.forEach((addr) => {
          addressSet.add(addr.replace(/\s+/g, " ").trim());
        });
      }
    });

    result.addresses = [...addressSet].slice(0, 3);

    // ============ EMAIL DETECTION ============
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailSet = new Set<string>(result.emails);

    const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
    mailtoLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (href) {
        const email = href.replace("mailto:", "").split("?")[0].trim();
        if (email.includes("@")) {
          emailSet.add(email.toLowerCase());
        }
      }
    });

    const emailMatches = bodyText.match(emailPattern);
    if (emailMatches) {
      emailMatches.forEach((email) => {
        if (
          !email.includes("example.com") &&
          !email.includes("yourdomain") &&
          !email.endsWith(".png") &&
          !email.endsWith(".jpg")
        ) {
          emailSet.add(email.toLowerCase());
        }
      });
    }

    result.emails = [...emailSet].slice(0, 3);

    return result;
  });

  log("INFO", "NAP extraction completed", {
    hasBusinessName: !!napData.businessName,
    addressCount: napData.addresses.length,
    phoneCount: napData.phoneNumbers.length,
    emailCount: napData.emails.length,
  });

  return napData;
}
