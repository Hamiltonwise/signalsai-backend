/**
 * Inline Edit Overlay — The Apple Standard
 *
 * Enables direct click-to-edit on text and click-to-replace on images
 * inside the PatientPath site iframe. No modals. No sidebar forms.
 * Click the text. Edit the text. Save.
 *
 * Layered on top of the existing iframe preview.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Save,
  Undo2,
  Smartphone,
  Monitor,
  Plus,
  X,
  Image as ImageIcon,
  Type,
  Eye,
  EyeOff,
  Pencil,
  Check,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

export interface EditChange {
  selector: string; // CSS selector or data attribute to identify the element
  type: "text" | "image" | "visibility" | "doctor_add" | "doctor_remove" | "certification";
  oldValue: string;
  newValue: string;
}

interface Doctor {
  id: string;
  name: string;
  credentials: string;
  photoUrl: string;
}

// ─── Certification Library ──────────────────────────────────────────

const CERTIFICATIONS = [
  { id: "ada", name: "ADA Member", abbr: "ADA" },
  { id: "aae", name: "American Association of Endodontists", abbr: "AAE" },
  { id: "abo", name: "American Board of Orthodontics", abbr: "ABO" },
  { id: "abp", name: "American Board of Periodontology", abbr: "ABP" },
  { id: "aboms", name: "American Board of Oral & Maxillofacial Surgery", abbr: "ABOMS" },
  { id: "aapd", name: "American Academy of Pediatric Dentistry", abbr: "AAPD" },
  { id: "agd", name: "Academy of General Dentistry", abbr: "AGD" },
  { id: "icoi", name: "International Congress of Oral Implantologists", abbr: "ICOI" },
];

// ─── Edit Mode Toolbar ──────────────────────────────────────────────

interface ToolbarProps {
  isEditing: boolean;
  hasChanges: boolean;
  isMobile: boolean;
  onToggleEdit: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onToggleMobile: () => void;
  saving: boolean;
}

export function EditToolbar({
  isEditing,
  hasChanges,
  isMobile,
  onToggleEdit,
  onSave,
  onDiscard,
  onToggleMobile,
  saving,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      {/* Mobile/Desktop toggle */}
      <button
        onClick={onToggleMobile}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:border-gray-300 transition-colors"
        title={isMobile ? "Switch to desktop view" : "Switch to mobile view"}
      >
        {isMobile ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
        {isMobile ? "Desktop" : "Mobile"}
      </button>

      {/* Edit toggle */}
      <button
        onClick={onToggleEdit}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
          isEditing
            ? "bg-[#D56753] text-white"
            : "border border-gray-200 text-gray-600 hover:border-[#D56753] hover:text-[#D56753]"
        }`}
      >
        <Pencil className="h-3.5 w-3.5" />
        {isEditing ? "Editing" : "Edit Site"}
      </button>

      {/* Save + Discard (only when editing with changes) */}
      {isEditing && (
        <>
          <button
            onClick={onDiscard}
            disabled={!hasChanges || saving}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:border-gray-300 disabled:opacity-40 transition-colors"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Discard
          </button>
          <button
            onClick={onSave}
            disabled={!hasChanges || saving}
            className="relative flex items-center gap-1.5 rounded-lg bg-[#212D40] px-4 py-2 text-xs font-semibold text-white hover:bg-[#212D40]/90 disabled:opacity-40 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save changes"}
            {hasChanges && !saving && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#D56753] rounded-full" />
            )}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Doctor Management Panel ────────────────────────────────────────

interface DoctorPanelProps {
  doctors: Doctor[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onEditName: (id: string, name: string) => void;
  onEditCredentials: (id: string, creds: string) => void;
  onEditPhoto: (id: string) => void;
}

export function DoctorPanel({
  doctors,
  onAdd,
  onRemove,
  onEditName,
  onEditCredentials,
  onEditPhoto,
}: DoctorPanelProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-[#212D40]">Doctors</h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-xs font-semibold text-[#D56753] hover:text-[#D56753]/80"
        >
          <Plus className="h-3.5 w-3.5" />
          Add doctor
        </button>
      </div>
      <div className="space-y-3">
        {doctors.map((doc) => (
          <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
            <button
              onClick={() => onEditPhoto(doc.id)}
              className="shrink-0 w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden group relative"
              title="Click to change photo"
            >
              {doc.photoUrl ? (
                <img src={doc.photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="h-5 w-5 text-gray-400" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <ImageIcon className="h-4 w-4 text-white" />
              </div>
            </button>
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={doc.name}
                onChange={(e) => onEditName(doc.id, e.target.value)}
                placeholder="Doctor name"
                className="w-full text-sm font-semibold text-[#212D40] bg-transparent border-none p-0 focus:outline-none focus:ring-0 placeholder:text-gray-300"
              />
              <input
                type="text"
                value={doc.credentials}
                onChange={(e) => onEditCredentials(doc.id, e.target.value)}
                placeholder="DDS, MS — Credentials"
                className="w-full text-xs text-gray-500 bg-transparent border-none p-0 focus:outline-none focus:ring-0 placeholder:text-gray-300 mt-0.5"
              />
            </div>
            <button
              onClick={() => onRemove(doc.id)}
              className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 transition-colors"
              title="Remove doctor"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {doctors.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">
            No doctors added. Click "Add doctor" to get started.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Certification Library Panel ────────────────────────────────────

interface CertPanelProps {
  activeCerts: string[];
  onToggle: (certId: string) => void;
}

export function CertificationPanel({ activeCerts, onToggle }: CertPanelProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-bold text-[#212D40] mb-3">Certifications</h3>
      <p className="text-xs text-gray-500 mb-4">
        Click to add or remove certification logos from your site.
      </p>
      <div className="flex flex-wrap gap-2">
        {CERTIFICATIONS.map((cert) => {
          const isActive = activeCerts.includes(cert.id);
          return (
            <button
              key={cert.id}
              onClick={() => onToggle(cert.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                isActive
                  ? "bg-[#212D40] text-white"
                  : "border border-gray-200 text-gray-600 hover:border-[#212D40]"
              }`}
              title={cert.name}
            >
              {isActive && <Check className="h-3 w-3" />}
              {cert.abbr}
              {isActive && (
                <X className="h-3 w-3 ml-0.5 opacity-60 hover:opacity-100" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section Visibility Toggle ──────────────────────────────────────

interface SectionToggleProps {
  sections: { id: string; name: string; visible: boolean }[];
  onToggle: (id: string) => void;
}

export function SectionVisibilityPanel({ sections, onToggle }: SectionToggleProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-bold text-[#212D40] mb-3">Sections</h3>
      <p className="text-xs text-gray-500 mb-4">
        Show or hide sections on your site.
      </p>
      <div className="space-y-2">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => onToggle(section.id)}
            className="flex items-center justify-between w-full rounded-lg px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors"
          >
            <span className={section.visible ? "text-[#212D40] font-medium" : "text-gray-400"}>
              {section.name}
            </span>
            {section.visible ? (
              <Eye className="h-4 w-4 text-emerald-500" />
            ) : (
              <EyeOff className="h-4 w-4 text-gray-300" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Iframe Inline Edit Enabler ─────────────────────────────────────

/**
 * Injects inline editing behavior into an iframe's document.
 * - Text elements become contenteditable on click
 * - Images open a file picker on click
 * - Pencil cursor on hover for editable elements
 *
 * Returns a cleanup function.
 */
export function enableInlineEditing(
  iframeDoc: Document,
  onTextChange: (selector: string, oldText: string, newText: string) => void,
  onImageClick: (selector: string, currentSrc: string) => void,
): () => void {
  const style = iframeDoc.createElement("style");
  style.textContent = `
    [data-alloro-editable]:hover {
      outline: 2px solid rgba(213, 103, 83, 0.3) !important;
      outline-offset: 2px !important;
      cursor: text !important;
      border-radius: 4px;
    }
    [data-alloro-editable]:focus {
      outline: 2px solid #D56753 !important;
      outline-offset: 2px !important;
      border-radius: 4px;
    }
    [data-alloro-editable-img]:hover {
      outline: 2px solid rgba(213, 103, 83, 0.3) !important;
      outline-offset: 2px !important;
      cursor: pointer !important;
      border-radius: 4px;
    }
    [data-alloro-editable-img]::after {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(213, 103, 83, 0.1);
      opacity: 0;
      transition: opacity 0.15s;
      pointer-events: none;
    }
    [data-alloro-editable-img]:hover::after {
      opacity: 1;
    }
  `;
  iframeDoc.head.appendChild(style);

  // Mark all text elements as editable
  const textElements = iframeDoc.querySelectorAll("h1, h2, h3, h4, h5, h6, p, span, a, li, blockquote, figcaption, button");
  let selectorCounter = 0;

  textElements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    // Skip if inside nav, script, style, or already marked
    if (htmlEl.closest("nav, script, style, noscript") || htmlEl.dataset.alloroEditable) return;
    // Skip empty elements
    if (!htmlEl.textContent?.trim()) return;

    const selector = `alloro-edit-${selectorCounter++}`;
    htmlEl.dataset.alloroEditable = selector;
    htmlEl.setAttribute("contenteditable", "true");
    htmlEl.setAttribute("spellcheck", "true");

    // Store original text for change detection
    htmlEl.dataset.alloroOriginal = htmlEl.textContent?.trim() || "";
  });

  // Mark all images as replaceable
  const imgElements = iframeDoc.querySelectorAll("img");
  imgElements.forEach((img) => {
    const htmlImg = img as HTMLImageElement;
    if (htmlImg.closest("nav, script") || htmlImg.dataset.alloroEditableImg) return;

    const selector = `alloro-img-${selectorCounter++}`;
    htmlImg.dataset.alloroEditableImg = selector;
    htmlImg.style.position = "relative";
  });

  // Listen for blur events on editable text (change committed)
  const handleBlur = (e: Event) => {
    const target = e.target as HTMLElement;
    if (!target.dataset?.alloroEditable) return;

    const original = target.dataset.alloroOriginal || "";
    const current = target.textContent?.trim() || "";

    if (current !== original) {
      onTextChange(target.dataset.alloroEditable, original, current);
      target.dataset.alloroOriginal = current;
    }
  };

  // Listen for clicks on images
  const handleClick = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG" && (target as HTMLImageElement).dataset?.alloroEditableImg) {
      e.preventDefault();
      e.stopPropagation();
      onImageClick(
        (target as HTMLImageElement).dataset.alloroEditableImg!,
        (target as HTMLImageElement).src,
      );
    }
  };

  iframeDoc.body.addEventListener("focusout", handleBlur, true);
  iframeDoc.body.addEventListener("click", handleClick, true);

  // Cleanup
  return () => {
    iframeDoc.body.removeEventListener("focusout", handleBlur, true);
    iframeDoc.body.removeEventListener("click", handleClick, true);
    style.remove();

    textElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.removeAttribute("contenteditable");
      htmlEl.removeAttribute("spellcheck");
      delete htmlEl.dataset.alloroEditable;
      delete htmlEl.dataset.alloroOriginal;
    });

    imgElements.forEach((img) => {
      delete (img as HTMLImageElement).dataset.alloroEditableImg;
    });
  };
}

// ─── Exports ────────────────────────────────────────────────────────

export { CERTIFICATIONS };
