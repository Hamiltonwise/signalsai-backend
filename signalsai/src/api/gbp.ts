import { apiPost, apiGet } from "./index";

const baseurl = "/gbp";

async function getKeyData(accountId: string, locationId: string) {
  try {
    return await apiPost({
      path: baseurl + `/getKeyData`,
      passedData: { accountId, locationId },
    });
  } catch (err) {
    console.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

interface GBPAIReadyDataRequest {
  accountId: string;
  locationId: string;
  startDate?: string;
  endDate?: string;
}

async function getAIReadyData(
  accountId: string,
  locationId: string,
  startDate?: string,
  endDate?: string
) {
  try {
    const passedData: GBPAIReadyDataRequest = { accountId, locationId };
    if (startDate) passedData.startDate = startDate;
    if (endDate) passedData.endDate = endDate;

    return await apiPost({
      path: baseurl + `/getAIReadyData`,
      passedData,
    });
  } catch (err) {
    console.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

async function getAccounts() {
  try {
    return await apiGet({
      path: baseurl + `/diag/accounts`,
    });
  } catch (err) {
    console.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

async function getLocations(accountName?: string) {
  try {
    const queryParam = accountName
      ? `?accountName=${encodeURIComponent(accountName)}`
      : "";
    return await apiGet({
      path: baseurl + `/diag/locations${queryParam}`,
    });
  } catch (err) {
    console.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

const gbp = {
  getKeyData,
  getAIReadyData,
  getAccounts,
  getLocations,
};

export default gbp;
