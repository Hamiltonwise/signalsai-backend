/**
 * GscController — thin request/response layer.
 * All business logic is delegated to feature-services.
 * All validation is delegated to feature-utils.
 */

import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/tokenRefresh";
import { logGscError, createErrorResponse } from "./feature-utils/util.error-handler";
import { getDateRanges } from "./feature-utils/util.date-ranges";
import { getKeyMetrics } from "./feature-services/service.key-metrics";
import { getGSCAIReadyData } from "./feature-services/service.ai-ready-data";
import {
  getSitesWithPermissions,
  getSiteUrls,
} from "./feature-services/service.sites";

/**
 * POST /getKeyData
 * Fetches current & previous month GSC metrics with trend score.
 */
export const getKeyData = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const domainProperty = req.body.domainProperty;

    if (!domainProperty) {
      return res.json({
        successful: false,
        message: "No domain property included",
      });
    }

    const result = await getKeyMetrics(req.oauth2Client, domainProperty);
    return res.json(result);
  } catch (error: any) {
    logGscError(error, "GSC API");
    return res.status(500).json(createErrorResponse("GSC API"));
  }
};

/**
 * POST /getAIReadyData
 * Fetches comprehensive GSC data structured for AI analysis.
 */
export const getAIReadyData = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const domainProperty = req.body.domainProperty;

    if (!domainProperty) {
      return res.json({
        successful: false,
        message: "No domain property included",
      });
    }

    const dateRanges = getDateRanges();
    const startDate = req.body.startDate || dateRanges.currentMonth.startDate;
    const endDate = req.body.endDate || dateRanges.currentMonth.endDate;

    const aiReadyData = await getGSCAIReadyData(
      req.oauth2Client,
      domainProperty,
      startDate,
      endDate
    );

    return res.json(aiReadyData);
  } catch (error: any) {
    logGscError(error, "GSC AI Data");
    return res.status(500).json(createErrorResponse("GSC AI Data"));
  }
};

/**
 * GET /diag/sites
 * Returns all sites with their permission levels (diagnostic endpoint).
 */
export const getDiagSites = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const sites = await getSitesWithPermissions(req.oauth2Client);
    return res.json({ sites });
  } catch (err: any) {
    logGscError(err, "List sites");
    return res.status(500).json(createErrorResponse("List sites"));
  }
};

/**
 * GET /sites/get
 * Returns an array of available site URL strings.
 */
export const getSites = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sites = await getSiteUrls(req.oauth2Client);
    return res.json(sites);
  } catch (err: any) {
    logGscError(err, "Get available sites");
    return res.status(500).json(createErrorResponse("Get available sites"));
  }
};
