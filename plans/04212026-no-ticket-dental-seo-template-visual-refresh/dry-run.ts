/* eslint-disable @typescript-eslint/no-var-requires */
import * as fs from "fs";
import * as path from "path";
import {
  transformPageSections,
  transformWrapper,
  transformHeader,
  transformFooter,
} from "../../src/database/migrations/20260421000001_dental_seo_template_visual_refresh";

const snapDir = path.resolve(__dirname, "snapshot");
const outDir = path.resolve(__dirname, "preview");
fs.mkdirSync(outDir, { recursive: true });

type Section = { name: string; content: string };
type Page = { id: string; name: string; sections: unknown };
type Template = { id: string; name: string; wrapper: string; header: string; footer: string };

const template = JSON.parse(fs.readFileSync(path.join(snapDir, "template.json"), "utf8")) as Template;
const pages = JSON.parse(fs.readFileSync(path.join(snapDir, "pages.json"), "utf8")) as Page[];

const newWrapper = transformWrapper(template.wrapper);
const newHeader = transformHeader(template.header);
const newFooter = transformFooter(template.footer);

fs.writeFileSync(path.join(outDir, "template.wrapper.html"), newWrapper);
fs.writeFileSync(path.join(outDir, "template.header.html"), newHeader);
fs.writeFileSync(path.join(outDir, "template.footer.html"), newFooter);

const pageResults: Record<string, Section[]> = {};
for (const p of pages) {
  try {
    const newSections = transformPageSections(p.name, p.sections);
    pageResults[p.name] = newSections;
    const safeName = p.name.replace(/[^A-Za-z0-9]+/g, "-");
    fs.writeFileSync(
      path.join(outDir, `page.${safeName}.json`),
      JSON.stringify(newSections, null, 2)
    );
    console.log(`OK  ${p.name}: ${newSections.length} sections`);
  } catch (e) {
    console.error(`ERR ${p.name}: ${(e as Error).message}`);
  }
}

fs.writeFileSync(path.join(outDir, "pages.all.json"), JSON.stringify(pageResults, null, 2));

// Verification scan
console.log("\n--- VERIFICATION SCAN ---");
const verdict: Record<string, { heroSize: boolean; bgImage: boolean; noOldGradientOnHero: boolean; ctaDirectivesCount: number; inlineStylesRemaining: number }> = {};
const heroSizeMarker = "min-h-[560px] md:min-h-[680px]";
for (const [name, sections] of Object.entries(pageResults)) {
  const hero = sections.find((s) => /hero/i.test(s.name));
  const heroContent = hero?.content ?? "";
  const ctaCount = sections.reduce(
    (acc, s) => acc + (s.content.match(/AI-CONTENT: cta-label/g) ?? []).length,
    0
  );
  const allContent = sections.map((s) => s.content).join("\n");
  const styleCount = (allContent.match(/style="[^"]*"/g) ?? []).length;

  if (name === "Homepage") {
    verdict[name] = {
      heroSize: /min-h-\[600px\]/.test(heroContent),
      bgImage: /background-image:[^"]*url\(/i.test(heroContent),
      noOldGradientOnHero: !/--gradient-bg/.test(heroContent),
      ctaDirectivesCount: ctaCount,
      inlineStylesRemaining: styleCount,
    };
  } else {
    verdict[name] = {
      heroSize: heroContent.includes(heroSizeMarker),
      bgImage: /background-image:[^"]*url\(/i.test(heroContent),
      noOldGradientOnHero: !/--gradient-bg/.test(heroContent),
      ctaDirectivesCount: ctaCount,
      inlineStylesRemaining: styleCount,
    };
  }
}
console.log(JSON.stringify(verdict, null, 2));

// Header + footer verification
const footerHasBgSlate = /<footer\s+class="[^"]*bg-slate-deep/.test(newFooter);
const footerStillPrimaryStrip = /<section\s+class="[^"]*alloro-tpl-v1-release-footer-locations[^"]*bg-primary/.test(newFooter);
const footerMapAll = newFooter.includes("MAP BEHAVIOR (REQUIRED)");
const headerCtaCount = (newHeader.match(/AI-CONTENT: cta-label/g) ?? []).length;
const wrapperHasSlateDeep = /\.bg-slate-deep\s*\{/.test(newWrapper);

console.log("\n--- TEMPLATE-LEVEL ---");
console.log({
  footerHasBgSlateDeep: footerHasBgSlate,
  footerLocationsStripStillPrimary: footerStillPrimaryStrip,
  footerMapAllInstructionPresent: footerMapAll,
  headerCtaDirectivesInjected: headerCtaCount,
  wrapperHasSlateDeepRule: wrapperHasSlateDeep,
});
