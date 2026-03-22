interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  currentStep,
  totalSteps,
}) => {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }, (_, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isCompleted = stepNumber < currentStep;

        return (
          <div key={stepNumber} className="flex items-center gap-2">
            <div
              className={`
                w-10 h-10 rounded-full flex items-center justify-center
                transition-all duration-300 font-bold text-sm
                ${
                  isCompleted
                    ? "bg-gradient-to-br from-alloro-orange to-[#c45a47] text-white shadow-md shadow-alloro-orange/20"
                    : isActive
                    ? "bg-gradient-to-br from-alloro-orange to-[#c45a47] text-white scale-110 shadow-lg shadow-alloro-orange/30"
                    : "bg-white text-slate-400 border-2 border-slate-200"
                }
              `}
            >
              {isCompleted ? "✓" : stepNumber}
            </div>

            {stepNumber < totalSteps && (
              <div
                className={`
                  w-12 h-1 rounded-full transition-all duration-300
                  ${isCompleted ? "bg-gradient-to-r from-alloro-orange to-[#c45a47]" : "bg-slate-200"}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
