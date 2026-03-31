/**
 * Tailor Context -- inline text editing for super admin users.
 *
 * Provides tailor mode state, override persistence (GET/PUT to /api/admin/tailor),
 * and a getOverride helper for TailorText components.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { apiGet, apiPut } from "../api/index";
import { getPriorityItem } from "../hooks/useLocalStorage";

const SUPER_ADMIN_EMAILS = [
  "corey@getalloro.com",
  "info@getalloro.com",
  "demo@getalloro.com",
  "jo@getalloro.com",
  "jordan@getalloro.com",
  "dave@getalloro.com",
];

interface TailorContextType {
  isTailorMode: boolean;
  isSuperAdmin: boolean;
  toggleTailorMode: () => void;
  saveEdit: (key: string, value: string) => Promise<void>;
  getOverride: (key: string) => string | null;
}

const TailorContext = createContext<TailorContextType | null>(null);

export function TailorProvider({ children }: { children: ReactNode }) {
  const [isTailorMode, setIsTailorMode] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Determine super admin status from stored email
  useEffect(() => {
    const email =
      getPriorityItem("user_email")?.toLowerCase() || "";
    setIsSuperAdmin(SUPER_ADMIN_EMAILS.includes(email));
  }, []);

  // Load overrides from backend on mount (only for super admins)
  useEffect(() => {
    if (!isSuperAdmin) return;

    const loadOverrides = async () => {
      try {
        const res = await apiGet({ path: "/admin/tailor" });
        if (res?.success && res.overrides) {
          const map: Record<string, string> = {};
          for (const o of res.overrides) {
            map[o.override_key] = o.override_value;
          }
          setOverrides(map);
        }
      } catch {
        // Silent fail -- overrides are non-critical
      }
    };

    loadOverrides();
  }, [isSuperAdmin]);

  const toggleTailorMode = useCallback(() => {
    setIsTailorMode((prev) => !prev);
  }, []);

  const saveEdit = useCallback(
    async (key: string, value: string) => {
      // Optimistic update
      setOverrides((prev) => ({ ...prev, [key]: value }));

      try {
        await apiPut({
          path: "/admin/tailor",
          passedData: { key, value },
        });
      } catch {
        // Revert on failure -- reload from server
        try {
          const res = await apiGet({ path: "/admin/tailor" });
          if (res?.success && res.overrides) {
            const map: Record<string, string> = {};
            for (const o of res.overrides) {
              map[o.override_key] = o.override_value;
            }
            setOverrides(map);
          }
        } catch {
          // Silent
        }
      }
    },
    [],
  );

  const getOverride = useCallback(
    (key: string): string | null => {
      return overrides[key] ?? null;
    },
    [overrides],
  );

  return (
    <TailorContext.Provider
      value={{ isTailorMode, isSuperAdmin, toggleTailorMode, saveEdit, getOverride }}
    >
      {children}
    </TailorContext.Provider>
  );
}

export function useTailor(): TailorContextType {
  const context = useContext(TailorContext);
  if (!context) {
    throw new Error("useTailor must be used within a TailorProvider");
  }
  return context;
}
