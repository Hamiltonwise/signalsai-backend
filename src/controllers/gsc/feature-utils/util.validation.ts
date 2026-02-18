/**
 * GSC Input Validation Utilities
 * Validates required inputs for GSC endpoints.
 */

/**
 * Validates that a domain property is present and non-empty.
 *
 * @param domainProperty - The domain property string to validate
 * @returns true if valid
 * @throws Error if domainProperty is missing or empty
 */
export const validateDomainProperty = (domainProperty: any): boolean => {
  if (!domainProperty) {
    throw new Error("No domain property included");
  }
  return true;
};

/**
 * Validates that an OAuth2 client is present on the request.
 *
 * @param oauth2Client - The OAuth2 client to validate
 * @returns true if valid
 * @throws Error if oauth2Client is missing
 */
export const validateOAuth2Client = (oauth2Client: any): boolean => {
  if (!oauth2Client) {
    throw new Error("OAuth2 client not initialized");
  }
  return true;
};
