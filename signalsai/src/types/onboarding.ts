// Property types for each Google service
export interface GBPLocation {
  accountId: string;
  locationId: string;
  displayName: string;
  storeCode?: string | null;
  fullName?: string;
}

// User profile information
export interface ProfileInfo {
  firstName: string;
  lastName: string;
  practiceName: string;
  domainName: string;
}

// Available properties response from API
export interface AvailableProperties {
  gbp: GBPLocation[];
}

// Saved property selections (stored in database)
export interface PropertySelections {
  profile: ProfileInfo;
  gbp: Array<{
    accountId: string;
    locationId: string;
    displayName: string;
  }>;
}

// Onboarding status response
export interface OnboardingStatus {
  success: boolean;
  onboardingCompleted: boolean;
  hasPropertyIds: boolean;
  propertyIds: PropertySelections | null;
}

// Onboarding step information
export interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  serviceName: "gbp";
  icon?: string;
}

// Onboarding context type
export interface OnboardingContextType {
  currentStep: number;
  totalSteps: number;
  availableProperties: AvailableProperties | null;
  selections: PropertySelections;
  isLoading: boolean;
  error: string | null;

  // Profile setters
  firstName: string;
  lastName: string;
  practiceName: string;
  domainName: string;
  setFirstName: (value: string) => void;
  setLastName: (value: string) => void;
  setPracticeName: (value: string) => void;
  setDomainName: (value: string) => void;

  // Actions
  fetchAvailableProperties: () => Promise<void>;
  selectGBPLocations: (locations: GBPLocation[]) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipStep: () => void;
  completeOnboarding: () => Promise<boolean>;
  resetOnboarding: () => void;
}
