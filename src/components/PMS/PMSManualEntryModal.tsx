/**
 * PMSManualEntryModal Component
 *
 * Allows users to manually enter PMS referral data without uploading a CSV file.
 * Opens with the previous month selected and no sources by default.
 * On submit, data goes directly to monthly agents (skipping admin/client approval).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { showUploadToast } from "../../lib/toast";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Calendar,
  ClipboardPaste,
  DollarSign,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Stethoscope,
  Trash2,
  User,
  X,
} from "lucide-react";

import {
  transformUIToBackend,
  calculateTotals,
  formatMoney,
  sanitizeNumber,
  addMonths,
  toYm,
} from "./pmsDataTransform";
import type { MonthBucket, SourceRow } from "./types";
import { submitManualPMSData } from "../../api/pms";
import { usePasteHandler } from "./usePasteHandler";
import { PasteConfirmDialog } from "./PasteConfirmDialog";

interface PMSManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string; // domain
  locationId?: number | null;
  onSuccess?: () => void;
}

const ALORO_ORANGE = "#C9765E";
const ALORO_ORANGE_DARK = "#D66853";

/**
 * Get the previous month in YYYY-MM format
 */
const getPreviousMonth = (): string => {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return toYm(prevMonth.getFullYear(), prevMonth.getMonth() + 1);
};

/**
 * Animated odometer for summary cards
 */
const Odometer = ({ value }: { value: string | number }) => {
  const str = String(value);
  const digitHeight = 48;
  const digitWidth = 22;

  return (
    <div className="flex items-center overflow-visible">
      {str.split("").map((char, i) => {
        if (isNaN(Number(char))) {
          return (
            <div key={i} className="mx-0 text-2xl font-semibold leading-none">
              {char}
            </div>
          );
        }

        return (
          <div
            key={i}
            className="relative overflow-hidden"
            style={{ height: digitHeight, width: digitWidth }}
          >
            <motion.div
              animate={{ y: -Number(char) * digitHeight }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
              className="absolute top-0 left-0"
            >
              {Array.from({ length: 10 }).map((_, n) => (
                <div
                  key={n}
                  style={{ height: digitHeight }}
                  className="flex items-center justify-center text-3xl font-semibold leading-none"
                >
                  {n}
                </div>
              ))}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
};

export const PMSManualEntryModal: React.FC<PMSManualEntryModalProps> = ({
  isOpen,
  onClose,
  clientId,
  locationId,
  onSuccess,
}) => {
  // Initialize with previous month and empty sources
  const [months, setMonths] = useState<MonthBucket[]>(() => [
    {
      id: Date.now(),
      month: getPreviousMonth(),
      rows: [],
    },
  ]);
  const [activeMonthId, setActiveMonthId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  // Month picker state
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerStep, setPickerStep] = useState<"month" | "year">("month");
  const [tempMonth, setTempMonth] = useState<string | null>(null);

  // Confirmation states
  const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<number | null>(
    null
  );
  const [confirmDeleteMonthId, setConfirmDeleteMonthId] = useState<
    number | null
  >(null);

  // Paste handler — AI-powered paste-to-parse
  const handleParsedPaste = useCallback(
    (parsedMonths: MonthBucket[]) => {
      setMonths((prev) => {
        const merged = [...prev];
        for (const incoming of parsedMonths) {
          const existing = merged.find((m) => m.month === incoming.month);
          if (existing) {
            existing.rows = [...existing.rows, ...incoming.rows];
          } else {
            merged.push(incoming);
          }
        }
        return merged;
      });
      showUploadToast(
        "Data parsed!",
        `${parsedMonths.reduce((s, m) => s + m.rows.length, 0)} rows added. Review and submit when ready.`
      );
    },
    []
  );

  const handlePasteWarnings = useCallback((warnings: string[]) => {
    if (warnings.length > 0) {
      console.warn("[PMSManualEntry] Paste warnings:", warnings);
    }
  }, []);

  const activeMonthStr = useMemo(() => {
    const found = months.find((m) => m.id === activeMonthId);
    return found?.month ?? months[0]?.month ?? getPreviousMonth();
  }, [months, activeMonthId]);

  const {
    isPasting,
    phase: pastePhase,
    showConfirm: showPasteConfirm,
    pasteInfo,
    batchProgress,
    confirmPaste,
    cancelPaste,
    handlePasteEvent,
  } = usePasteHandler({
    currentMonth: activeMonthStr,
    onParsed: handleParsedPaste,
    onError: (msg) => setError(msg),
    onWarnings: handlePasteWarnings,
  });

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialMonth = getPreviousMonth();
      const initialId = Date.now();
      setMonths([{ id: initialId, month: initialMonth, rows: [] }]);
      setActiveMonthId(initialId);
      setSubmitStatus("idle");
      setError(null);
    }
  }, [isOpen]);

  const sortedMonths = useMemo(
    () => [...months].sort((a, b) => a.month.localeCompare(b.month)),
    [months]
  );

  const activeMonth = useMemo(() => {
    let found = months.find((m) => m.id === activeMonthId);
    if (!found && sortedMonths[0]) {
      found = sortedMonths[0];
    }
    return found;
  }, [months, activeMonthId, sortedMonths]);

  const rows = activeMonth?.rows ?? [];
  const totals = useMemo(() => calculateTotals(rows), [rows]);

  // Keep active ID valid
  useEffect(() => {
    if (!activeMonth && sortedMonths[0]) {
      setActiveMonthId(sortedMonths[0].id);
    }
  }, [activeMonth, sortedMonths]);

  // Month management
  const updateActiveMonth = useCallback(
    (patch: Partial<MonthBucket>) => {
      if (!activeMonth) return;
      setMonths((prev) =>
        prev.map((m) => (m.id === activeMonth.id ? { ...m, ...patch } : m))
      );
    },
    [activeMonth]
  );

  const addMonthBucket = useCallback(() => {
    const latest =
      sortedMonths[sortedMonths.length - 1]?.month ?? getPreviousMonth();
    let candidate = addMonths(latest, 1);

    // Ensure unique month
    const existing = new Set(months.map((m) => m.month));
    while (existing.has(candidate)) {
      candidate = addMonths(candidate, 1);
    }

    const newId = Date.now();
    setMonths((prev) => [...prev, { id: newId, month: candidate, rows: [] }]);
    setActiveMonthId(newId);
  }, [months, sortedMonths]);

  const deleteMonth = useCallback(
    (id: number) => {
      if (months.length === 1) {
        setError("At least one month is required");
        return;
      }

      const next = months.filter((m) => m.id !== id);
      setMonths(next);
      setConfirmDeleteMonthId(null);

      const nextSorted = [...next].sort((a, b) =>
        a.month.localeCompare(b.month)
      );
      if (nextSorted[0]) {
        setActiveMonthId(nextSorted[0].id);
      }
    },
    [months]
  );

  const requestDeleteMonth = (id: number) => {
    setConfirmDeleteMonthId(id);
    setConfirmDeleteRowId(null);
  };

  // Row management
  const updateMonthRows = useCallback(
    (updater: (rows: SourceRow[]) => SourceRow[]) => {
      if (!activeMonth) return;
      setMonths((prev) =>
        prev.map((m) =>
          m.id === activeMonth.id ? { ...m, rows: updater(m.rows) } : m
        )
      );
    },
    [activeMonth]
  );

  const addRow = useCallback(() => {
    updateMonthRows((r) => [
      ...r,
      {
        id: Date.now(),
        source: "",
        type: "self" as const,
        referrals: "",
        production: "",
      },
    ]);
  }, [updateMonthRows]);

  const updateRow = useCallback(
    (id: number, field: keyof SourceRow, value: string) => {
      updateMonthRows((rows) =>
        rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
      );
    },
    [updateMonthRows]
  );

  const handleTypeToggle = useCallback(
    (rowId: number) => {
      const row = rows.find((r) => r.id === rowId);
      if (row) {
        updateRow(rowId, "type", row.type === "self" ? "doctor" : "self");
      }
    },
    [rows, updateRow]
  );

  const deleteRow = useCallback(
    (rowId: number) => {
      updateMonthRows((rows) => rows.filter((row) => row.id !== rowId));
      setConfirmDeleteRowId(null);
    },
    [updateMonthRows]
  );

  const requestDeleteRow = (rowId: number) => {
    setConfirmDeleteRowId(rowId);
    setConfirmDeleteMonthId(null);
  };

  const incrementField = useCallback(
    (rowId: number, field: "referrals" | "production", delta: number) => {
      updateMonthRows((rows) =>
        rows.map((row) => {
          if (row.id === rowId) {
            const current = Number(row[field]) || 0;
            return { ...row, [field]: String(Math.max(0, current + delta)) };
          }
          return row;
        })
      );
    },
    [updateMonthRows]
  );

  // Month picker handlers
  const openMonthPicker = () => {
    if (!activeMonth) return;
    setShowMonthPicker(true);
    setPickerStep("month");
    setTempMonth(activeMonth.month.split("-")[1]);
  };

  const commitMonthChange = (ym: string) => {
    // Check if month already exists
    const existing = months.find(
      (m) => m.month === ym && m.id !== activeMonth?.id
    );
    if (existing) {
      setError("This month already exists");
      return;
    }
    updateActiveMonth({ month: ym });
    setShowMonthPicker(false);
    setPickerStep("month");
    setTempMonth(null);
  };

  // Submit handler
  const handleSubmit = async () => {
    // Validate that there's at least one source with data
    const allRows = months.flatMap((m) => m.rows);
    const validRows = allRows.filter(
      (r) =>
        r.source.trim() && (Number(r.referrals) > 0 || Number(r.production) > 0)
    );

    if (validRows.length === 0) {
      setError(
        "Please add at least one source with referrals or production data"
      );
      return;
    }

    // Check for empty source names
    const emptySourceRows = allRows.filter(
      (r) =>
        !r.source.trim() &&
        (Number(r.referrals) > 0 || Number(r.production) > 0)
    );
    if (emptySourceRows.length > 0) {
      setError("All sources must have a name");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const backendData = transformUIToBackend(months);
      console.log("[PMSManualEntryModal] Submitting manual data:", backendData);

      const result = await submitManualPMSData({
        domain: clientId,
        monthlyData: backendData,
        locationId,
      });

      if (result.success) {
        setSubmitStatus("success");

        // Show toast notification
        showUploadToast("Data received!", "Processing your insights now...");

        // Dispatch event for other components
        if (typeof window !== "undefined") {
          const event = new CustomEvent("pms:job-uploaded", {
            detail: { clientId, entryType: "manual" },
          });
          window.dispatchEvent(event);
        }

        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 2000);
      } else {
        throw new Error(result.error || "Submission failed");
      }
    } catch (err) {
      console.error("[PMSManualEntryModal] Submit error:", err);
      setSubmitStatus("error");
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 200 }}
          className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl my-auto"
          onClick={(e) => e.stopPropagation()}
          onPaste={handlePasteEvent}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-white">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Enter PMS Data Manually
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Add your referral and production data for {clientId}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-6 bg-gray-50">
            {submitStatus === "success" ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center justify-center py-16"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                  <Save className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Data Submitted Successfully!
                </h3>
                <p className="text-gray-600 text-center max-w-md">
                  We're processing your data now. Your insights and action items
                  will be ready shortly.
                </p>
              </motion.div>
            ) : (
              <div className="space-y-6">
                {/* Month Tabs */}
                <div className="flex items-center gap-2 flex-wrap">
                  {sortedMonths.map((m) => {
                    const isActive = m.id === activeMonthId;
                    return (
                      <div key={m.id} className="relative">
                        <motion.button
                          onClick={() => setActiveMonthId(m.id)}
                          className="px-4 py-2 rounded-full text-xs border pr-9 font-medium"
                          style={{
                            backgroundColor: isActive ? ALORO_ORANGE : "white",
                            color: isActive ? "white" : "#374151",
                            borderColor: isActive ? ALORO_ORANGE : "#e5e7eb",
                          }}
                        >
                          {new Date(m.month + "-01").toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </motion.button>

                        {/* Delete icon per tab */}
                        {months.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              requestDeleteMonth(m.id);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full"
                            style={{
                              backgroundColor: isActive
                                ? "rgba(255,255,255,0.22)"
                                : "rgba(0,0,0,0.04)",
                              color: isActive ? "white" : "#ef4444",
                            }}
                            title="Delete month"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}

                        {/* Confirm delete month tooltip */}
                        <AnimatePresence>
                          {confirmDeleteMonthId === m.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -6 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -6 }}
                              className="absolute left-1/2 -translate-x-1/2 top-12 bg-white border rounded-xl shadow-lg p-3 z-20 w-56"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="text-xs mb-2 text-gray-700">
                                Delete this month?
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => deleteMonth(m.id)}
                                  className="text-xs px-3 py-1 rounded-lg text-white"
                                  style={{ backgroundColor: ALORO_ORANGE_DARK }}
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteMonthId(null)}
                                  className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}

                  {/* Add month button */}
                  <button
                    onClick={addMonthBucket}
                    className="p-2 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
                    title="Add month"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Summary Cards */}
                {activeMonth && (
                  <div className="grid grid-cols-5 gap-4">
                    {/* Month card - clickable */}
                    <motion.div
                      layout
                      className="rounded-2xl border bg-white p-4 flex flex-col justify-center cursor-pointer hover:border-gray-300 transition"
                      onClick={openMonthPicker}
                    >
                      <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400 uppercase mb-2">
                        <Calendar size={14} />
                        Month
                      </div>
                      <div className="text-center text-lg font-semibold text-gray-900">
                        {new Date(activeMonth.month + "-01").toLocaleDateString(
                          undefined,
                          { month: "short", year: "numeric" }
                        )}
                      </div>
                    </motion.div>

                    {[
                      {
                        label: "Self Referrals",
                        value: totals.selfReferrals,
                        icon: User,
                        tint: "#C9765E22",
                      },
                      {
                        label: "Doctor Referrals",
                        value: totals.doctorReferrals,
                        icon: Stethoscope,
                        tint: "#C9765E11",
                      },
                      {
                        label: "Total Referrals",
                        value: totals.totalReferrals,
                        icon: User,
                        tint: "#C9765E18",
                      },
                      {
                        label: "Production",
                        value: totals.productionTotal.toLocaleString(),
                        icon: DollarSign,
                        tint: "#34D39922",
                      },
                    ].map((card, i) => (
                      <motion.div
                        key={i}
                        layout
                        className="rounded-2xl p-4 border flex flex-col justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${card.tint}, #ffffff)`,
                        }}
                      >
                        <div className="text-[10px] text-gray-400 uppercase text-center mb-1">
                          {card.label}
                        </div>
                        <div className="flex items-center justify-center gap-2 scale-75">
                          <card.icon size={20} className="text-gray-400" />
                          <Odometer value={card.value} />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Table Header */}
                <div className="grid grid-cols-13 gap-4 px-2 text-[11px] font-bold text-gray-400 uppercase">
                  <div className="col-span-3">Source</div>
                  <div className="col-span-2">Type</div>
                  <div className="col-span-3">Referral Count</div>
                  <div className="col-span-4">Production</div>
                  <div className="col-span-1" />
                </div>

                {/* Data Rows */}
                <AnimatePresence>
                  {rows.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-8 text-gray-500"
                    >
                      <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">No sources added yet</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Click "Add Source" below, or paste data from your
                        spreadsheet and Alloro will analyze it for you.
                      </p>
                    </motion.div>
                  ) : (
                    rows.map((row) => (
                      <motion.div
                        key={row.id}
                        layout
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className="grid grid-cols-13 gap-4 items-center px-2"
                      >
                        {/* Source */}
                        <div className="col-span-3 relative">
                          <User
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            size={16}
                          />
                          <input
                            value={row.source}
                            onChange={(e) =>
                              updateRow(row.id, "source", e.target.value)
                            }
                            placeholder="Enter source name..."
                            className="pl-9 w-full border rounded-xl px-4 py-3 text-sm bg-white focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none transition"
                          />
                        </div>

                        {/* Type */}
                        <div className="col-span-2">
                          <button
                            onClick={() => handleTypeToggle(row.id)}
                            className="w-full border rounded-xl px-3 py-3 flex items-center justify-between capitalize text-sm font-semibold transition hover:brightness-95"
                            style={{
                              backgroundColor:
                                row.type === "self" ? "#C9765E11" : "#C9765E22",
                            }}
                          >
                            <span>{row.type}</span>
                            <RefreshCw size={14} className="text-gray-400" />
                          </button>
                        </div>

                        {/* Referrals */}
                        <div
                          className="col-span-3 relative rounded-xl"
                          style={{
                            backgroundColor:
                              row.type === "self" ? "#C9765E11" : "#C9765E22",
                          }}
                        >
                          <User
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            size={16}
                          />
                          <input
                            type="text"
                            value={row.referrals}
                            onChange={(e) =>
                              updateRow(
                                row.id,
                                "referrals",
                                sanitizeNumber(e.target.value)
                              )
                            }
                            placeholder="0"
                            className="pl-9 pr-12 w-full border rounded-xl px-4 py-3 text-sm bg-transparent focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none transition"
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
                            <button
                              onClick={() =>
                                incrementField(row.id, "referrals", 1)
                              }
                              className="p-0.5 text-gray-500 hover:text-gray-700"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              onClick={() =>
                                incrementField(row.id, "referrals", -1)
                              }
                              className="p-0.5 text-gray-500 hover:text-gray-700"
                            >
                              <ArrowDown size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Production */}
                        <div
                          className="col-span-4 relative rounded-xl"
                          style={{
                            backgroundColor:
                              row.type === "self" ? "#C9765E11" : "#C9765E22",
                          }}
                        >
                          <DollarSign
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            size={16}
                          />
                          <input
                            type="text"
                            value={formatMoney(row.production)}
                            onChange={(e) =>
                              updateRow(
                                row.id,
                                "production",
                                sanitizeNumber(e.target.value)
                              )
                            }
                            placeholder="0"
                            className="pl-9 pr-12 w-full border rounded-xl px-4 py-3 text-sm bg-transparent focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none transition"
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
                            <button
                              onClick={() =>
                                incrementField(row.id, "production", 100)
                              }
                              className="p-0.5 text-gray-500 hover:text-gray-700"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              onClick={() =>
                                incrementField(row.id, "production", -100)
                              }
                              className="p-0.5 text-gray-500 hover:text-gray-700"
                            >
                              <ArrowDown size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Delete */}
                        <div className="col-span-1 flex justify-end relative">
                          <button
                            onClick={() => requestDeleteRow(row.id)}
                            className="p-2.5 rounded-xl transition hover:brightness-110"
                            style={{
                              backgroundColor: ALORO_ORANGE_DARK,
                              color: "white",
                            }}
                          >
                            <Trash2 size={18} />
                          </button>

                          <AnimatePresence>
                            {confirmDeleteRowId === row.id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -6 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -6 }}
                                className="absolute right-10 top-1/2 -translate-y-1/2 bg-white border rounded-xl shadow-lg p-3 z-10"
                              >
                                <div className="text-xs mb-2">
                                  Delete source?
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => deleteRow(row.id)}
                                    className="text-xs px-3 py-1 rounded-lg text-white"
                                    style={{
                                      backgroundColor: ALORO_ORANGE_DARK,
                                    }}
                                  >
                                    Delete
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteRowId(null)}
                                    className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>

                {/* Add Source + Paste Data Buttons */}
                <div className="flex justify-end gap-3 px-2">
                  <button
                    onClick={addRow}
                    className="flex items-center gap-2 border rounded-full px-5 py-2 text-xs font-semibold transition-colors hover:bg-gray-50"
                    style={{ color: ALORO_ORANGE, borderColor: ALORO_ORANGE }}
                  >
                    <Plus size={16} />
                    <span>Add Source</span>
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard
                        .readText()
                        .then((text) => {
                          if (text) {
                            const fakeEvent = {
                              clipboardData: { getData: () => text },
                              target: document.body,
                              preventDefault: () => {},
                            } as unknown as React.ClipboardEvent;
                            handlePasteEvent(fakeEvent);
                          }
                        })
                        .catch(() => {
                          setError(
                            "Clipboard access denied. Try pressing Cmd+V instead."
                          );
                        });
                    }}
                    disabled={isPasting}
                    className="flex items-center gap-2 border rounded-full px-5 py-2 text-xs font-semibold transition-colors hover:bg-gray-50 disabled:opacity-50"
                    style={{ color: "#6B7280", borderColor: "#D1D5DB" }}
                  >
                    <ClipboardPaste size={16} />
                    <span>Paste Data</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Paste Confirm Dialog */}
          {showPasteConfirm && (
            <PasteConfirmDialog
              pasteInfo={pasteInfo}
              isPasting={isPasting}
              phase={pastePhase}
              batchProgress={batchProgress}
              onConfirm={confirmPaste}
              onCancel={cancelPaste}
            />
          )}

          {/* Month Picker Modal */}
          <AnimatePresence>
            {showMonthPicker && activeMonth && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/30 flex items-center justify-center z-[110]"
                onClick={() => setShowMonthPicker(false)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-2xl p-6 w-96 shadow-xl relative"
                >
                  <button
                    onClick={() => setShowMonthPicker(false)}
                    className="absolute right-3 top-3 p-1 rounded-lg hover:bg-gray-50"
                    aria-label="Close"
                  >
                    <X size={16} className="text-gray-400" />
                  </button>

                  {pickerStep === "month" && (
                    <>
                      <div className="text-sm font-semibold text-gray-500 mb-4 text-center">
                        Select Month
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {Array.from({ length: 12 }).map((_, i) => {
                          const m = String(i + 1).padStart(2, "0");
                          const label = new Date(`2024-${m}-01`).toLocaleString(
                            undefined,
                            { month: "short" }
                          );
                          const isSelected = m === tempMonth;
                          return (
                            <motion.button
                              key={m}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => {
                                setTempMonth(m);
                                setPickerStep("year");
                              }}
                              className="rounded-xl py-2 text-sm border transition hover:bg-gray-50"
                              style={{
                                backgroundColor: isSelected
                                  ? "rgba(201,118,94,0.12)"
                                  : undefined,
                              }}
                            >
                              {label}
                            </motion.button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {pickerStep === "year" && (
                    <>
                      <div className="text-sm font-semibold text-gray-500 mb-2 text-center">
                        Select Year
                      </div>
                      <div className="text-xs text-gray-400 text-center mb-4">
                        for{" "}
                        {new Date(`2024-${tempMonth}-01`).toLocaleString(
                          undefined,
                          {
                            month: "long",
                          }
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const y = new Date().getFullYear() - i;
                          const candidate = `${y}-${tempMonth}`;
                          const isActive = candidate === activeMonth.month;
                          return (
                            <motion.button
                              key={y}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => commitMonthChange(candidate)}
                              className="rounded-xl py-2 text-sm border transition"
                              style={{
                                backgroundColor: isActive
                                  ? ALORO_ORANGE
                                  : undefined,
                                color: isActive ? "white" : undefined,
                              }}
                            >
                              {y}
                            </motion.button>
                          );
                        })}
                      </div>

                      <div className="flex justify-center mt-5">
                        <button
                          onClick={() => setPickerStep("month")}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Back to months
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          {submitStatus !== "success" && (
            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 bg-white">
              <div className="text-xs text-gray-500">
                {error && (
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-gray-200 px-6 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: ALORO_ORANGE }}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isSubmitting ? "Submitting..." : "Submit & Get Insights"}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
