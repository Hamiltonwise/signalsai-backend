export class SettingsValidator {
  static validateValue(value: any): { valid: boolean; error?: string } {
    if (typeof value !== "string") {
      return { valid: false, error: "value must be a string" };
    }
    return { valid: true };
  }
}
