import { useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { useOnboardingWizard } from "../../contexts/OnboardingWizardContext";
import { SpotlightOverlay } from "./SpotlightOverlay";
import { WizardTooltip } from "./WizardTooltip";
import { WelcomeModal } from "./WelcomeModal";

/**
 * WizardController - Main component that renders the wizard UI
 * This should be rendered at the app level, outside of page content
 */
export function WizardController() {
  const {
    isWizardActive,
    isLoadingWizardStatus,
    showWelcomeModal,
    dismissWelcomeModal,
    currentStep,
    currentStepIndex,
    totalSteps,
    progress,
    nextStep,
    prevStep,
    skipWizard,
    completeWizard,
  } = useOnboardingWizard();

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;
  // Final 2 steps are educational only - block interaction
  const isFinalEducationalStep = currentStepIndex >= totalSteps - 2;

  const handleNext = useCallback(() => {
    if (isLastStep) {
      completeWizard();
    } else {
      nextStep();
    }
  }, [isLastStep, completeWizard, nextStep]);

  const handleSkip = useCallback(async () => {
    await skipWizard();
  }, [skipWizard]);

  // Don't render anything while loading or if wizard is not active
  if (isLoadingWizardStatus || !isWizardActive) {
    return null;
  }

  // Show welcome modal first, before any wizard steps
  if (showWelcomeModal) {
    return (
      <AnimatePresence>
        <WelcomeModal
          onStart={dismissWelcomeModal}
          onSkip={handleSkip}
        />
      </AnimatePresence>
    );
  }

  // Don't render steps if no current step
  if (!currentStep) {
    return null;
  }

  return (
    <>
      {/* Spotlight overlay */}
      <SpotlightOverlay
        targetSelector={currentStep.targetSelector}
        isVisible={true}
        isPageOverview={currentStep.isPageOverview}
        blockInteraction={isFinalEducationalStep}
      />

      {/* Tooltip */}
      <WizardTooltip
        step={currentStep}
        isVisible={true}
        currentIndex={currentStepIndex + 1}
        totalSteps={totalSteps}
        progress={progress}
        onNext={handleNext}
        onPrev={prevStep}
        onSkip={handleSkip}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
      />
    </>
  );
}

/**
 * WizardRestartButton - A button to restart the wizard (for settings/help page)
 */
export function WizardRestartButton() {
  const { restartWizard, isWizardActive } = useOnboardingWizard();

  if (isWizardActive) return null;

  return (
    <button
      onClick={restartWizard}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-sm font-semibold"
    >
      Restart Product Tour
    </button>
  );
}
