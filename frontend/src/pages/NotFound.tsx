/**
 * 404 — Page not found.
 * "This page doesn't exist. But your market data does."
 */

import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MarketingLayout from "../components/marketing/MarketingLayout";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <MarketingLayout title="Page Not Found" description="This page doesn't exist. But your market data does.">
      <div className="flex flex-col items-center justify-center px-5 py-24 text-center">
        <p className="text-7xl font-semibold text-[#1A1D23]/10 mb-4">404</p>
        <h1 className="text-2xl font-semibold text-[#1A1D23]">This page doesn't exist.</h1>
        <p className="text-base text-gray-500 mt-2 max-w-sm">
          But your market data does.
        </p>
        <button
          onClick={() => navigate("/checkup")}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#D56753] px-6 py-3 text-sm font-semibold text-white hover:brightness-105 active:scale-[0.98] transition-all"
        >
          Run a Checkup
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => navigate("/home")}
          className="mt-3 text-sm text-gray-400 hover:text-[#1A1D23] transition-colors"
        >
          Go home
        </button>
      </div>
    </MarketingLayout>
  );
}
