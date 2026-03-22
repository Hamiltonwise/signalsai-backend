import { createContext, useContext } from "react";
import type { Location } from "../api/locations";

export interface TransitionOrigin {
  x: number;
  y: number;
}

export interface LocationContextType {
  locations: Location[];
  selectedLocation: Location | null;
  setSelectedLocation: (location: Location, origin?: TransitionOrigin) => void;
  isLoading: boolean;
  refreshLocations: () => Promise<void>;
  /** True while the radial transition animation is playing */
  isTransitioning: boolean;
  /** Screen coordinates the transition circle expands from */
  transitionOrigin: TransitionOrigin | null;
  /** Name of the location being switched to (shown in overlay) */
  transitionLocationName: string | null;
  /** Call from pages that fetch data on location change — tells the overlay to wait for content */
  registerContentLoading: () => void;
  /** Call from pages after data has finished loading — tells the overlay content is ready */
  signalContentReady: () => void;
}

export const LocationContext = createContext<LocationContextType | null>(null);

/**
 * Hook to access the LocationContext.
 * Must be used inside a LocationProvider.
 * Named useLocationContext to avoid collision with react-router-dom's useLocation.
 */
export function useLocationContext(): LocationContextType {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useLocationContext must be used within a LocationProvider");
  }
  return context;
}
