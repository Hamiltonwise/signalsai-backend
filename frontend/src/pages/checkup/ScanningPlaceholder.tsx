import { useLocation, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { PlaceDetails } from "../../api/places";

/**
 * Placeholder for Screen 2 — Scanning Theater.
 * Confirms place data arrived via navigation state.
 */
export default function ScanningPlaceholder() {
  const location = useLocation();
  const place = (location.state as { place?: PlaceDetails })?.place;

  if (!place) {
    return <Navigate to="/checkup" replace />;
  }

  return (
    <div className="w-full max-w-md mt-4 sm:mt-12 text-center">
      <Loader2 className="w-8 h-8 text-alloro-orange animate-spin mx-auto" />
      <h2 className="mt-6 text-xl font-bold text-slate-900">
        Scanning {place.name}...
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Scanning theater will be built here.
      </p>
    </div>
  );
}
