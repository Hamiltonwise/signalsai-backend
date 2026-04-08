/**
 * Email Body Builder
 *
 * Builds the HTML email body for form submission notifications.
 * Used by both the inbound submit flow and the manual resend endpoint.
 */

import type { FormContents, FormSection, FileValue } from "../../../models/website-builder/FormSubmissionModel";

export function buildEmailBody(formName: string, contents: FormContents): string {
  const emailTableHtml = Array.isArray(contents)
    ? buildSectionsHtml(contents as FormSection[])
    : buildFlatHtml(contents as Record<string, string | FileValue>);

  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:#0e8988;color:#fff;padding:24px 32px;border-radius:16px 16px 0 0;">
        <h1 style="margin:0;font-size:22px;">New Entry From ${formName}</h1>
      </div>
      <div style="background:#f9fafb;padding:24px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;">
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          ${emailTableHtml}
        </table>
      </div>
      <p style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center;">Sent via ${formName} form</p>
    </div>`;
}

function buildSectionsHtml(sections: FormSection[]): string {
  return sections
    .map((section) => {
      const sectionHeader = `<tr><td colspan="2" style="padding:16px 0 8px 0;font-size:16px;font-weight:700;color:#007693;border-bottom:1px solid #e5e7eb;">${section.title}</td></tr>`;
      const fieldRows = section.fields
        .filter(([, value]) => typeof value === "string")
        .map(
          ([label, value]) =>
            `<tr>
              <td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap;width:40%;">${label}</td>
              <td style="padding:6px 0;color:#111827;font-weight:600;">${value}</td>
            </tr>`,
        )
        .join("");
      const fileFieldRows = section.fields
        .filter(([, value]) => typeof value === "object" && value !== null)
        .map(([, value]) => {
          const fv = value as FileValue;
          return `<tr>
            <td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">Attached File</td>
            <td style="padding:6px 0;color:#111827;font-weight:600;">${fv.name}</td>
          </tr>`;
        })
        .join("");
      return sectionHeader + fieldRows + fileFieldRows;
    })
    .join("");
}

function buildFlatHtml(contents: Record<string, string | FileValue>): string {
  const rows = Object.entries(contents)
    .filter(([, value]) => typeof value === "string")
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:8px 12px 8px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">${label}</td>
          <td style="padding:8px 0;color:#111827;font-weight:600;">${value}</td>
        </tr>`,
    )
    .join("");
  const fileRows = Object.entries(contents)
    .filter(([, value]) => typeof value === "object" && value !== null)
    .map(([, value]) => {
      const fv = value as FileValue;
      return `<tr>
        <td style="padding:8px 12px 8px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">Attached File</td>
        <td style="padding:8px 0;color:#111827;font-weight:600;">${fv.name}</td>
      </tr>`;
    })
    .join("");
  return rows + fileRows;
}
