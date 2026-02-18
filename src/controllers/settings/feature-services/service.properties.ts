import { GoogleAccountModel } from "../../../models/GoogleAccountModel";
import {
  parsePropertyIds,
  updatePropertyByType,
} from "../feature-utils/util.property-parser";

export async function getConnectedProperties(googleAccountId: number) {
  if (!googleAccountId) {
    const error = new Error("Missing google account ID") as any;
    error.statusCode = 400;
    error.body = { error: "Missing google account ID" };
    throw error;
  }

  const googleAccount = await GoogleAccountModel.findById(googleAccountId);

  if (!googleAccount || !googleAccount.organization_id) {
    const error = new Error("Organization not found") as any;
    error.statusCode = 404;
    error.body = { error: "Organization not found" };
    throw error;
  }

  const properties = parsePropertyIds(googleAccount.google_property_ids as any);

  return properties;
}

export async function updateProperty(
  googleAccountId: number,
  type: string,
  data: any,
  action: string
) {
  if (!googleAccountId) {
    const error = new Error("Missing google account ID") as any;
    error.statusCode = 400;
    error.body = { error: "Missing google account ID" };
    throw error;
  }

  const googleAccount = await GoogleAccountModel.findById(googleAccountId);

  if (!googleAccount) {
    const error = new Error("Account not found") as any;
    error.statusCode = 404;
    error.body = { error: "Account not found" };
    throw error;
  }

  const currentProperties = parsePropertyIds(
    googleAccount.google_property_ids as any
  );
  const updatedProperties = updatePropertyByType(
    currentProperties,
    type,
    data,
    action
  );

  await GoogleAccountModel.updatePropertyIds(
    googleAccountId,
    updatedProperties as unknown as Record<string, unknown>
  );

  return {
    properties: updatedProperties,
    message: `Successfully ${action}ed ${type.toUpperCase()} property`,
  };
}
