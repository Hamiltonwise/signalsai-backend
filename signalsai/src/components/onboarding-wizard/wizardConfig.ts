/**
 * Onboarding Wizard Configuration
 * Defines all steps, pages, and demo data for the product tour
 */

export type WizardPage =
  | "dashboard"
  | "pmsStatistics"
  | "rankings"
  | "tasks"
  | "settings";

export interface WizardStep {
  id: string;
  page: WizardPage;
  /** CSS selector for the element to highlight (null for page overview) */
  targetSelector: string | null;
  /** Title shown in the tooltip */
  title: string;
  /** Description shown in the tooltip */
  description: string;
  /** Whether this is a page overview step (highlights entire content area) */
  isPageOverview?: boolean;
  /** Whether to scroll to this element */
  scrollToElement?: boolean;
  /** Special action: prompt user to click something */
  promptAction?: {
    type: "click" | "navigate";
    target: string;
    buttonText: string;
  };
}

export const WIZARD_STEPS: WizardStep[] = [
  // ========== PRACTICE HUB (Dashboard) ==========
  {
    id: "dashboard-overview",
    page: "dashboard",
    targetSelector: null,
    title: "Welcome to Practice Hub",
    description:
      "This is your command center. Get a quick snapshot of your practice's health, see what's working, and identify opportunities for growth.",
    isPageOverview: true,
  },
  {
    id: "dashboard-hero",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-hero']",
    title: "Personalized Insights",
    description:
      "Every time you log in, you'll see a personalized greeting with the latest update on your practice's trajectory and growth status.",
    scrollToElement: true,
  },
  {
    id: "dashboard-metrics",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-metrics']",
    title: "Monthly Practice Totals",
    description:
      "Track your key metrics at a glance: new patient starts, referrals, production value, and market coverage. Trends show month-over-month changes.",
    scrollToElement: true,
  },
  {
    id: "dashboard-ranking",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-ranking']",
    title: "Local Ranking Strategy",
    description:
      "See how you rank against local competitors. Your visibility score and patient sentiment are updated regularly based on Google data.",
    scrollToElement: true,
  },
  {
    id: "dashboard-intelligence",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-intelligence']",
    title: "Important Updates",
    description:
      "Critical tasks that need attention appear here. These are high-priority items that could impact your revenue if not addressed.",
    scrollToElement: true,
  },
  {
    id: "dashboard-wins-risks",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-wins-risks']",
    title: "What's Working vs What's Not",
    description:
      "A quick view of your wins (keep doing these!) and risks (fix these to prevent revenue loss).",
    scrollToElement: true,
  },
  {
    id: "dashboard-growth",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-growth']",
    title: "Strategic Growth Opportunities",
    description:
      "Your top 3 fixes to maximize revenue. Each recommendation is based on your practice's actual data and industry benchmarks.",
    scrollToElement: true,
  },

  // ========== REFERRALS HUB (PMS Statistics) ==========
  {
    id: "pms-overview",
    page: "pmsStatistics",
    targetSelector: null,
    title: "Welcome to Referrals Hub",
    description:
      "This is where you track where your patients come from. Upload your PMS data and we'll analyze your referral patterns and revenue attribution.",
    isPageOverview: true,
  },
  {
    id: "pms-attribution",
    page: "pmsStatistics",
    targetSelector: "[data-wizard-target='pms-attribution']",
    title: "Referral Analysis",
    description:
      "See your year-to-date production split between marketing (self-referrals) and doctor referrals. Track total referrals synced from your PMS.",
    scrollToElement: true,
  },
  {
    id: "pms-velocity",
    page: "pmsStatistics",
    targetSelector: "[data-wizard-target='pms-velocity']",
    title: "Referral Velocity",
    description:
      "Monthly breakdown of your referral sources. Orange bars show marketing/self-referrals, navy bars show doctor referrals.",
    scrollToElement: true,
  },
  {
    id: "pms-matrices",
    page: "pmsStatistics",
    targetSelector: "[data-wizard-target='pms-matrices']",
    title: "Intelligence Hub",
    description:
      "Detailed breakdown of each referral source with conversion metrics: scheduled rate, examination rate, start rate, and net production.",
    scrollToElement: true,
  },
  {
    id: "pms-upload",
    page: "pmsStatistics",
    targetSelector: "[data-wizard-target='pms-upload']",
    title: "Upload Your PMS Data",
    description:
      "This is where you'll upload your practice management data. Drop a CSV file or manually enter your referral data to start getting insights.",
    scrollToElement: true,
  },

  // ========== LOCAL RANKINGS ==========
  {
    id: "rankings-overview",
    page: "rankings",
    targetSelector: null,
    title: "Welcome to Local Rankings",
    description:
      "Track how your practice ranks in local search results. We analyze your Google Business Profile against competitors in your area.",
    isPageOverview: true,
  },
  {
    id: "rankings-score",
    page: "rankings",
    targetSelector: "[data-wizard-target='rankings-score']",
    title: "Ranking Score Overview",
    description:
      "Your overall ranking position, visibility score, review count, and star rating at a glance.",
    scrollToElement: true,
  },
  {
    id: "rankings-factors",
    page: "rankings",
    targetSelector: "[data-wizard-target='rankings-factors']",
    title: "Ranking Factors",
    description:
      "See which factors are helping or hurting your rankings. We analyze category match, reviews, keywords, and more.",
    scrollToElement: true,
  },
  {
    id: "rankings-competitors",
    page: "rankings",
    targetSelector: "[data-wizard-target='rankings-competitors']",
    title: "Competitor Analysis",
    description:
      "See how you stack up against local competitors. Understand their strengths and find opportunities to outrank them.",
    scrollToElement: true,
  },

  // ========== TO-DO LIST (Tasks) ==========
  {
    id: "tasks-overview",
    page: "tasks",
    targetSelector: null,
    title: "Welcome to Your To-Do List",
    description:
      "Your practice roadmap. Complete these tasks to capture revenue opportunities and fix issues before they become problems.",
    isPageOverview: true,
  },
  {
    id: "tasks-team",
    page: "tasks",
    targetSelector: "[data-wizard-target='tasks-team']",
    title: "Team Tasks",
    description:
      "Action items for your practice staff. Each task is prioritized based on potential revenue impact.",
    scrollToElement: true,
  },
  {
    id: "tasks-alloro",
    page: "tasks",
    targetSelector: "[data-wizard-target='tasks-alloro']",
    title: "Alloro System Intelligence",
    description:
      "These are background tasks that Alloro handles automatically: reputation monitoring, rank tracking, and lead flow integrity.",
    scrollToElement: true,
  },

  // ========== SETTINGS - Final Steps ==========
  {
    id: "settings-overview",
    page: "settings",
    targetSelector: null,
    title: "Settings & Integrations",
    description:
      "Connect your Google accounts here to unlock the full power of Alloro. Let's set up your integrations.",
    isPageOverview: true,
  },
  {
    id: "settings-integrations",
    page: "settings",
    targetSelector: "[data-wizard-target='settings-integrations']",
    title: "Connect Your Google Accounts",
    description:
      "Start by connecting your Google Business Profile. This enables us to track your online presence and rankings.",
    scrollToElement: true,
    promptAction: {
      type: "click",
      target: "[data-wizard-target='settings-integrations']",
      buttonText: "I'll connect my accounts",
    },
  },

  // ========== FINAL STEP - Back to PMS Upload ==========
  {
    id: "final-pms-upload",
    page: "pmsStatistics",
    targetSelector: "[data-wizard-target='pms-upload']",
    title: "Upload Your First PMS Data",
    description:
      "Finally, upload your practice management data so we can start analyzing your referrals and revenue attribution. You're all set!",
    scrollToElement: true,
    promptAction: {
      type: "click",
      target: "[data-wizard-target='pms-upload']",
      buttonText: "Got it, let's go!",
    },
  },
];

/**
 * Get steps for a specific page
 */
export function getStepsForPage(page: WizardPage): WizardStep[] {
  return WIZARD_STEPS.filter((step) => step.page === page);
}

/**
 * Get the page route for a wizard page
 */
export function getPageRoute(page: WizardPage): string {
  const routes: Record<WizardPage, string> = {
    dashboard: "/dashboard",
    pmsStatistics: "/pmsStatistics",
    rankings: "/rankings",
    tasks: "/tasks",
    settings: "/settings",
  };
  return routes[page];
}

/**
 * Get the page name for display
 */
export function getPageDisplayName(page: WizardPage): string {
  const names: Record<WizardPage, string> = {
    dashboard: "Practice Hub",
    pmsStatistics: "Referrals Hub",
    rankings: "Local Rankings",
    tasks: "To-Do List",
    settings: "Settings",
  };
  return names[page];
}

/**
 * Demo/placeholder data for wizard mode
 * This data is shown when the wizard is active to fill in empty states
 */
export const WIZARD_DEMO_DATA = {
  // Dashboard metrics
  pmsMetrics: {
    newStarts: { value: 24, trend: 12.5 },
    referrals: { value: 47, trend: 8.3 },
    production: { value: 156000, trend: 15.2 },
    marketCoverage: { value: 73, trend: 5.1 },
  },

  // Ranking data
  rankingData: [
    {
      locationName: "Main Office",
      rank: 3,
      totalCompetitors: 15,
      visibilityScore: 78,
      patientMood: "High",
      reviews: 127,
      rating: 4.8,
    },
  ],

  // Tasks
  tasks: {
    USER: [
      {
        id: "demo-task-1",
        title: "Respond to 3 pending Google reviews",
        description:
          "You have 3 reviews from the past week that need responses. Responding to reviews improves your local ranking.",
        status: "pending",
        urgency: "High",
        category: "Reputation",
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "demo-task-2",
        title: "Update Google Business Profile hours",
        description:
          "Your holiday hours may be outdated. Verify and update your business hours to avoid patient confusion.",
        status: "pending",
        urgency: "Medium",
        category: "GBP",
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    ALLORO: [
      {
        id: "demo-alloro-1",
        title: "Monitoring review sentiment",
        description:
          "Automatically tracking patient sentiment across platforms.",
        status: "in_progress",
        category: "Automation",
      },
      {
        id: "demo-alloro-2",
        title: "Tracking local rankings",
        description: "Monitoring your position against 15 local competitors.",
        status: "in_progress",
        category: "Automation",
      },
    ],
  },

  // Referral data
  referralData: {
    monthlyData: [
      { month: "Jan", marketing: 12, doctor: 8 },
      { month: "Feb", marketing: 15, doctor: 10 },
      { month: "Mar", marketing: 18, doctor: 12 },
      { month: "Apr", marketing: 14, doctor: 11 },
      { month: "May", marketing: 20, doctor: 14 },
      { month: "Jun", marketing: 22, doctor: 13 },
    ],
    keyData: {
      mktProduction: 89000,
      docProduction: 67000,
      totalReferrals: 124,
    },
  },

  // Wins and risks
  prooflineData: {
    trajectory:
      "Your practice is showing <hl>strong momentum</hl> this month. New patient starts are up 12% and your local visibility continues to improve.",
    wins: [
      "Google reviews up 23% this quarter",
      "Website traffic increased by 15%",
      "Patient retention rate at 89%",
    ],
    risks: [
      "3 negative reviews need responses",
      "GBP profile missing business description",
      "Local ranking dropped from #2 to #3",
    ],
    topFixes: [
      {
        title: "Respond to pending reviews",
        description:
          "Address 3 pending negative reviews to improve your online reputation score.",
      },
      {
        title: "Optimize GBP profile",
        description:
          "Add business description and update photos to improve visibility.",
      },
      {
        title: "Request reviews from recent patients",
        description:
          "Send review requests to 15 patients who visited in the last 30 days.",
      },
    ],
    estimatedRevenue: 12500,
  },

  // Critical actions
  criticalActionsCount: 2,

  // User profile for greeting
  userProfile: {
    firstName: "Doctor",
    lastName: "Smith",
    practiceName: "Smith Orthodontics",
  },
};
