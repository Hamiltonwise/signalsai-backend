import type { PmsKeyDataSource } from "../../../api/pms";
import type { ReferralEngineData } from "../ReferralMatrices";

export type PmsDashboardMonth = {
  month: string;
  selfReferrals: number;
  doctorReferrals: number;
  total: number;
  totalReferrals: number;
  productionTotal: number;
  actualProductionTotal?: number;
  attributedProductionTotal?: number;
};

export type PmsDashboardData = {
  monthlyData: PmsDashboardMonth[];
  topSources: PmsKeyDataSource[];
  totalProduction: number;
  totalReferrals: number;
  doctorReferralCount: number;
  doctorPercentage: number;
  referralData: ReferralEngineData | null;
  isLoading: boolean;
  isProcessingInsights: boolean;
  isWizardActive: boolean;
  canUploadPMS: boolean;
  hasProperties: boolean;
  isIngestionHighlighted: boolean;
};
