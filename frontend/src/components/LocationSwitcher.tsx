import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { MapPin, Check, ChevronDown } from "lucide-react";
import { useLocationContext } from "../contexts/locationContext";

/**
 * Location switcher dropdown for multi-location organizations.
 * During the transition animation, a portal-rendered clone of the button
 * floats above the overlay (z-[95]) so the splash appears to emanate
 * from and collapse back into the switcher.
 */
export function LocationSwitcher() {
  const { locations, selectedLocation, setSelectedLocation, isTransitioning } =
    useLocationContext();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

  // Capture button position when transition starts
  useEffect(() => {
    if (isTransitioning && buttonRef.current) {
      setButtonRect(buttonRef.current.getBoundingClientRect());
    } else {
      setButtonRect(null);
    }
  }, [isTransitioning]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Don't render if only one location
  if (locations.length <= 1) return null;

  function handleSelect(location: (typeof locations)[number]) {
    const rect = buttonRef.current?.getBoundingClientRect();
    const origin = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : undefined;
    setSelectedLocation(location, origin);
    setIsOpen(false);
  }

  // The button content — shared between the in-place and portal versions
  const buttonContent = (
    <>
      <MapPin size={16} className="text-alloro-orange flex-shrink-0" />
      <span className="flex-1 text-left truncate text-[13px]">
        {selectedLocation?.name || "Select Location"}
      </span>
      <ChevronDown
        size={14}
        className={`text-white/30 transition-transform ${isOpen ? "rotate-180" : ""}`}
      />
    </>
  );

  return (
    <>
      <div ref={dropdownRef} className="relative px-8 mb-1">
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-white/70 bg-white/5 border border-white/5 rounded-2xl hover:bg-alloro-sidehover hover:text-white transition-all"
        >
          {buttonContent}
        </button>

        {isOpen && (
          <div className="absolute left-8 right-8 bottom-full mb-1 bg-alloro-sidebg border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="py-1 max-h-48 overflow-y-auto scrollbar-thin">
              {locations.map((location) => {
                const isSelected = selectedLocation?.id === location.id;
                return (
                  <button
                    key={location.id}
                    onClick={() => handleSelect(location)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors ${
                      isSelected
                        ? "text-alloro-orange bg-white/5"
                        : "text-white/50 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {isSelected ? (
                      <Check
                        size={14}
                        className="text-alloro-orange flex-shrink-0"
                      />
                    ) : (
                      <span className="w-3.5" />
                    )}
                    <span className="truncate">{location.name}</span>
                    {location.is_primary && (
                      <span className="ml-auto text-[9px] font-black text-white/20 uppercase tracking-widest flex-shrink-0">
                        Primary
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Portal clone: floats above overlay with a bouncy pulse */}
      {isTransitioning &&
        buttonRect &&
        createPortal(
          <motion.div
            className="pointer-events-none"
            style={{
              position: "fixed",
              top: buttonRect.top,
              left: buttonRect.left,
              width: buttonRect.width,
              height: buttonRect.height,
              zIndex: 95,
            }}
            animate={{ scale: [1, 1.06, 0.97, 1.04, 1] }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <div className="w-full h-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-white/70 bg-alloro-sidebg border border-white/5 rounded-2xl shadow-lg">
              {buttonContent}
            </div>
          </motion.div>,
          document.body,
        )}
    </>
  );
}
