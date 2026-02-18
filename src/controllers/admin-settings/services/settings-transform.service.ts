import type { IAdminSetting } from "../../../models/website-builder/AdminSettingModel";

export class SettingsTransformService {
  static groupByCategory(
    settings: IAdminSetting[]
  ): Record<string, Record<string, string>> {
    const data: Record<string, Record<string, string>> = {};
    for (const row of settings) {
      if (!data[row.category]) data[row.category] = {};
      data[row.category][row.key] = row.value;
    }
    return data;
  }
}
