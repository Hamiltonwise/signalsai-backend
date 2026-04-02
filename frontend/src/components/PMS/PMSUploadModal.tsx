import React, { useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { showUploadToast } from "../../lib/toast";
import {
  X,
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  PenLine,
} from "lucide-react";
import { uploadPMSData } from "../../api/pms";
import { PMSManualEntryModal } from "./PMSManualEntryModal";

interface PMSUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  onSuccess?: () => void;
}

type EntryMode = "upload" | "manual";

export const PMSUploadModal: React.FC<PMSUploadModalProps> = ({
  isOpen,
  onClose,
  clientId,
  onSuccess,
}) => {
  const [entryMode, setEntryMode] = useState<EntryMode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pmsType, setPmsType] = useState<string>("auto-detect");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingStorageKey = useMemo(
    () => `pmsProcessing:${clientId || "artfulorthodontics.com"}`,
    [clientId]
  );

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    setUploadStatus("idle");
    setMessage("");
  }, []);

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      if (selectedFile) {
        handleFileSelect(selectedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);

      const droppedFile = event.dataTransfer.files?.[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(true);
    },
    []
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
    },
    []
  );

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadStatus("idle");

    try {

      const result = await uploadPMSData({
        domain: clientId,
        file,
        pmsType,
      });


      if (result.success) {
        const finding = result.data?.instantFinding;
        const parserFailed = result.data?.parserFailed;
        setUploadResult(result.data);

        if (parserFailed) {
          // Parser failed but data was saved. Be honest, not alarming.
          setUploadStatus("success");
          setMessage(
            result.data?.parserMessage ||
            "Your data was received safely. Processing will complete shortly, and we'll have your referral picture ready soon."
          );
          showUploadToast(
            "Data received",
            `${finding?.totalRecords || 0} records saved. Processing shortly.`
          );
        } else if (finding?.topSource) {
          // Full success with instant finding
          setUploadStatus("success");
          setMessage(
            `Your top referral source: ${finding.topSource} (${finding.topSourceCount} cases from ${finding.totalRecords} records). See your full referral picture below.`
          );
          showUploadToast(
            `${finding.topSource}`,
            `${finding.topSourceCount} cases found in ${finding.totalRecords} records`
          );
        } else {
          setUploadStatus("success");
          setMessage(
            `We found ${finding?.totalRecords || 0} records. Your referral picture is being built.`
          );
          showUploadToast(
            "PMS data received!",
            `${finding?.totalRecords || 0} records processing`
          );
        }
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              processingStorageKey,
              String(Date.now())
            );
            const event = new CustomEvent("pms:job-uploaded", {
              detail: { clientId },
            });
            window.dispatchEvent(event);
          } catch (storageError) {
            console.warn(
              "Unable to persist PMS processing flag:",
              storageError
            );
          }
        }
        setTimeout(() => {
          onSuccess?.();
          // Don't auto-close, let user see the charts
        }, 2000);
      } else {
        throw new Error(result.error || "Upload failed");
      }
    } catch (error) {
      console.error("PMSUploadModal: Upload error:", error);
      setUploadStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const resetModal = () => {
    setEntryMode("upload");
    setFile(null);
    setPmsType("auto-detect");
    setUploadStatus("idle");
    setMessage("");
    setIsDragOver(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleManualEntrySuccess = () => {
    onSuccess?.();
    handleClose();
  };

  // If manual entry mode is selected, render the PMSManualEntryModal
  if (entryMode === "manual") {
    return (
      <PMSManualEntryModal
        isOpen={isOpen}
        onClose={handleClose}
        clientId={clientId}
        onSuccess={handleManualEntrySuccess}
      />
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="bg-gray-50 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white rounded-t-2xl">
              <motion.h2
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-2xl font-semibold text-gray-900"
              >
                Share Your Business Data
              </motion.h2>
              <motion.button
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </motion.button>
            </div>

            <div className="p-6">
              {/* Upload Section */}
              {entryMode === "upload" && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-6"
                >
                  {/* Why Section */}
                  <div className="bg-gradient-to-br from-[#D56753]/5 to-orange-50 rounded-xl border border-[#D56753]/10 p-5 mb-2">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      This is how your advisory board gets specific.
                      Instead of general advice, they see <span className="font-semibold text-[#D56753]">your actual numbers</span> and
                      tell you exactly where to focus. The more they know, the more specific Monday's email gets.
                    </p>
                  </div>

                  {/* What to share */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-sm font-semibold text-gray-800 mb-3">What helps most:</p>
                    <ul className="text-sm text-gray-600 space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-[#D56753] font-semibold mt-0.5">1.</span>
                        <span><span className="font-medium text-gray-800">Where your customers come from</span> (referral sources, Google, walk-ins, word of mouth)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#D56753] font-semibold mt-0.5">2.</span>
                        <span><span className="font-medium text-gray-800">How much revenue each source brings</span> (even rough estimates help)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#D56753] font-semibold mt-0.5">3.</span>
                        <span><span className="font-medium text-gray-800">A few months of history</span> (so we can spot trends, not just snapshots)</span>
                      </li>
                    </ul>
                    <p className="text-xs text-gray-400 mt-3">
                      Any format works. A spreadsheet export, a report from your software, or even numbers you type in manually. We'll figure out the rest.
                    </p>
                  </div>

                  {/* File Upload Container */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">
                      Upload a file
                    </h3>

                    {uploadStatus === "idle" && (
                      <div className="space-y-4">
                        <motion.div
                          className={`border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300 ${
                            isDragOver
                              ? "border-[#D56753] bg-[#D56753]/5"
                              : file
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-gray-300 hover:border-[#D56753]/40 hover:bg-[#D56753]/5"
                          }`}
                          onDrop={handleDrop}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.txt,.xlsx,.xls,.png,.jpg,.jpeg,.pdf,.webp,.heic"
                            onChange={handleFileInputChange}
                            className="hidden"
                          />

                          <motion.div
                            animate={
                              isDragOver ? { scale: 1.05 } : { scale: 1 }
                            }
                            transition={{
                              type: "spring",
                              damping: 20,
                              stiffness: 400,
                            }}
                          >
                            <FileText
                              className={`w-10 h-10 mx-auto mb-3 ${
                                file ? "text-emerald-600" : "text-gray-400"
                              }`}
                            />
                          </motion.div>

                          <h4 className="font-semibold text-gray-900 mb-1 text-sm">
                            {file ? file.name : "Drop your file here"}
                          </h4>
                          <p className="text-gray-500 mb-3 text-xs">
                            {file
                              ? "File ready to upload"
                              : "Spreadsheet, photo, screenshot, or PDF. Whatever you have."}
                          </p>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-[#D56753] text-white px-4 py-2 rounded-lg hover:bg-[#c45a48] transition-colors text-sm"
                          >
                            {file ? "Choose Different File" : "Browse Files"}
                          </button>
                        </motion.div>

                        {/* Software system - simplified, universal */}
                        <motion.div
                          initial={{ y: 10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          className="mt-4"
                        >
                          <label className="block text-xs font-medium text-gray-500 mb-2">
                            What software did this come from? (optional)
                          </label>
                          <select
                            value={pmsType}
                            onChange={(e) => setPmsType(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D56753]/20 focus:border-[#D56753] transition-colors bg-white text-gray-700 text-sm"
                          >
                            <option value="auto-detect">Not sure / auto-detect</option>
                            <option value="gaidge">Gaidge</option>
                            <option value="tdo">TDO</option>
                            <option value="ortho2">Ortho2</option>
                            <option value="dentrix">Dentrix</option>
                            <option value="eaglesoft">Eaglesoft</option>
                            <option value="opendental">Open Dental</option>
                            <option value="quickbooks">QuickBooks</option>
                            <option value="square">Square</option>
                            <option value="spreadsheet">Spreadsheet / manual tracking</option>
                            <option value="other">Other</option>
                          </select>
                        </motion.div>

                        {file && (
                          <motion.div
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="flex gap-3"
                          >
                            <button
                              onClick={() => {
                                setFile(null);
                                if (fileInputRef.current)
                                  fileInputRef.current.value = "";
                              }}
                              className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleUpload}
                              disabled={isUploading}
                              className="flex-1 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                            >
                              {isUploading ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4" />
                                  Upload Data
                                </>
                              )}
                            </button>
                          </motion.div>
                        )}
                      </div>
                    )}

                    {uploadStatus === "success" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="py-4 space-y-4"
                      >
                        {/* HIPAA badge -- the trust moment */}
                        {uploadResult?.hipaaReport?.scrubbed && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl"
                          >
                            <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            <p className="text-xs text-emerald-700">
                              {uploadResult.hipaaReport.patientNamesFound} patient name{uploadResult.hipaaReport.patientNamesFound !== 1 ? "s" : ""} automatically removed before processing. Your data is safe.
                            </p>
                          </motion.div>
                        )}

                        {/* The headline -- what matters most */}
                        {uploadResult?.stats && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="text-center"
                          >
                            <p className="text-3xl font-semibold text-[#1A1D23]">
                              {uploadResult.stats.uniquePatients} patients
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                              from {uploadResult.stats.uniqueSources} referral source{uploadResult.stats.uniqueSources !== 1 ? "s" : ""} totaling ${Number(uploadResult.stats.totalRevenue).toLocaleString()}
                            </p>
                          </motion.div>
                        )}

                        {/* Top referral sources -- the Lemonis moment */}
                        {uploadResult?.referralSummary?.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.6 }}
                            className="space-y-1.5"
                          >
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">Where your customers come from</p>
                            {uploadResult.referralSummary.slice(0, 5).map((source: any, i: number) => (
                              <motion.div
                                key={source.name}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.7 + i * 0.1 }}
                                className="flex items-center justify-between px-3 py-2.5 bg-white border border-gray-100 rounded-xl"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs font-semibold text-[#D56753] w-5 text-right shrink-0">
                                    {i + 1}.
                                  </span>
                                  <span className="text-sm text-gray-800 truncate">{source.name}</span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-xs text-gray-500">{source.uniquePatients} patient{source.uniquePatients !== 1 ? "s" : ""}</span>
                                  <span className="text-sm font-semibold text-[#1A1D23]">${Number(source.totalRevenue).toLocaleString()}</span>
                                </div>
                              </motion.div>
                            ))}
                            {uploadResult.referralSummary.length > 5 && (
                              <p className="text-xs text-gray-400 text-center pt-1">
                                +{uploadResult.referralSummary.length - 5} more source{uploadResult.referralSummary.length - 5 !== 1 ? "s" : ""}
                              </p>
                            )}
                          </motion.div>
                        )}

                        {/* The narrative -- what it means */}
                        {uploadResult?.referralSummary?.[0] && uploadResult?.stats && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1.2 }}
                            className="bg-[#D56753]/5 border border-[#D56753]/10 rounded-xl px-4 py-3"
                          >
                            <p className="text-sm text-gray-700 leading-relaxed">
                              <span className="font-semibold text-[#D56753]">{uploadResult.referralSummary[0].name}</span> is your strongest referral relationship at ${Number(uploadResult.referralSummary[0].totalRevenue).toLocaleString()}.
                              {uploadResult.referralSummary[0].uniquePatients >= 10
                                ? " That single source represents a significant part of your revenue. Protecting that relationship is worth a personal call."
                                : " As your data grows over the coming months, we'll show you exactly which relationships are strengthening and which need attention."
                              }
                            </p>
                          </motion.div>
                        )}

                        {/* Fallback for no referral data */}
                        {!uploadResult?.referralSummary?.length && (
                          <div className="text-center">
                            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                            <p className="text-gray-600">{message}</p>
                          </div>
                        )}

                        {/* What happens next */}
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 1.5 }}
                          className="text-xs text-gray-400 text-center"
                        >
                          Your data is being analyzed. Monday's email will include insights from this upload.
                        </motion.p>
                      </motion.div>
                    )}

                    {uploadStatus === "error" && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          type: "spring",
                          damping: 15,
                          stiffness: 400,
                        }}
                        className="text-center py-6"
                      >
                        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-3" />
                        <h4 className="text-xl font-bold text-gray-900 mb-2">
                          Upload Failed
                        </h4>
                        <p className="text-red-600 mb-4">{message}</p>
                        <button
                          onClick={() => setUploadStatus("idle")}
                          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          Try Again
                        </button>
                      </motion.div>
                    )}
                  </div>

                  {/* Manual entry - equal option, not fallback */}
                  {uploadStatus === "idle" && (
                    <>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-px bg-gray-200"></div>
                        <span className="text-gray-400 text-xs">
                          or
                        </span>
                        <div className="flex-1 h-px bg-gray-200"></div>
                      </div>

                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => setEntryMode("manual")}
                        className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-white border border-gray-200 hover:border-[#D56753]/30 hover:bg-[#D56753]/5 text-gray-700 rounded-xl text-sm font-medium transition-all"
                      >
                        <PenLine className="w-4 h-4 text-[#D56753]" />
                        I'll type my numbers in directly
                      </motion.button>
                      <p className="text-xs text-gray-400 text-center">
                        No spreadsheet? No problem. You can enter monthly totals by hand.
                      </p>
                    </>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
