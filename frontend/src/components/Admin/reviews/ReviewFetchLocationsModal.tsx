import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Download, MapPin, X } from "lucide-react";
import { ActionButton } from "../../ui/DesignSystem";
import type { ReviewLocation } from "./types";

type ReviewFetchLocationsModalProps = {
  isOpen: boolean;
  locations: ReviewLocation[];
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (placeIds: string[]) => void;
};

export function ReviewFetchLocationsModal({
  isOpen,
  locations,
  isSubmitting,
  onClose,
  onConfirm,
}: ReviewFetchLocationsModalProps) {
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) setSelectedPlaceIds(locations.map((location) => location.place_id));
  }, [isOpen, locations]);

  const selectedCount = selectedPlaceIds.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-alloro-navy/40 backdrop-blur-sm px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-fetch-title"
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-white/60 overflow-hidden"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-100">
              <div>
                <p id="review-fetch-title" className="text-lg font-semibold text-gray-950">
                  Fetch reviews via Google Maps
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Select locations to replace their Google Maps fetched reviews.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Close review fetch modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  This replaces existing Google Maps fetched reviews for selected locations after a successful fetch. OAuth-synced GBP reviews are not cleared.
                </p>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {locations.map((location) => (
                  <label
                    key={location.place_id}
                    className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 cursor-pointer hover:border-alloro-orange/40 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPlaceIds.includes(location.place_id)}
                      onChange={(event) => {
                        setSelectedPlaceIds((prev) =>
                          event.target.checked
                            ? [...prev, location.place_id]
                            : prev.filter((id) => id !== location.place_id)
                        );
                      }}
                      className="rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange/40"
                    />
                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="flex-1 text-sm font-medium text-gray-900">
                      {location.name}
                    </span>
                    {location.is_primary && (
                      <span className="text-xs font-semibold text-alloro-orange">Primary</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500">
                {selectedCount} selected, max 50 reviews per location
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
                <ActionButton
                  label={`Replace and fetch ${selectedCount}`}
                  icon={<Download className="w-4 h-4" />}
                  onClick={() => onConfirm(selectedPlaceIds)}
                  variant="primary"
                  disabled={selectedCount === 0}
                  loading={isSubmitting}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
