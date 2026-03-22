import { createContext } from "react";
import type { ClarityContextType } from "../hooks/useClarity";

export const ClarityContext = createContext<ClarityContextType | undefined>(
  undefined
);
