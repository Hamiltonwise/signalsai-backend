import { createContext } from "react";
import type { GBPContextType } from "../hooks/useGBP";

export const GBPContext = createContext<GBPContextType | undefined>(undefined);
