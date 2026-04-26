import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Save,
  Sparkles,
  Loader2,
  AlertTriangle,
  Trash2,
  Link2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  fetchVendorForms,
  fetchDetectedFormFieldShape,
  inferMapping,
  createMapping,
  updateMapping,
  deleteMapping,
  type VendorForm,
  type FieldShapeEntry,
  type IntegrationFormMapping,
} from "../../../api/integrations";
import { useConfirm } from "../../ui/ConfirmModal";

interface Props {
  projectId: string;
  integrationId: string;
  websiteFormName: string;
  existingMapping: IntegrationFormMapping | null;
  onSaved: (mapping: IntegrationFormMapping | null) => void;
}

const UNMAPPED = "";

/**
 * Truncate a sample value for the table preview.
 */
function truncate(value: string | null, max = 40): string {
  if (!value) return "—";
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + "…";
}

export default function FieldMappingDropdown({
  projectId,
  integrationId,
  websiteFormName,
  existingMapping,
  onSaved,
}: Props) {
  const confirm = useConfirm();

  const [vendorForms, setVendorForms] = useState<VendorForm[]>([]);
  const [websiteFields, setWebsiteFields] = useState<FieldShapeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [vendorFormId, setVendorFormId] = useState<string>(
    existingMapping?.vendor_form_id || "",
  );
  // Mapping is { websiteFieldKey: vendorFieldName }
  const [mapping, setMapping] = useState<Record<string, string>>(
    existingMapping?.field_mapping || {},
  );

  const [saving, setSaving] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load vendor forms + website field shape on mount / form change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchVendorForms(projectId, integrationId),
      fetchDetectedFormFieldShape(projectId, websiteFormName),
    ])
      .then(([vendorRes, shapeRes]) => {
        if (cancelled) return;
        setVendorForms(vendorRes.data || []);
        setWebsiteFields(shapeRes.data || []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load mapping data";
        setError(msg);
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, integrationId, websiteFormName]);

  // Reset selected vendor form when switching to a different existing mapping
  useEffect(() => {
    setVendorFormId(existingMapping?.vendor_form_id || "");
    setMapping(existingMapping?.field_mapping || {});
  }, [existingMapping?.id]);

  const selectedVendorForm = useMemo(
    () => vendorForms.find((f) => f.id === vendorFormId) || null,
    [vendorForms, vendorFormId],
  );

  const requiredVendorFieldNames = useMemo(() => {
    if (!selectedVendorForm) return new Set<string>();
    return new Set(
      selectedVendorForm.fields.filter((f) => f.required).map((f) => f.name),
    );
  }, [selectedVendorForm]);

  const mappedVendorFieldNames = useMemo(
    () => new Set(Object.values(mapping).filter(Boolean)),
    [mapping],
  );

  const unmappedRequired = useMemo(() => {
    if (!selectedVendorForm) return [] as string[];
    return selectedVendorForm.fields
      .filter((f) => f.required && !mappedVendorFieldNames.has(f.name))
      .map((f) => f.label || f.name);
  }, [selectedVendorForm, mappedVendorFieldNames]);

  const handleVendorFormChange = (newId: string) => {
    setVendorFormId(newId);
    // Drop mappings whose vendor field doesn't exist on the new form.
    const newForm = vendorForms.find((f) => f.id === newId);
    if (!newForm) {
      setMapping({});
      return;
    }
    const validVendorFieldNames = new Set(newForm.fields.map((f) => f.name));
    setMapping((prev) => {
      const next: Record<string, string> = {};
      for (const [websiteKey, vendorName] of Object.entries(prev)) {
        if (vendorName && validVendorFieldNames.has(vendorName)) {
          next[websiteKey] = vendorName;
        }
      }
      return next;
    });
  };

  const handleMappingChange = (websiteKey: string, vendorName: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (vendorName === UNMAPPED) {
        delete next[websiteKey];
      } else {
        next[websiteKey] = vendorName;
      }
      return next;
    });
  };

  const handleAutoFill = useCallback(async () => {
    if (!vendorFormId) {
      toast.error("Pick a HubSpot form first");
      return;
    }
    setInferring(true);
    try {
      const res = await inferMapping(projectId, integrationId, {
        website_form_name: websiteFormName,
        vendor_form_id: vendorFormId,
      });
      const suggestions = res.data.inferred_mapping || {};
      // Merge: only fill keys that are currently empty.
      setMapping((prev) => {
        const next = { ...prev };
        for (const [websiteKey, vendorName] of Object.entries(suggestions)) {
          if (!next[websiteKey] && vendorName) {
            next[websiteKey] = vendorName;
          }
        }
        return next;
      });
      const filled = Object.keys(suggestions).length;
      toast.success(
        filled > 0
          ? `Auto-filled ${filled} field${filled !== 1 ? "s" : ""}`
          : "No defaults found for this form",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to infer mapping",
      );
    } finally {
      setInferring(false);
    }
  }, [projectId, integrationId, websiteFormName, vendorFormId]);

  const handleSave = useCallback(async () => {
    if (!vendorFormId) {
      toast.error("Pick a HubSpot form first");
      return;
    }
    if (unmappedRequired.length > 0) {
      const ok = await confirm({
        title: "Required HubSpot fields are unmapped",
        message: `These required fields have no website source: ${unmappedRequired.join(", ")}. Submissions to HubSpot will likely fail. Save anyway?`,
        confirmLabel: "Save anyway",
        variant: "danger",
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      const vendorFormName = selectedVendorForm?.name || null;
      let res;
      if (existingMapping) {
        res = await updateMapping(
          projectId,
          integrationId,
          existingMapping.id,
          {
            vendor_form_id: vendorFormId,
            vendor_form_name: vendorFormName,
            field_mapping: mapping,
          },
        );
      } else {
        res = await createMapping(projectId, integrationId, {
          website_form_name: websiteFormName,
          vendor_form_id: vendorFormId,
          vendor_form_name: vendorFormName,
          field_mapping: mapping,
        });
      }
      toast.success("Mapping saved");
      onSaved(res.data);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save mapping",
      );
    } finally {
      setSaving(false);
    }
  }, [
    vendorFormId,
    unmappedRequired,
    confirm,
    existingMapping,
    projectId,
    integrationId,
    selectedVendorForm,
    websiteFormName,
    mapping,
    onSaved,
  ]);

  const handleDelete = useCallback(async () => {
    if (!existingMapping) return;
    const ok = await confirm({
      title: "Delete mapping?",
      message:
        "Future submissions to this form will not be pushed to HubSpot until you map it again.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteMapping(projectId, integrationId, existingMapping.id);
      toast.success("Mapping deleted");
      onSaved(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete mapping",
      );
    } finally {
      setDeleting(false);
    }
  }, [existingMapping, confirm, projectId, integrationId, onSaved]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.1 }}
      className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link2 className="w-4 h-4 text-alloro-orange flex-shrink-0" />
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-gray-900 truncate">
              Field Mapping
            </h4>
            <p className="text-[11px] text-gray-400 truncate">
              Website form: <span className="font-mono">{websiteFormName}</span>
            </p>
          </div>
        </div>
        {existingMapping && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 transition disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            Delete mapping
          </button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading vendor forms and website fields…
        </div>
      ) : error ? (
        <div className="p-6 text-center text-red-600 text-sm">{error}</div>
      ) : (
        <div className="p-5 space-y-4">
          {/* Vendor form selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              HubSpot form <span className="text-red-500">*</span>
            </label>
            <select
              value={vendorFormId}
              onChange={(e) => handleVendorFormChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange"
            >
              <option value="">Choose a HubSpot form…</option>
              {vendorForms.map((vf) => (
                <option key={vf.id} value={vf.id}>
                  {vf.name}
                </option>
              ))}
            </select>
            {vendorForms.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                No HubSpot forms found. Create a form in HubSpot first.
              </p>
            )}
          </div>

          {/* Field mapping table */}
          {selectedVendorForm && websiteFields.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Field mapping
                </label>
                <button
                  type="button"
                  onClick={handleAutoFill}
                  disabled={inferring || !vendorFormId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-orange-200 bg-orange-50 text-alloro-orange hover:bg-orange-100 transition disabled:opacity-50"
                >
                  {inferring ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  Auto-fill defaults
                </button>
              </div>

              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-[34%]">
                        Website field
                      </th>
                      <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-[33%]">
                        Sample
                      </th>
                      <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 w-[33%]">
                        HubSpot field
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {websiteFields.map((field) => {
                      const currentVendor = mapping[field.key] || UNMAPPED;
                      return (
                        <tr key={field.key} className="hover:bg-gray-50/50">
                          <td className="px-3 py-2 align-top">
                            <span className="font-mono text-xs text-gray-900">
                              {field.key}
                            </span>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {field.occurrence_count} occurrence{field.occurrence_count !== 1 ? "s" : ""}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top text-xs text-gray-500">
                            <span className="font-mono">
                              {truncate(field.sample_value)}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <select
                              value={currentVendor}
                              onChange={(e) =>
                                handleMappingChange(field.key, e.target.value)
                              }
                              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-alloro-orange/30 focus:border-alloro-orange"
                            >
                              <option value={UNMAPPED}>— Unmapped —</option>
                              {selectedVendorForm.fields.map((vf) => (
                                <option key={vf.name} value={vf.name}>
                                  {vf.label || vf.name}
                                  {vf.required ? " *" : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-gray-400 mt-2">
                <span className="text-red-500">*</span> Required by HubSpot.
                Unmapped website fields are silently dropped.
              </p>
            </div>
          )}

          {selectedVendorForm && websiteFields.length === 0 && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-500">
              No field samples available for this form yet. Submit the form at
              least once to detect its field shape.
            </div>
          )}

          {/* Required-fields warning */}
          {unmappedRequired.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">
                  Required HubSpot fields without a source:
                </span>{" "}
                {unmappedRequired.join(", ")}. Submissions will fail unless these
                are mapped.
              </div>
            </div>
          )}

          {/* Save row */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !vendorFormId}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-alloro-orange text-white text-sm font-semibold rounded-xl hover:bg-alloro-orange/90 shadow-lg shadow-alloro-orange/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {existingMapping ? "Update mapping" : "Save mapping"}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
