import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import {
  parsePropertyIds,
  updatePropertyByType,
} from "../feature-utils/util.property-parser";

export async function getConnectedProperties(organizationId: number) {
  if (!organizationId) {
    const error = new Error("Missing organization ID") as any;
    error.statusCode = 400;
    error.body = { error: "Missing organization ID" };
    throw error;
  }

  const googleConnection = await GoogleConnectionModel.findOneByOrganization(organizationId);

  if (!googleConnection) {
    const error = new Error("Organization not found") as any;
    error.statusCode = 404;
    error.body = { error: "Organization not found" };
    throw error;
  }

  const properties = parsePropertyIds(googleConnection.google_property_ids as any);

  return properties;
}

export async function updateProperty(
  organizationId: number,
  type: string,
  data: any,
  action: string
) {
  if (!organizationId) {
    const error = new Error("Missing organization ID") as any;
    error.statusCode = 400;
    error.body = { error: "Missing organization ID" };
    throw error;
  }

  const googleConnection = await GoogleConnectionModel.findOneByOrganization(organizationId);

  if (!googleConnection) {
    const error = new Error("Account not found") as any;
    error.statusCode = 404;
    error.body = { error: "Account not found" };
    throw error;
  }

  const currentProperties = parsePropertyIds(
    googleConnection.google_property_ids as any
  );
  const updatedProperties = updatePropertyByType(
    currentProperties,
    type,
    data,
    action
  );

  await GoogleConnectionModel.updatePropertyIds(
    googleConnection.id,
    updatedProperties as unknown as Record<string, unknown>
  );

  return {
    properties: updatedProperties,
    message: `Successfully ${action}ed ${type.toUpperCase()} property`,
  };
}
