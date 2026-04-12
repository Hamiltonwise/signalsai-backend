import { useState } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { Upload, ArrowRight, Clock } from "lucide-react";
import { PMSUploadWizardModal } from "../../components/PMS/PMSUploadWizardModal";

/**
 * /checkup/upload-prompt -- Closes the banner loop.
 *
 * Banner: "Every Endodontist Has A Referring GP They're About To Lose. We Know Which One."
 * Checkup: showed Google competitive intelligence (reviews, ratings).
 * This screen: "Upload your referral report and we'll show you which one."
 *
 * Appears AFTER BuildingScreen, BEFORE ColleagueShare.
 * The prospect just created an account and has a JWT in localStorage.
 */

interface UploadPromptState {
  referralCode?: string | null;
  businessName?: string | null;
  checkupScore?: number | null;
  topCompetitorName?: string | null;
  reviewGap?: number | null;
  city?: string | null;
}

export default function UploadPrompt() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as UploadPromptState | undefined;
  const [showModal, setShowModal] = useState(false);

  // Get orgId from the JWT stored during account creation
  const token = localStorage.getItem("auth_token");
  let clientId = "";
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      clientId = payload.organizationId ? String(payload.organizationId) : "";
    } catch {
      // malformed token, clientId stays empty
    }
  }

  const forwardState = {
    referralCode: state?.referralCode || null,
    businessName: state?.businessName || null,
    checkupScore: state?.checkupScore || null,
    topCompetitorName: state?.topCompetitorName || null,
    reviewGap: state?.reviewGap || null,
    city: state?.city || null,
  };

  const goToShare = () => {
    navigate("/checkup/share", { replace: true, state: forwardState });
  };

  // If no state at all, redirect to checkup start
  if (!state?.businessName && !token) {
    return <Navigate to="/checkup" replace />;
  }

  return (
    <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6 text-center">

        {/* The ask */}
        <div className="space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#D56753]/10 mx-auto">
            <Upload className="w-7 h-7 text-[#D56753]" />
          </div>
          <h2 className="text-2xl font-semibold text-[#1A1D23] tracking-tight leading-tight">
            Now show us your referral report.
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
            Upload a recent production report. 60 seconds, and we'll tell you which referring source needs attention.
          </p>
        </div>

        {/* What they'll see */}
        <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5 text-left space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">What you'll see</p>
          <div className="space-y-2">
            <p className="text-sm text-[#1A1D23]">Which referral sources are growing</p>
            <p className="text-sm text-[#1A1D23]">Which ones have gone quiet</p>
            <p className="text-sm text-[#1A1D23]">How much revenue each one represents</p>
          </div>
        </div>

        {/* Primary CTA */}
        <button
          onClick={() => setShowModal(true)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#D56753] px-5 py-3.5 text-sm font-semibold text-white hover:brightness-105 active:scale-[0.98] transition-all"
        >
          Upload referral report
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* Time estimate */}
        <div className="flex items-center justify-center gap-1.5 text-gray-400">
          <Clock className="w-3.5 h-3.5" />
          <p className="text-xs">Any format. Drag and drop. Takes 60 seconds.</p>
        </div>

        {/* Skip link */}
        <button
          onClick={goToShare}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          I'll do this later
        </button>

        {/* Upload modal */}
        {showModal && (
          <PMSUploadWizardModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            clientId={clientId}
            onSuccess={() => {
              setShowModal(false);
              // Brief pause to let the success state register, then forward
              setTimeout(goToShare, 1500);
            }}
          />
        )}
      </div>
    </div>
  );
}
