import { BaseModel } from "./BaseModel";

export class PmNotificationModel extends BaseModel {
  protected static tableName = "pm_notifications";
  protected static jsonFields: string[] = ["metadata"];
}
