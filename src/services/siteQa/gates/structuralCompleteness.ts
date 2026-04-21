import type { GateResult, SiteQaContext, Defect, Section } from "../types";
import { stripHtml } from "../util";

function hasText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return stripHtml(value).length > 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function looksLike(type: string | undefined, needles: string[]): boolean {
  if (!type) return false;
  const lower = type.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

function findCards(section: Section, needles: string[]): Section[] {
  const results: Section[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const type = typeof obj.type === "string" ? obj.type : undefined;
    if (looksLike(type, needles)) {
      results.push(obj as Section);
    }
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === "object") {
        walk(value);
      }
    }
  };
  walk(section);
  return results;
}

export function runStructuralCompletenessGate(ctx: SiteQaContext): GateResult {
  const defects: Defect[] = [];

  ctx.sections.forEach((section, sectionIndex) => {
    const type = section.type;

    // Service cards
    if (looksLike(type, ["service"])) {
      const cards = extractCards(section, ["service", "card", "item"]);
      cards.forEach((card, cardIdx) => {
        const description = readField(card, ["description", "body", "summary", "subtitle", "content"]);
        if (!hasText(description)) {
          defects.push({
            gate: "structuralCompleteness",
            severity: "blocker",
            message: `Service card #${cardIdx + 1} is missing a description`,
            evidence: {
              text: readField(card, ["title", "heading", "name"]) || "(no title)",
              sectionIndex,
              sectionType: type,
              field: `card[${cardIdx}].description`,
              pagePath: ctx.pagePath,
            },
          });
        }
      });
    }

    // Doctor cards
    if (looksLike(type, ["doctor", "team", "provider", "staff"])) {
      const cards = extractCards(section, ["doctor", "team", "provider", "staff", "card", "member"]);
      cards.forEach((card, cardIdx) => {
        const photo = readField(card, ["photo", "image", "imageUrl", "image_url", "src", "avatar"]);
        if (!hasText(photo)) {
          defects.push({
            gate: "structuralCompleteness",
            severity: "blocker",
            message: `Doctor card #${cardIdx + 1} is missing a photo`,
            evidence: {
              text: readField(card, ["name", "title"]) || "(no name)",
              sectionIndex,
              sectionType: type,
              field: `card[${cardIdx}].photo`,
              pagePath: ctx.pagePath,
            },
          });
        }
      });
    }

    // Location cards
    if (looksLike(type, ["location", "office", "address"])) {
      const cards = extractCards(section, ["location", "office", "address", "card"]);
      cards.forEach((card, cardIdx) => {
        const hours = readField(card, ["hours", "hoursOfOperation", "hours_of_operation", "schedule"]);
        if (!hasText(hours)) {
          defects.push({
            gate: "structuralCompleteness",
            severity: "blocker",
            message: `Location card #${cardIdx + 1} is missing hours`,
            evidence: {
              text: readField(card, ["name", "address", "title"]) || "(no name)",
              sectionIndex,
              sectionType: type,
              field: `card[${cardIdx}].hours`,
              pagePath: ctx.pagePath,
            },
          });
        }
      });
    }
  });

  return {
    gate: "structuralCompleteness",
    passed: defects.length === 0,
    defects,
  };
}

function extractCards(section: Section, needles: string[]): Section[] {
  const candidates: unknown[] = [
    section.cards,
    section.items,
    section.services,
    section.doctors,
    section.team,
    section.locations,
  ];
  const data = (section.data ?? {}) as Record<string, unknown>;
  candidates.push(
    data.cards,
    data.items,
    data.services,
    data.doctors,
    data.team,
    data.locations
  );

  for (const candidate of candidates) {
    const arr = asArray(candidate);
    if (arr.length > 0) return arr as Section[];
  }

  // Last-resort structural fallback: look for any nested node whose `type`
  // matches one of the card needles. Exclude the section root itself so we
  // don't count a services-container as a card with no description.
  const found = findCards(section, needles).filter((node) => node !== section);
  return found;
}

function readField(obj: Section, keys: string[]): string {
  for (const key of keys) {
    const val = (obj as Record<string, unknown>)[key];
    if (typeof val === "string" && val.trim().length > 0) return val;
    const data = (obj as Record<string, unknown>).data as Record<string, unknown> | undefined;
    if (data && typeof data[key] === "string" && (data[key] as string).trim().length > 0) {
      return data[key] as string;
    }
  }
  return "";
}
