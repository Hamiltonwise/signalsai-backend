import { useState } from "react";
import type { GBPLocation } from "../../types/onboarding";

interface Step3GBPSelectionProps {
  locations: GBPLocation[];
  selectedLocations: GBPLocation[];
  onSelect: (locations: GBPLocation[]) => void;
  onComplete: () => void;
  onSkip: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

export const Step3GBPSelection: React.FC<Step3GBPSelectionProps> = ({
  locations,
  selectedLocations,
  onSelect,
  onComplete,
  onSkip,
  onBack,
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredLocations = locations.filter((loc) =>
    loc.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const hasLocations = locations.length > 0;

  const toggleLocation = (location: GBPLocation) => {
    const isSelected = selectedLocations.some(
      (loc) => loc.locationId === location.locationId
    );

    if (isSelected) {
      onSelect(
        selectedLocations.filter(
          (loc) => loc.locationId !== location.locationId
        )
      );
    } else {
      onSelect([...selectedLocations, location]);
    }
  };

  const selectAll = () => {
    onSelect(filteredLocations);
  };

  const clearAll = () => {
    onSelect([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-light text-gray-800 mb-2">
          Google Business Profile
        </h2>
        <p className="text-gray-600 font-light">
          {hasLocations
            ? "Select the GBP locations you want to track"
            : "No GBP locations found"}
        </p>
        {hasLocations && selectedLocations.length > 0 && (
          <p className="text-gray-500 text-sm mt-2">
            {selectedLocations.length} location
            {selectedLocations.length !== 1 ? "s" : ""} selected
          </p>
        )}
      </div>

      {/* Content */}
      {hasLocations ? (
        <>
          {/* Search Bar & Bulk Actions */}
          <div className="space-y-3">
            {locations.length > 3 && (
              <input
                type="text"
                placeholder="Search locations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-white/40 backdrop-blur-sm border border-white/50 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#86b4ef] transition-all"
              />
            )}

            {filteredLocations.length > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="px-3 py-1.5 text-sm rounded-lg bg-white/30 backdrop-blur-sm border border-white/40 text-gray-700 hover:bg-white/40 transition-all"
                >
                  Select All
                </button>
                {selectedLocations.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="px-3 py-1.5 text-sm rounded-lg bg-white/30 backdrop-blur-sm border border-white/40 text-gray-700 hover:bg-white/40 transition-all"
                  >
                    Clear All
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Locations List */}
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredLocations.map((location) => {
              const isSelected = selectedLocations.some(
                (loc) => loc.locationId === location.locationId
              );

              return (
                <button
                  key={location.locationId}
                  onClick={() => toggleLocation(location)}
                  className={`
                    w-full p-4 rounded-lg text-left transition-all duration-300
                    backdrop-blur-sm border-2
                    ${
                      isSelected
                        ? "bg-gradient-to-r from-[#86b4ef]/30 to-[#6fa3eb]/30 border-[#86b4ef] scale-[1.02]"
                        : "bg-white/20 border-white/30 hover:bg-white/30 hover:border-white/40"
                    }
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-gray-800 font-semibold text-lg mb-1">
                        {location.displayName}
                      </h3>
                      <p className="text-gray-600 text-sm font-mono break-all">
                        Location ID: {location.locationId}
                      </p>
                      {location.storeCode && (
                        <p className="text-gray-500 text-xs mt-1">
                          Store Code: {location.storeCode}
                        </p>
                      )}
                    </div>
                    <div
                      className={`
                        w-6 h-6 rounded flex items-center justify-center transition-all flex-shrink-0 ml-3
                        ${
                          isSelected
                            ? "bg-[#86b4ef] border-2 border-[#86b4ef]"
                            : "border-2 border-gray-400"
                        }
                      `}
                    >
                      {isSelected && (
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {filteredLocations.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-600">No locations match your search</p>
            </div>
          )}
        </>
      ) : (
        /* No Locations Available */
        <div className="py-12 text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <p className="text-gray-600 max-w-md mx-auto">
            We don't have any Google Business Profile locations linked to your
            account. We'll help you integrate one later. Skip for now to
            continue.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="px-6 py-3 rounded-lg bg-white/30 backdrop-blur-sm border border-white/40 text-gray-700 hover:bg-white/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          ← Back
        </button>
        <button
          onClick={onSkip}
          disabled={isLoading}
          className="flex-1 px-6 py-3 rounded-lg bg-white/30 backdrop-blur-sm border border-white/40 text-gray-700 hover:bg-white/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          Skip
        </button>
        <button
          onClick={onComplete}
          disabled={isLoading}
          className={`
            flex-1 px-6 py-3 rounded-lg font-semibold transition-all
            ${
              isLoading
                ? "bg-white/20 text-gray-400 cursor-wait"
                : "bg-gradient-to-r from-[#6fa3eb] to-[#86b4ef] text-white hover:from-[#5a8ed9] hover:to-[#6fa3eb]"
            }
          `}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Completing...
            </span>
          ) : (
            "Complete Setup ✓"
          )}
        </button>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(134, 180, 239, 0.5);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(134, 180, 239, 0.7);
        }
      `}</style>
    </div>
  );
};
